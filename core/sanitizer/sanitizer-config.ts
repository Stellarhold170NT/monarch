/**
 * Config loader for Sanitizer.
 *
 * Loads a JSON config file that can:
 * - Toggle individual entity/sensitivity rules on/off
 * - Add custom regex patterns for proprietary/internal PII formats
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { EntityType } from "./entities.js";

/** Shape of each custom pattern entry in config. */
export interface CustomPatternConfig {
  /** Semantic name (will be treated as a CUSTOM entity type). */
  name: string;
  /** Regex string (e.g., "pod\/[a-z0-9-]+"). */
  pattern: string;
  /** Confidence 0–1 */
  confidence: number;
  /** Which engine should run this pattern. */
  engine: "regex" | "secrets";
  /** If secrets engine, use capture group 1. */
  useGroup?: boolean;
}

/** Shape of each rule toggle in config. */
export interface RuleConfig {
  enabled: boolean;
}

/** Top-level config shape. */
export interface SanitizerConfig {
  /** Global on/off toggle. When false, sanitize() returns text unchanged. */
  enabled?: boolean;
  mode?: "fast";
  /** What to do on detection: "redact" replaces with token, "warn" leaves as-is */
  onDetect?: "redact" | "warn";
  /** Per-entity rule overrides. Keys are `EntityType` values. */
  rules?: Partial<Record<EntityType, RuleConfig>>;
  /** Custom regex patterns to inject at startup. */
  customPatterns?: CustomPatternConfig[];
}

/** Options accepted by the Sanitizer constructor (same shape as config). */
export type SanitizerOptions = Partial<SanitizerConfig>;

/** Default config — everything enabled. */
export const DEFAULT_CONFIG: SanitizerConfig = {
  enabled: false,
  mode: "fast",
  onDetect: "redact",
  rules: {},
  customPatterns: [],
};

/**
 * Load a sanitizer config from a JSON file path.
 * ``configPath`` is resolved relative to ``process.cwd()`` or absolute.
 * Returns the default config if the file does not exist.
 */
export function loadConfig(configPath?: string): SanitizerConfig {
  if (!configPath) return { ...DEFAULT_CONFIG };

  const resolved = resolve(configPath);
  if (!existsSync(resolved)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = readFileSync(resolved, "utf-8");
    const parsed = JSON.parse(raw) as SanitizerConfig;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    // If parse fails, return default silently
    return { ...DEFAULT_CONFIG };
  }
}
