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

export const MONARCH_METADATA = {
  category: "utility",
  cost: "EXPENSIVE",
  promptAlias: "Monarch",
  triggers: [],
};

export function buildDynamicMonarchPrompt(
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

  logDebug(`Prompt sections: identity=${identityText.length}B, explore=${exploreText.length}B, exec=${execText.length}B, oracle=${oracleText.length}B, consensus=${consensusText.length}B, taskMgmt=${taskMgmtText.length}B, tone=${toneText.length}B`);
  logDebug(`Total prompt length: ${fullPrompt.length}B (${(fullPrompt.length / 1024).toFixed(1)}KB)`);

  return fullPrompt;
}

export function createMonarchAgent(
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

  const prompt = buildDynamicMonarchPrompt(
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
