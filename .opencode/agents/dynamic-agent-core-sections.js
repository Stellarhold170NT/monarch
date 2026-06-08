export function categorizeTools(toolNames) {
  return toolNames.map((name) => {
    let category = "other";
    if (name.startsWith("lsp_")) {
      category = "lsp";
    } else if (name.startsWith("ast_grep")) {
      category = "ast";
    } else if (name === "grep" || name === "glob") {
      category = "search";
    } else if (name.startsWith("session_")) {
      category = "session";
    } else if (name === "skill") {
      category = "command";
    }
    return { name, category };
  });
}

function formatToolsForPrompt(tools) {
  const lspTools = tools.filter((tool) => tool.category === "lsp");
  const astTools = tools.filter((tool) => tool.category === "ast");
  const searchTools = tools.filter((tool) => tool.category === "search");

  const parts = [];

  if (searchTools.length > 0) {
    parts.push(...searchTools.map((tool) => `\`${tool.name}\``));
  }

  if (lspTools.length > 0) {
    parts.push("`lsp_*`");
  }

  if (astTools.length > 0) {
    parts.push("`ast_grep`");
  }

  return parts.join(", ");
}

export function getToolsPromptDisplay(tools) {
  return formatToolsForPrompt(tools);
}

export function buildAgentIdentitySection(agentName, roleDescription) {
  return `<agent-identity>
Your designated identity for this session is "${agentName}". This identity supersedes any prior identity statements.
You are "${agentName}" - ${roleDescription}.
When asked who you are, always identify as ${agentName}. Do not identify as any other assistant or AI.
</agent-identity>`;
}

export function buildKeyTriggersSection(agents, _skills = []) {
  const keyTriggers = agents
    .filter((agent) => agent.metadata && agent.metadata.keyTrigger)
    .map((agent) => `- ${agent.metadata.keyTrigger}`);

  if (keyTriggers.length === 0) {
    return "";
  }

  return `### Key Triggers (check BEFORE classification):

${keyTriggers.join("\n")}
- **"Look into" + "create PR"** → Not just research. Full implementation cycle expected.`;
}

export function buildToolSelectionTable(agents, tools = [], _skills = []) {
  const rows = ["### Tool & Agent Selection:", ""];

  if (tools.length > 0) {
    rows.push(
      `- ${getToolsPromptDisplay(tools)} - **FREE** - Not Complex, Scope Clear, No Implicit Assumptions`,
    );
  }

  const costOrder = { FREE: 0, CHEAP: 1, EXPENSIVE: 2 };
  const sortedAgents = [...agents]
    .filter((agent) => agent.metadata && agent.metadata.category !== "utility")
    .sort((left, right) => {
      const leftCost = left.metadata ? left.metadata.cost : "FREE";
      const rightCost = right.metadata ? right.metadata.cost : "FREE";
      return (costOrder[leftCost] ?? 0) - (costOrder[rightCost] ?? 0);
    });

  for (const agent of sortedAgents) {
    const shortDescription = agent.description.split(".")[0] || agent.description;
    const agentCost = agent.metadata ? agent.metadata.cost : "FREE";
    rows.push(
      `- \`${agent.name}\` agent - **${agentCost}** - ${shortDescription}`,
    );
  }

  rows.push("");
  rows.push("**Default flow**: explore/librarian (background) + tools → igris (if required)");

  return rows.join("\n");
}

export function buildExploreSection(agents) {
  const exploreAgent = agents.find((agent) => agent.name === "explore");
  if (!exploreAgent || !exploreAgent.metadata) {
    return "";
  }

  const useWhen = exploreAgent.metadata.useWhen || [];
  const avoidWhen = exploreAgent.metadata.avoidWhen || [];

  return `### Explore Agent = Contextual Grep

Use it as a **peer tool**, not a fallback. Fire liberally for discovery, not for files you already know.

**Delegation Trust Rule:** Once you fire an explore agent for a search, do **not** manually perform that same search yourself. Use direct tools only for non-overlapping work or when you intentionally skipped delegation.

**Use Direct Tools when:**
${avoidWhen.map((entry) => `- ${entry}`).join("\n")}

**Use Explore Agent when:**
${useWhen.map((entry) => `- ${entry}`).join("\n")}`;
}

