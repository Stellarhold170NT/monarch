/**
 * Monarch Sanitizer — PII & secrets detection for AI prompts.
 *
 * Public API surface.
 */

export { Sanitizer } from "./sanitizer.js";
export { Session } from "./session.js";
export { Vault } from "./vault.js";
export { RegexEngine } from "./engines/regex-engine.js";
export { SecretsEngine } from "./engines/secrets-engine.js";
export { EntityType } from "./entities.js";
export { Mode } from "./modes.js";
export { loadConfig, DEFAULT_CONFIG } from "./sanitizer-config.js";
export type {
  DetectedEntity,
  SanitizeResult,
} from "./result.js";
export type {
  SanitizerConfig,
  SanitizerOptions,
  CustomPatternConfig,
  RuleConfig,
} from "./sanitizer-config.js";
