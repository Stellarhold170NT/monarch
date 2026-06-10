import { describe, it, expect } from "vitest";
import { initSanitizer } from "../sanitizer-init.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testConfigDir = path.join(__dirname, "_test-config");

describe("sanitizer-init integration", () => {
  it("creates default config file if not exists", () => {
    // Clean up test dir if exists
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }

    // Initialize (should create config file)
    const { sanitizer, configPath } = initSanitizer(__dirname, testConfigDir);

    expect(sanitizer).toBeDefined();
    expect(configPath).toBeDefined();
    expect(fs.existsSync(configPath)).toBe(true);

    // Verify config content
    const configContent = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(configContent.mode).toBe("fast");
    expect(configContent.rules.EMAIL.enabled).toBe(true);

    // Cleanup
    fs.rmSync(testConfigDir, { recursive: true, force: true });
  });

  it("uses existing config file", () => {
    // Create test config dir
    fs.mkdirSync(testConfigDir, { recursive: true });
    const sanitizerDir = path.join(testConfigDir, "sanitizer");
    fs.mkdirSync(sanitizerDir, { recursive: true });
    const configPath = path.join(sanitizerDir, "sanitizer-config.json");

    // Write custom config
    const customConfig = {
      mode: "fast",
      onDetect: "warn",
      rules: {
        EMAIL: { enabled: false },  // Disable email detection
        PHONE: { enabled: true }
      },
      customPatterns: []
    };
    fs.writeFileSync(configPath, JSON.stringify(customConfig, null, 2), "utf-8");

    // Initialize (should load existing config)
    const { sanitizer: s } = initSanitizer(__dirname, testConfigDir);

    // Verify custom config was loaded
    const result = s.detect("Email: test@example.com");
    expect(result.length).toBe(0); // Email disabled, no matches

    // Cleanup
    fs.rmSync(testConfigDir, { recursive: true, force: true });
  });

  it("sanitizer PII detection works", () => {
    // Clean up test dir if exists
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }

    const { sanitizer } = initSanitizer(__dirname, testConfigDir);

    // Test email detection
    const result = sanitizer.sanitize("Contact user@example.com for details");
    expect(result.text).not.toContain("user@example.com");
    expect(result.text).toContain("[EMAI_");
    expect(result.entities.length).toBe(1);

    // Cleanup
    fs.rmSync(testConfigDir, { recursive: true, force: true });
  });
});