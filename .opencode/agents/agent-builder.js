/**
 * Helper to generate standard tool restrictions.
 * Denies specified tools for the agent.
 */
export function createAgentToolRestrictions(deniedTools) {
  const tools = {};
  for (const tool of deniedTools) {
    tools[tool] = false;
  }
  return { tools };
}

/**
 * Merges base agent configuration with custom overrides.
 */
export function mergeAgentConfig(base, override) {
  if (!override) return base;

  const merged = { ...base, ...override };

  // Merge tools object if present in both
  if (base.tools && override.tools) {
    merged.tools = { ...base.tools, ...override.tools };
  }

  // Handle prompt appending if prompt_append is specified
  if (override.prompt_append && base.prompt) {
    merged.prompt = base.prompt + "\n" + override.prompt_append;
  }

  return merged;
}
