import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createIgrisAgent, IGRIS_METADATA } from './igris.js';
import { createMonarchAgent, MONARCH_METADATA } from './monarch-orchestrator.js';
import { mergeAgentConfig } from './agent-builder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function logToDebug(directory, message) {
  try {
    const logPath = path.join(directory, 'v-agent-debug.log');
    fs.appendFileSync(logPath, `[AGENT-REGISTRY] ${message}\n`, 'utf8');
  } catch (e) {}
}

/**
 * Loads full content of monarch-config.json.
 */
function loadMonarchConfig(directory) {
  const configPath = path.join(directory, '.opencode', 'monarch-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      console.warn(`[Monarch] Error reading monarch-config.json: ${e.message}`);
    }
  }
  return {};
}

/**
 * Loads user/project level agent overrides from monarch-config.json if it exists.
 */
function loadLocalOverrides(directory) {
  const config = loadMonarchConfig(directory);
  return config.agents || {};
}

/**
 * Rich default categories for delegation guide.
 */
const DEFAULT_CATEGORIES = {
  "visual-engineering": { description: "Frontend, UI/UX, styling, animations, layout, design tasks" },
  "ultrabrain": { description: "Hard logic, architecture decisions, algorithms, complex reasoning" },
  "deep": { description: "Autonomous research, multi-step problem-solving, end-to-end implementation" },
  "quick": { description: "Single-file typo, trivial config change, simple modifications" },
};

/**
 * Loads categories from monarch-config.json with defaults.
 */
function loadCategories(directory) {
  const config = loadMonarchConfig(directory);
  if (config.categories && Object.keys(config.categories).length > 0) {
    return config.categories;
  }
  return DEFAULT_CATEGORIES;
}

/**
 * Discovers available skills by scanning skill directories for SKILL.md files.
 * Falls back to a basic list from monarch-config.json if available.
 * Also scans registered OpenCode skill paths (config.skills.paths).
 */
function loadSkills(directory, registeredPaths = []) {
  const config = loadMonarchConfig(directory);
  if (Array.isArray(config.skills)) {
    return config.skills;
  }

  // Scan skill directories for basic info
  const skills = [];
  const seen = new Set();
  const searchPaths = [
    path.join(directory, '.agents', 'skills'),
    path.join(directory, '.opencode', 'skills'),
    ...registeredPaths,
  ];

  for (const dir of searchPaths) {
    if (fs.existsSync(dir)) {
      try {
        for (const entry of fs.readdirSync(dir)) {
          const skillDir = path.join(dir, entry);
          if (fs.statSync(skillDir).isDirectory()) {
            const skillMd = path.join(skillDir, 'SKILL.md');
            if (fs.existsSync(skillMd) && !seen.has(entry)) {
              seen.add(entry);
              const content = fs.readFileSync(skillMd, 'utf8');
              const match = content.match(/^---\n[\s\S]*?description:\s*(.+)\n[\s\S]*?\n---/);
              const location = dir.includes('.agents') ? 'user' : 'project';
              skills.push({
                name: entry,
                description: match ? match[1].trim() : '',
                location,
              });
            }
          }
        }
      } catch (e) {}
    }
  }

  return skills;
}

/**
 * Registers all custom agents into OpenCode's configuration object.
 */
export async function registerAgents(config, directory) {
  logToDebug(directory, "registerAgents started");
  config.agent = config.agent || {};

  config.default_agent = "monarch";

  // Resolve current active model (fall back to MiniMax in opencode.json)
  const currentModel = config.model || "MiniMax/MiniMax-M2.7";
  logToDebug(directory, `config.model resolved to: ${currentModel}`);

  // Load overrides from opencode.json (config.agents) and monarch-config.json
  const opencodeJsonOverrides = config.agents || {};
  const localOverrides = loadLocalOverrides(directory);

  logToDebug(directory, `opencode.json agent overrides: ${JSON.stringify(Object.keys(opencodeJsonOverrides))}`);
  logToDebug(directory, `monarch-config.json agent overrides: ${JSON.stringify(Object.keys(localOverrides))}`);

  // Merge overrides
  const allOverrides = { ...opencodeJsonOverrides, ...localOverrides };

  const availableAgents = [
    {
      name: "igris",
      description: IGRIS_METADATA.description,
      metadata: IGRIS_METADATA,
    },
    {
      name: "monarch",
      description: "Main orchestrator agent for planning and execution.",
      metadata: MONARCH_METADATA,
    }
  ];

  const tools = config.tools ? Object.keys(config.tools) : [];
  const skills = loadSkills(directory, config.skills?.paths || []);
  const rawCategories = loadCategories(directory);
  const categories = Object.entries(rawCategories).map(([name, cat]) => ({
    name,
    description: cat.description || "Domain-optimized task execution"
  }));
  const useTaskSystem = config.useTaskSystem || false;

  logToDebug(directory, `tools[${tools.length}]: ${tools.join(', ')}`);
  logToDebug(directory, `skills[${skills.length}]: ${skills.map(s => typeof s === 'object' ? `${s.name}(${s.location})` : s).join(', ')}`);
  logToDebug(directory, `categories[${categories.length}]: ${categories.map(c => c.name).join(', ')}`);
  logToDebug(directory, `useTaskSystem: ${useTaskSystem}`);

  // Registry of agent names to their factories
  const agentFactories = {
    monarch: async (model) => createMonarchAgent(model, availableAgents, tools, skills, categories, useTaskSystem),
    igris: (model) => createIgrisAgent(model),
  };

  // Generate and register each agent configuration
  for (const [name, factory] of Object.entries(agentFactories)) {
    try {
      logToDebug(directory, `Building agent config for: ${name}`);
      // 1. Build default config from factory
      let agentConfig = await factory(currentModel);

      // 2. Merge overrides if defined
      const override = allOverrides[name];
      if (override) {
        logToDebug(directory, `  Merging overrides for ${name}: ${JSON.stringify(override)}`);
        agentConfig = mergeAgentConfig(agentConfig, override);
        logToDebug(directory, `  After override: prompt.len=${agentConfig.prompt ? agentConfig.prompt.length + 'B' : 'MISSING'}`);
      } else {
        logToDebug(directory, `  No overrides for ${name}`);
      }

      // 3. Assign to target configuration key
      config.agent[name] = agentConfig;
      logToDebug(directory, `Successfully registered agent: ${name}`);
      logToDebug(directory, `  Agent config: displayName=${agentConfig.displayName}, mode=${agentConfig.mode}, model=${agentConfig.model}, prompt.len=${agentConfig.prompt ? agentConfig.prompt.length + 'B' : 'MISSING'}, permission=${JSON.stringify(agentConfig.permission || {})}`);
    } catch (e) {
      logToDebug(directory, `Error registering agent ${name}: ${e.message}\n${e.stack}`);
    }
  }
}
