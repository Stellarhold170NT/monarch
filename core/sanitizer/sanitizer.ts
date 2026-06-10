/**
 * Sanitizer — PII & secrets detection + redaction for AI prompts.
 *
 * Based on prompt-sanitizer architecture, adapted for Monarch:
 * - FAST mode only (regex + secrets, zero deps)
 * - Config-driven rule toggling + custom patterns
 * - All operations synchronous
 */
import { EntityType } from "./entities.js";
import { Mode } from "./modes.js";
import type { SanitizeResult } from "./result.js";
import type { DetectedEntity } from "./result.js";
import { Vault } from "./vault.js";
import { Session } from "./session.js";
import { RegexEngine } from "./engines/regex-engine.js";
import { SecretsEngine } from "./engines/secrets-engine.js";
import { DEFAULT_CONFIG } from "./sanitizer-config.js";
import type { SanitizerConfig, SanitizerOptions } from "./sanitizer-config.js";

export class Sanitizer {
  public readonly config: Required<SanitizerConfig>;
  private readonly _regexEngine: RegexEngine;
  private readonly _secretsEngine: SecretsEngine;
  private readonly _vault: Vault;
  private _nextSeq = 0;

  constructor(options?: SanitizerOptions) {
    this.config = { ...DEFAULT_CONFIG, ...options } as Required<SanitizerConfig>;
    this._regexEngine = new RegexEngine();
    this._secretsEngine = new SecretsEngine();
    this._vault = new Vault();

    // Apply config — disable rules that are turned off
    if (this.config.rules) {
      const allEntities = Object.values(EntityType).filter(
        (v) => typeof v === "string",
      ) as EntityType[];
      for (const entity of allEntities) {
        const rule = this.config.rules[entity];
        if (rule !== undefined && rule.enabled === false) {
          this._regexEngine.setEnabled(entity, false);
          this._secretsEngine.setEnabled(entity, false);
        }
      }
    }

    // Add custom patterns from config
    if (this.config.customPatterns) {
      for (const cp of this.config.customPatterns) {
        const regex = cp.pattern instanceof RegExp ? cp.pattern : new RegExp(cp.pattern, "gi");
        if (cp.engine === "secrets") {
          this._secretsEngine.addPattern(
            EntityType.CUSTOM,
            regex,
            cp.confidence,
            cp.useGroup,
          );
        } else {
          this._regexEngine.addPattern(
            EntityType.CUSTOM,
            regex,
            cp.confidence,
          );
        }
      }
    }
  }

  /** Run detection only (no redaction). */
  detect(text: string): DetectedEntity[] {
    const results = [
      ...this._regexEngine.detect(text),
      ...this._secretsEngine.detect(text),
    ];
    return this._deduplicate(results);
  }

  /** Sanitize text: detect entities → replace with tokens. */
  sanitize(text: string): SanitizeResult {
    return this._run(text, this._vault);
  }

  /** Create a session tied to the sanitizer. */
  session(sessionId?: string): Session {
    return new Session(this, sessionId);
  }

  /**
   * Exposed for Session to use the shared vault path.
   * @internal
   */
  _run(
    text: string,
    vault: Vault,
    mode?: Mode,
    sessionId?: string,
  ): SanitizeResult {
    // Global toggle — if disabled, return text unchanged
    if (this.config.enabled === false) {
      return {
        text,
        original: text,
        entities: [],
        tokens: {},
        score: 0,
      };
    }

    mode = mode ?? Mode.FAST;
    const originalText = text;
    const tokens: Record<string, string> = {};

    // 1. Detect all entities
    const raw = [
      ...this._regexEngine.detect(text),
      ...this._secretsEngine.detect(text),
    ];
    const entities = this._deduplicate(raw);

    // 2. Sort by position (descending for safe substitution)
    entities.sort((a, b) => b.start - a.start);

    // 3. Replace or warn
    let resultText = originalText;
    const replacedIndices = new Set<number>();
    const resultEntities: DetectedEntity[] = [];

    for (const entity of entities) {
      // Skip already replaced positions (handles overlapping entities)
      if (replacedIndices.has(entity.start)) continue;
      replacedIndices.add(entity.start);

      if (this.config.onDetect === "redact") {
        const alreadyExists = vault.has(entity.value);
        const token = vault.add(entity.value, this._makeToken(entity, this._nextSeq));
        if (!alreadyExists) {
          this._nextSeq++;
        }
        entity.replacement = token;
        tokens[entity.value] = token;
        resultText = this._replaceAt(resultText, entity, token);
        resultEntities.push(entity);
      } else {
        // warn mode: track all entities (no text replacement)
        resultEntities.push(entity);
      }
    }

    // 4. Compute aggregate score (0–1)
    const totalWeight = resultEntities.reduce(
      (sum, e) => sum + e.confidence,
      0,
    );
    const maxWeight = resultEntities.length;
    const score = maxWeight > 0 ? Math.min(totalWeight / maxWeight, 1) : 0;

    return {
      text: resultText,
      original: originalText,
      entities: resultEntities,
      tokens,
      score,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _replaceAt(text: string, entity: DetectedEntity, token: string): string {
    return text.slice(0, entity.start) + token + text.slice(entity.end);
  }

  private _makeToken(entity: DetectedEntity, seq: number): string {
    const short = entity.entityType
      .replace(/_/g, "")
      .slice(0, 4)
      .toUpperCase();
    return `[${short}_${seq}]`;
  }

  /**
   * De-duplicate overlapping detections.
   * Keep the higher-confidence one; if same confidence, keep the first (shorter).
   */
  private _deduplicate(entities: DetectedEntity[]): DetectedEntity[] {
    const sorted = [...entities].sort((a, b) => a.start - b.start || a.end - b.end);
    const merged: DetectedEntity[] = [];

    for (const entity of sorted) {
      const last = merged[merged.length - 1];
      if (last && this._overlaps(last, entity)) {
        if (entity.confidence > last.confidence) {
          merged[merged.length - 1] = entity;
        }
        // else keep the existing one
      } else {
        merged.push(entity);
      }
    }

    return merged;
  }

  private _overlaps(a: DetectedEntity, b: DetectedEntity): boolean {
    return a.start < b.end && b.start < a.end;
  }

  /** Restore replacement tokens back to originals. */
  restore(text: string): string {
    return this._vault.restore(text);
  }

  /** Clear the main vault. */
  clear(): void {
    this._vault.clear();
  }
}
