/**
 * Superpowers plugin for OpenCode.ai
 *
 * Injects superpowers bootstrap context via system prompt transform.
 * Auto-registers skills directory via config hook (no symlinks needed).
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

// --- ADDED IMPORT ---
import { initVCorpRoles } from './lib/setup.js';
import { handleConfigPaths } from './lib/config-handler.js';
import { handleMessageTransform } from './lib/message-transformer.js';
import { handleSessionIdle } from './lib/loop-handler.js';
import { initSanitizer } from './lib/sanitizer-init.js';
// --------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const getLogFilePath = (directory) => {
  const containerLogDir = '/logs/agent';
  try {
    if (fs.existsSync(containerLogDir) && fs.statSync(containerLogDir).isDirectory()) {
      return path.join(containerLogDir, 'v-agent-debug.log');
    }
  } catch (e) {}
  return path.join(directory, 'v-agent-debug.log');
};

// Simple frontmatter extraction (avoid dependency on skills-core for bootstrap)
const extractAndStripFrontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, content };

  const frontmatterStr = match[1];
  const body = match[2];
  const frontmatter = {};

  for (const line of frontmatterStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
      frontmatter[key] = value;
    }
  }

  return { frontmatter, content: body };
};

// Normalize a path: trim whitespace, expand ~, resolve to absolute
const normalizePath = (p, homeDir) => {
  if (!p || typeof p !== 'string') return null;
  let normalized = p.trim();
  if (!normalized) return null;
  if (normalized.startsWith('~/')) {
    normalized = path.join(homeDir, normalized.slice(2));
  } else if (normalized === '~') {
    normalized = homeDir;
  }
  return path.resolve(normalized);
};

// Module-level cache for bootstrap content.
// The SKILL.md file does not change during a session, so reading + parsing it
// once eliminates redundant fs.existsSync + fs.readFileSync + regex work on
// every agent step.  See #1202 for the full analysis.
let _bootstrapCache = undefined; // undefined = not yet loaded, null = file missing

export const SuperpowersPlugin = async ({ client, directory }) => {
  const homeDir = os.homedir();
  const superpowersSkillsDir = path.resolve(__dirname, '../../skills');
  const envConfigDir = normalizePath(process.env.OPENCODE_CONFIG_DIR, homeDir);
  const configDir = envConfigDir || path.join(homeDir, '.config/opencode');

  // --- ADDED setup ---
  const vcorp = initVCorpRoles(directory, configDir);
  const { sanitizer } = initSanitizer(directory, path.join(directory, 'core', 'sanitizer'));

  // Wrap sanitizer.sanitize to log all redaction activity to debug log
  if (sanitizer && typeof sanitizer.sanitize === 'function') {
    const _originalSanitize = sanitizer.sanitize.bind(sanitizer);
    sanitizer.sanitize = (text) => {
      const result = _originalSanitize(text);
      if (result.score > 0) {
        const entityTypes = [...new Set(result.entities.map(e => e.entityType))];
        try {
          fs.appendFileSync(
            getLogFilePath(directory),
            `[SANITIZER] Redacted ${result.entities.length} entities | score=${result.score.toFixed(2)} | types=[${entityTypes.join(', ')}]\n`,
            'utf8'
          );
        } catch (e) {}
      }
      return result;
    };
  }

  try {
    fs.writeFileSync(getLogFilePath(directory), `[INIT] V-Agent Debug Log Initialized\n`, 'utf8');
  } catch (e) {}
  // -------------------

  // Helper to generate bootstrap content (cached after first call)
  const getBootstrapContent = () => {
    // Return cached result on subsequent calls
    if (_bootstrapCache !== undefined) return _bootstrapCache;

    // Try to load using-superpowers skill
    const skillPath = path.join(superpowersSkillsDir, 'using-superpowers', 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      _bootstrapCache = null;
      return null;
    }

    const fullContent = fs.readFileSync(skillPath, 'utf8');
    const { content } = extractAndStripFrontmatter(fullContent);

    const toolMapping = `**Tool Mapping for OpenCode:**
When skills reference tools you don't have, substitute OpenCode equivalents:
- \`TodoWrite\` → \`todowrite\`
- \`Task\` tool with subagents → Use OpenCode's subagent system (@mention)
- \`Skill\` tool → OpenCode's native \`skill\` tool
- \`Read\`, \`Write\`, \`Edit\`, \`Bash\` → Your native tools

Use OpenCode's native \`skill\` tool to list and load skills.`;

    _bootstrapCache = `<EXTREMELY_IMPORTANT>
You have superpowers.

**IMPORTANT: The using-superpowers skill content is included below. It is ALREADY LOADED - you are currently following it. Do NOT use the skill tool to load "using-superpowers" again - that would be redundant.**

${content}

${toolMapping}
</EXTREMELY_IMPORTANT>`;

    return _bootstrapCache;
  };

  return {
    // Inject skills path into live config so OpenCode discovers superpowers skills
    // without requiring manual symlinks or config file edits.
    // This works because Config.get() returns a cached singleton — modifications
    // here are visible when skills are lazily discovered later.
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(superpowersSkillsDir)) {
        config.skills.paths.push(superpowersSkillsDir);
      }

      // Log raw config agent state BEFORE modification
      try {
        const logFile = getLogFilePath(directory);
        fs.appendFileSync(logFile, `[CONFIG-DEBUG] BEFORE agent modification. config.agent type=${typeof config.agent}, isArray=${Array.isArray(config.agent)}, keys=${config.agent ? Object.keys(config.agent).join(',') : 'N/A'}. config.default_agent=${config.default_agent}. config.model=${config.model}. config.agents=${config.agents ? typeof config.agents : 'N/A'}\n`, 'utf8');
      } catch(e) {}

      // --- ADDED CONFIG PATH ENHANCEMENT ---
      await handleConfigPaths(config, vcorp.roleDir, vcorp.roleJsonPath, superpowersSkillsDir, vcorp.vSkillsDir, vcorp.getDefinedRoles(), vcorp.debugLog);

      // Register workspace-level .agents/skills/ path for monarch's delegation guide
      const workspaceSkillsDir = path.resolve(directory, '..', '.agents', 'skills');
      if (fs.existsSync(workspaceSkillsDir) && !config.skills.paths.includes(workspaceSkillsDir)) {
        config.skills.paths.push(workspaceSkillsDir);
      }
      // -------------------------------------

      // --- ADDED AGENT CONFIG REGISTRATION ---
      try {
        fs.appendFileSync(getLogFilePath(directory), `[PLUGIN] Importing builtin-agents.js\n`, 'utf8');
        const { registerAgents } = await import('../agents/builtin-agents.js');
        await registerAgents(config, directory);
        fs.appendFileSync(getLogFilePath(directory), `[PLUGIN] registerAgents returned OK\n`, 'utf8');
      } catch (err) {
        try {
          fs.appendFileSync(getLogFilePath(directory), `[PLUGIN-ERROR] Error loading agents: ${err.message}\n${err.stack}\n`, 'utf8');
        } catch (e) {}
      }
      fs.appendFileSync(getLogFilePath(directory), `[PLUGIN] config hook returning. config.default_agent=${config.default_agent}\n`, 'utf8');
      // -------------------------------------
    },

    // --- ADDED EVENT HOOK ---
    event: async (input) => {
      try {
        const eventType = input.event?.type;
        // Skip high-frequency delta events that bloat the log
        if (eventType === 'message.part.delta') return;
        const props = input.event?.properties || {};
        let logMsg = `[EVENT-HOOK] type=${eventType}, properties keys=${Object.keys(props).join(',')}`;
        if (eventType === 'session.error') {
          // Log full error details
          const errorVal = props.error;
          if (errorVal) {
            if (typeof errorVal === 'object') {
              logMsg += `\n[EVENT-ERROR-DETAIL] message=${JSON.stringify(errorVal.message)}, stack=${JSON.stringify(errorVal.stack)}, toString=${JSON.stringify(errorVal.toString())}, keys=${Object.keys(errorVal).join(',')}`;
              // Try to enumerate all own properties
              for (const k of Object.getOwnPropertyNames(errorVal)) {
                try {
                  const v = errorVal[k];
                  if (typeof v !== 'function') {
                    // Serialize nested objects fully (depth 5 max)
                    let serialized;
                    try {
                      serialized = JSON.stringify(v, (key, val) => {
                        if (typeof val === 'object' && val !== null) {
                          return val; // Keep nested objects
                        }
                        return val;
                      }, 2).slice(0, 2000);
                    } catch (e2) {
                      serialized = `[unserializable: ${typeof v}]`;
                    }
                    logMsg += `\n[EVENT-ERROR-PROP] ${k}=${serialized}`;
                  }
                } catch (e2) {}
              }
            } else {
              logMsg += `\n[EVENT-ERROR-DETAIL] error=${JSON.stringify(errorVal)}`;
            }
          } else {
            logMsg += `\n[EVENT-ERROR-DETAIL] error is null/undefined`;
          }
          // Also log sessionID
          logMsg += `\n[EVENT-ERROR-DETAIL] sessionID=${JSON.stringify(props.sessionID)}`;
        }
        fs.appendFileSync(getLogFilePath(directory), logMsg + '\n', 'utf8');
      } catch (e) {}

      let isIdle = false;
      let sessionId = null;

      // Detailed human-readable logging for tools, skills, reasoning, and responses
      try {
        const props = input.event.properties || {};
        const logFile = getLogFilePath(directory);

        if (input.event.type === 'message.part.updated') {
          const part = props.part || {};
          if (part.type === 'tool') {
            const toolName = part.tool || '';
            const status = part.state?.status || 'unknown';
            const inputStr = JSON.stringify(part.state?.input || {});
            
            if (toolName === 'skill' || toolName === 'activate_skill') {
              fs.appendFileSync(logFile, `[SKILL USE via TOOL] Skill tool name: ${toolName}, Status: ${status}, Input: ${inputStr}\n`, 'utf8');
            } else {
              fs.appendFileSync(logFile, `[TOOL CALL] Tool: ${toolName}, Status: ${status}, Input: ${inputStr}\n`, 'utf8');
            }
            
            if (status === 'completed' && part.state?.output) {
              const outputPreview = part.state.output.length > 200 
                ? part.state.output.slice(0, 200) + '...' 
                : part.state.output;
              fs.appendFileSync(logFile, `[TOOL OUTPUT] Tool: ${toolName}, Preview: ${JSON.stringify(outputPreview)}\n`, 'utf8');
            }
          } else if (part.type === 'reasoning' && part.text) {
            fs.appendFileSync(logFile, `[THINKING] ${part.text}\n`, 'utf8');
          } else if (part.type === 'text' && part.text) {
            fs.appendFileSync(logFile, `[ASSISTANT RESPONSE] ${part.text}\n`, 'utf8');
          }
        }
      } catch (err) {}

      if (input.event.type === 'session.idle') {
        isIdle = true;
        const props = input.event.properties || {};
        const info = props.info || {};
        sessionId = props.sessionID || info.sessionID || info.id || props.id;
      } else if (input.event.type === 'session.status') {
        const props = input.event.properties || {};
        const status = props.status || {};
        if (status.type === 'idle') {
          isIdle = true;
          const info = props.info || {};
          sessionId = props.sessionID || info.sessionID || info.id || props.id;
        }
      }

      if (isIdle && sessionId) {
        try {
          fs.appendFileSync(getLogFilePath(directory), `[EVENT] Triggering loop for sessionId: ${sessionId}\n`, 'utf8');
        } catch (e) {}
        const loopJsonPath = path.join(vcorp.vSkillsDir, 'loop.json');
        try {
          await handleSessionIdle(client, directory, sessionId, loopJsonPath);
        } catch (err) {
          try {
            fs.appendFileSync(getLogFilePath(directory), `[EVENT-ERROR] handleSessionIdle failed: ${err.message}\n${err.stack}\n`, 'utf8');
          } catch (e) {}
        }
      }
    },
    // ------------------------

    // Inject bootstrap into the first user message of each session.
    // Using a user message instead of a system message avoids:
    //   1. Token bloat from system messages repeated every turn (#750)
    //   2. Multiple system messages breaking Qwen and other models (#894)
    //
    // The hook fires on every agent step (not just every turn) because
    // opencode's prompt.ts reloads messages from DB each step.  Fresh message
    // array may need injection again, so getBootstrapContent() must not do
    // repeated disk work.
    'experimental.chat.messages.transform': async (input, output) => {
      try {
        fs.appendFileSync(getLogFilePath(directory), `[TRANSFORM] Called. Input: ${JSON.stringify(input)}, Output messages count: ${output.messages?.length}\n`, 'utf8');
      } catch (e) {}

      // [DISABLED] Superpower bootstrap injection - redundant with Monarch's own prompt
      // const bootstrap = getBootstrapContent();
      // if (bootstrap && output.messages.length) {
      //   const firstUser = output.messages.find(m => m.info.role === 'user');
      //   if (firstUser && firstUser.parts.length) {
      //     if (!firstUser.parts.some(p => p.type === 'text' && p.text.includes('EXTREMELY_IMPORTANT'))) {
      //       const ref = firstUser.parts[0];
      //       firstUser.parts.unshift({ ...ref, type: 'text', text: bootstrap });
      //       try {
      //         fs.appendFileSync(getLogFilePath(directory), `[SKILL LOADED] Injected bootstrap skill 'using-superpowers' into the first user message.\n`, 'utf8');
      //       } catch (e) {}
      //     }
      //   }
      // }

      // --- ADDED TRANSFORMATION/SAFEGUARDS ---
      try {
        await handleMessageTransform(input, output, {
          roleJsonPath: vcorp.roleJsonPath,
          roleDir: vcorp.roleDir,
          definedRoles: vcorp.getDefinedRoles(),
          sanitizer,
          debugLog: (msg) => {
            try {
              fs.appendFileSync(getLogFilePath(directory), `[VCORP-TRANSFORM] ${msg}\n`, 'utf8');
            } catch (e) {}
          },
          getBootstrapContent,
          superpowersSkillsDir,
          loopJsonPath: path.join(vcorp.vSkillsDir, 'loop.json')
        });
      } catch (err) {
        try {
          fs.appendFileSync(getLogFilePath(directory), `[TRANSFORM-ERROR] ${err.message}\n${err.stack}\n`, 'utf8');
        } catch (e) {}
      }
      // ----------------------------------------
    }
  };
};