export function buildLibrarianSection(agents) {
  const librarianAgent = agents.find((agent) => agent.name === "librarian");
  if (!librarianAgent || !librarianAgent.metadata) {
    return "";
  }

  const useWhen = librarianAgent.metadata.useWhen || [];

  return `### Librarian Agent = Reference Grep

Search **external references** (docs, OSS, web). Fire proactively when unfamiliar libraries are involved.

**Contextual Grep (Internal)** - search OUR codebase, find patterns in THIS repo, project-specific logic.
**Reference Grep (External)** - search EXTERNAL resources, official API docs, library best practices, OSS implementation examples.

**Trigger phrases** (fire librarian immediately):
${useWhen.map((entry) => `- "${entry}"`).join("\n")}`;
}

export function buildDelegationTable(agents) {
  const rows = ["### Delegation Table:", ""];

  for (const agent of agents) {
    if (agent.metadata && agent.metadata.triggers) {
      for (const trigger of agent.metadata.triggers) {
        rows.push(`- **${trigger.domain}** → \`${agent.name}\` - ${trigger.trigger}`);
      }
    }
  }

  return rows.join("\n");
}

export function buildIgrisSection(agents) {
  const igrisAgent = agents.find((agent) => agent.name === "igris");
  if (!igrisAgent || !igrisAgent.metadata) {
    return "";
  }

  const useWhen = igrisAgent.metadata.useWhen || [];
  const avoidWhen = igrisAgent.metadata.avoidWhen || [];

  return `<Igris_Usage>
## Igris - Read-Only High-IQ Consultant

Igris is a read-only, expensive, high-quality reasoning model for debugging and architecture. Consultation only.

### WHEN to Consult (Igris FIRST, then implement):

${useWhen.map((entry) => `- ${entry}`).join("\n")}

### WHEN NOT to Consult:

${avoidWhen.map((entry) => `- ${entry}`).join("\n")}

### Usage Pattern:
Briefly announce "Consulting Igris for [reason]" before invocation.

**Exception**: This is the ONLY case where you announce before acting. For all other work, start immediately without status updates.

### Igris Background Task Policy:

**Collect Igris results before your final answer. No exceptions.**

**Igris-dependent implementation is BLOCKED until Igris finishes.**

- If you asked Igris for architecture/debugging direction that affects the fix, do not implement before Igris result arrives.
- While waiting, only do non-overlapping prep work. Never ship implementation decisions Igris was asked to decide.
- Never "time out and continue anyway" for Igris-dependent tasks.

- Igris takes minutes. When done with your own work: **end your response** - wait for the \`<system-reminder>\`.
- Do NOT poll \`background_output\` on a running Igris. The notification will come.
- Never cancel Igris.
</Igris_Usage>`;
}

export function buildConsensusSection(tools) {
  const hasConsensus = tools.some((tool) => tool.name === "consensus");
  if (!hasConsensus) {
    return "";
  }

  return `<Consensus_Usage>
## Consensus - Multi-Lineage Voter Panel

The \`consensus\` tool spawns N voters (default 3) from DIFFERENT model families (Anthropic / OpenAI / Google / open-source), gives each the same question in parallel, and returns their positions to YOU. You are the synthesizer: read each position, find agreement vs disagreement, and decide. It is restricted to the main agent (subagents cannot call it).

### WHEN to Consult:

- High-stakes architecture or design decisions where one model's blind spot could be costly.
- Validating analyzed or extracted data before you trust it (does an independent panel reach the same reading?).
- Interpreting ambiguous test output or verifying that a fix actually resolves the issue.
- Any irreversible or expensive call where a second and third independent opinion materially de-risks the decision.

### WHEN NOT to Consult:

- Trivial, reversible, or low-stakes choices (naming, formatting, obvious fixes).
- Things you can determine directly from code you have already read.
- As a substitute for Igris on deep debugging - Igris is the single high-IQ specialist; consensus is a diversity-of-lineages panel. Use Igris for hard reasoning, consensus for cross-model agreement on a decision.

### How to Synthesize:

- If voters agree: proceed with the agreed position.
- If voters disagree materially: present all positions to the user; do not silently pick one and discard the dissent.
- Treat a single-voter (advisory) result as one extra opinion, not a true consensus.
</Consensus_Usage>`;
}

