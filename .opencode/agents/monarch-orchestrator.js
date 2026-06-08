import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildMonarchDynamicPromptSections } from "./monarch-dynamic-prompt-sections.js";
import { renderRoleAndIntentSections } from "./monarch-dynamic-prompt-role.js";
import { renderExplorationSection } from "./monarch-dynamic-prompt-exploration.js";
import { renderExecutionSections } from "./monarch-dynamic-prompt-execution.js";
import { renderToneAndConstraintsSection } from "./monarch-dynamic-prompt-style.js";
import { categorizeTools } from "./dynamic-agent-core-sections.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const _logPath = path.resolve(__dirname, '../../v-agent-debug.log');

function logDebug(msg) {
  try {
    fs.appendFileSync(_logPath, `[PROMPT-BUILDER] ${msg}\n`, 'utf8');
  } catch (e) {}
}

let _encoder = null;
async function getEncoder() {
  if (_encoder) return _encoder;
  try {
    const { getEncoding } = await import('js-tiktoken');
    _encoder = getEncoding('cl100k_base');
  } catch (e) {
    logDebug(`tiktoken load failed: ${e.message}, falling back to approx`);
  }
  return _encoder;
}

async function countTokens(text) {
  if (!text) return 0;
  const enc = await getEncoder();
  if (enc) {
    try { return enc.encode(text).length; } catch {}
  }
  return Math.ceil(text.length / 4);
}

export const MONARCH_METADATA = {
  category: "utility",
  cost: "EXPENSIVE",
  promptAlias: "Monarch",
  triggers: [],
};

export async function buildDynamicMonarchPrompt(
  model,
  availableAgents,
  availableTools = [],
  availableSkills = [],
  availableCategories = [],
  useTaskSystem = false
) {
  logDebug(`buildDynamicMonarchPrompt: model=${model}, agents=${availableAgents.length}, tools=${availableTools.length}, skills=${availableSkills.length}, categories=${availableCategories.length}, useTaskSystem=${useTaskSystem}`);

  const sections = buildMonarchDynamicPromptSections(
    model,
    availableAgents,
    availableTools,
    availableSkills,
    availableCategories,
    useTaskSystem
  );

  const identityText = renderRoleAndIntentSections(sections);
  const exploreText = renderExplorationSection(sections);
  const execText = renderExecutionSections(sections);
  const oracleText = sections.oracleSection || '';
  const consensusText = sections.consensusSection || '';
  const taskMgmtText = sections.taskManagementSection || '';
  const toneText = renderToneAndConstraintsSection(sections);

  const fullPrompt = `${identityText}\n\n${exploreText}\n\n${execText}\n\n${oracleText}\n\n${consensusText}\n\n${taskMgmtText}\n\n${toneText}`;

  const [identityTok, exploreTok, execTok, oracleTok, consensusTok, taskMgmtTok, toneTok, totalTok] = await Promise.all([
    countTokens(identityText),
    countTokens(exploreText),
    countTokens(execText),
    countTokens(oracleText),
    countTokens(consensusText),
    countTokens(taskMgmtText),
    countTokens(toneText),
    countTokens(fullPrompt),
  ]);

  logDebug(`Prompt sections: identity=${identityText.length}B/${identityTok}tok, explore=${exploreText.length}B/${exploreTok}tok, exec=${execText.length}B/${execTok}tok, oracle=${oracleText.length}B/${oracleTok}tok, consensus=${consensusText.length}B/${consensusTok}tok, taskMgmt=${taskMgmtText.length}B/${taskMgmtTok}tok, tone=${toneText.length}B/${toneTok}tok`);
  logDebug(`Total prompt length: ${fullPrompt.length}B (${totalTok}tok, ${(fullPrompt.length / 1024).toFixed(1)}KB)`);

  return fullPrompt;
}

export async function createMonarchAgent(
  model,
  availableAgents = [],
  availableToolNames = [],
  availableSkills = [],
  availableCategories = [],
  useTaskSystem = false
) {
  const tools = availableToolNames ? categorizeTools(availableToolNames) : [];
  const skills = availableSkills ?? [];
  const categories = availableCategories ?? [];
  const agents = availableAgents ?? [];

  const prompt = await buildDynamicMonarchPrompt(
    model,
    agents,
    tools,
    skills,
    categories,
    useTaskSystem
  );

  return {
    displayName: "Monarch",
    description: "Powerful AI orchestrator. Plans obsessively with todos, assesses search complexity before exploration, delegates strategically via category+skills combinations. Uses explore for internal code (parallel-friendly), librarian for external docs. (Monarch)",
    mode: "primary",
    model: model,
    temperature: 0.2,
    prompt: prompt,
    color: "#00CED1",
    permission: {
      question: "allow",
      call_omo_agent: "deny",
    }
  };
}
