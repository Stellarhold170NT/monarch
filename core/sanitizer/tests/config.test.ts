/**
 * Integration tests for config file → Sanitizer behavior pipeline.
 *
 * Verifies: sanitizer-config.json → loadConfig() → Sanitizer()
 * Ensures changes to the config file are accurately reflected in sanitizer behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { Sanitizer, loadConfig, DEFAULT_CONFIG } from "../index.js";
import { EntityType } from "../entities.js";

/**
 * Create a unique temp directory for each test to avoid cross-test pollution.
 */
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), "monarch-sanitizer-test-" + randomBytes(4).toString("hex"));
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

function writeConfig(data: Record<string, unknown>): string {
  const p = join(tmpDir, "sanitizer-config.json");
  writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
  return p;
}

describe("loadConfig()", () => {
  it("loads config from file and merges with defaults", () => {
    const path = writeConfig({ mode: "fast", onDetect: "warn" });
    const config = loadConfig(path);
    expect(config.mode).toBe("fast");
    expect(config.onDetect).toBe("warn");
    expect(config.rules).toEqual({});
    expect(config.customPatterns).toEqual([]);
  });

  it("returns default config when file does not exist", () => {
    const config = loadConfig(join(tmpDir, "nonexistent.json"));
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("returns default config when path is undefined", () => {
    const config = loadConfig(undefined);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("returns default config when JSON is malformed", () => {
    const p = join(tmpDir, "bad.json");
    writeFileSync(p, "{ bad json }", "utf-8");
    const config = loadConfig(p);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("preserves rule overrides from config file", () => {
    const path = writeConfig({
      rules: {
        EMAIL: { enabled: false },
        CREDIT_CARD: { enabled: false },
      },
    });
    const config = loadConfig(path);
    expect(config.rules!.EMAIL!.enabled).toBe(false);
    expect(config.rules!.CREDIT_CARD!.enabled).toBe(false);
  });

  it("preserves custom patterns from config file", () => {
    const path = writeConfig({
      customPatterns: [
        { name: "TEST_KEY", pattern: "test-[A-Z]+", confidence: 0.5, engine: "regex" },
      ],
    });
    const config = loadConfig(path);
    expect(config.customPatterns).toHaveLength(1);
    expect(config.customPatterns![0]!.name).toBe("TEST_KEY");
  });
});

describe("Config → Sanitizer behavior (end-to-end)", () => {
  it("disables email detection when config rules disable EMAIL", () => {
    const path = writeConfig({
      rules: { EMAIL: { enabled: false } },
    });
    const config = loadConfig(path);
    const s = new Sanitizer(config);

    const result = s.sanitize("My email is user@example.com");
    expect(result.text).toContain("user@example.com"); // not redacted
    expect(result.entities).toHaveLength(0);
  });

  it("disables credit card detection via config", () => {
    const path = writeConfig({
      rules: { CREDIT_CARD: { enabled: false } },
    });
    const config = loadConfig(path);
    const s = new Sanitizer(config);

    const result = s.sanitize("My card is 4111 1111 1111 1111");
    expect(result.text).toContain("4111"); // not redacted
    expect(result.entities).toHaveLength(0);
  });

  it("disables secret detection (JWT) via config", () => {
    const path = writeConfig({
      rules: { JWT_TOKEN: { enabled: false } },
    });
    const config = loadConfig(path);
    const s = new Sanitizer(config);

    const result = s.sanitize("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.abcdef");
    expect(result.text).toContain("eyJhbGci"); // not redacted
  });

  it("switches to warn mode via config", () => {
    const path = writeConfig({
      onDetect: "warn",
    });
    const config = loadConfig(path);
    const s = new Sanitizer(config);

    const result = s.sanitize("Email: user@example.com");
    expect(result.text).toBe("Email: user@example.com"); // unchanged
    expect(result.entities.length).toBeGreaterThan(0); // but still detected
  });

  it("applies custom pattern from config file", () => {
    const path = writeConfig({
      customPatterns: [
        {
          name: "INTERNAL_KEY",
          pattern: "INT-[A-Z0-9]{8}",
          confidence: 0.85,
          engine: "regex",
        },
      ],
    });
    const config = loadConfig(path);
    const s = new Sanitizer(config);

    const result = s.sanitize("My key: INT-ABCD1234");
    expect(result.text).toContain("[CUST_");
    expect(result.entities[0]!.entityType).toBe(EntityType.CUSTOM);
  });

  it("applies custom secret pattern from config file", () => {
    const path = writeConfig({
      customPatterns: [
        {
          name: "VAULT_TOKEN",
          pattern: "hvs\\.[A-Za-z0-9_-]+",
          confidence: 0.9,
          engine: "secrets",
        },
      ],
    });
    const config = loadConfig(path);
    const s = new Sanitizer(config);

    const result = s.sanitize("Token: hvs.abc123def456ghi789jkl");
    expect(result.text).toContain("[CUST_");
  });

  it("combines multiple config overrides simultaneously", () => {
    const path = writeConfig({
      onDetect: "redact",
      rules: {
        URL: { enabled: false }, // URLs not redacted
        EMAIL: { enabled: true }, // emails still redacted
      },
      customPatterns: [
        { name: "INTERNAL", pattern: "INT\\d{5}", confidence: 0.7, engine: "regex" },
      ],
    });
    const config = loadConfig(path);
    const s = new Sanitizer(config);

    const result = s.sanitize("Visit https://example.com, email a@b.com, code INT12345");
    // URL should not be redacted (disabled)
    expect(result.text).toContain("https://example.com");
    // Email still redacted (enabled)
    expect(result.text).not.toContain("a@b.com");
    // Custom pattern works
    expect(result.text).toContain("[CUST_");
    expect(result.text).toContain("[EMAI_");
  });
});

describe("DEFAULT_CONFIG", () => {
  it("has all rules enabled by default", () => {
    const s = new Sanitizer();
    const result = s.detect("user@example.com 4111 1111 1111 1111");
    expect(result.some((e) => e.entityType === EntityType.EMAIL)).toBe(true);
    expect(result.some((e) => e.entityType === EntityType.CREDIT_CARD)).toBe(true);
  });
});