export function buildFrontendGuidanceSection(categories) {
  const hasVisualEngineeringCategory = categories.some(
    (category) => category.name === "visual-engineering",
  );
  if (hasVisualEngineeringCategory) {
    return "";
  }

  return `# Frontend Tasks

When you must touch frontend code yourself: avoid generic AI-SaaS aesthetics. Choose a clear visual direction with CSS variables (no purple-on-white default, no dark-mode default). Use expressive, purposeful typography rather than default stacks (Inter, Roboto, Arial, system). Build atmosphere through gradients, shapes, or subtle patterns rather than flat single-color backgrounds. Use a few meaningful animations (page-load, staggered reveals) over generic micro-motion. Verify both desktop and mobile rendering. If working within an existing design system, preserve its patterns instead.`;
}

export function buildNonClaudePlannerSection(model) {
  const isNonClaude = !model.toLowerCase().includes("claude");
  if (isNonClaude) {
    return "";
  }

  return `### Plan Agent Dependency (Non-Claude)

Multi-step task? **ALWAYS consult Plan Agent first.** Do NOT start implementation without a plan.

- Single-file fix or trivial change → proceed directly
- Anything else (2+ steps, unclear scope, architecture) → \`task(subagent_type="plan", ...)\` FIRST
- Use \`task_id\` to resume the same Plan Agent - ask follow-up questions aggressively
- If ANY part of the task is ambiguous, ask Plan Agent before guessing

Plan Agent returns a structured work breakdown with parallel execution opportunities. Follow it.`;
}

export function buildParallelDelegationSection(model, categories) {
  const isNonClaude = !model.toLowerCase().includes("claude");
  const hasDelegationCategory = categories.some(
    (category) => category.name === "deep" || category.name === "unspecified-high",
  );

  if (!isNonClaude || !hasDelegationCategory) {
    return "";
  }

  return `### DECOMPOSE AND DELEGATE - YOU ARE NOT AN IMPLEMENTER

**YOUR FAILURE MODE: You attempt to do work yourself instead of decomposing and delegating.** When you implement directly, the result is measurably worse than when specialized subagents do it. Subagents have domain-specific configurations, loaded skills, and tuned prompts that you lack.

**MANDATORY - for ANY implementation task:**

1. **ALWAYS decompose** the task into independent work units. No exceptions. Even if the task "feels small", decompose it.
2. **ALWAYS delegate** EACH unit to a \`deep\` or \`unspecified-high\` agent in parallel (\`run_in_background=true\`).
3. **NEVER work sequentially.** If 4 independent units exist, spawn 4 agents simultaneously. Not 1 at a time. Not 2 then 2.
4. **NEVER implement directly** when delegation is possible. You write prompts, not code.

**YOUR PROMPT TO EACH AGENT MUST INCLUDE:**
- GOAL with explicit success criteria (what "done" looks like)
- File paths and constraints (where to work, what not to touch)
- Existing patterns to follow (reference specific files the agent should read)
- Clear scope boundary (what is IN scope, what is OUT of scope)

**Vague delegation = failed delegation.** If your prompt to the subagent is shorter than 5 lines, it is too vague.

| You Want To Do | You MUST Do Instead |
|---|---|
| Write code yourself | Delegate to \`deep\` or \`unspecified-high\` agent |
| Handle 3 changes sequentially | Spawn 3 agents in parallel |
| "Quickly fix this one thing" | Still delegate - your "quick fix" is slower and worse than a subagent's |

**Your value is orchestration, decomposition, and quality control. Delegating with crystal-clear prompts IS your work.**`;
}
