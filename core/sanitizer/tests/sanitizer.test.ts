import { describe, it, expect } from "vitest";
import { Sanitizer } from "../sanitizer.js";
import { EntityType } from "../entities.js";

describe("Sanitizer", () => {
  describe("detect", () => {
    it("detects multiple entity types in text", () => {
      const s = new Sanitizer();
      const entities = s.detect("Email: user@example.com, Phone: (555) 123-4567");
      const types = new Set(entities.map((e) => e.entityType));
      expect(types.has(EntityType.EMAIL)).toBe(true);
      expect(types.has(EntityType.PHONE)).toBe(true);
    });

    it("detects secrets", () => {
      const s = new Sanitizer();
      const entities = s.detect("AWS key: AKIAIOSFODNN7EXAMPLE");
      expect(entities.some((e) => e.entityType === EntityType.AWS_KEY)).toBe(true);
    });
  });

  describe("sanitize", () => {
    it("replaces PII with tokens", () => {
      const s = new Sanitizer();
      const result = s.sanitize("Email: user@example.com");
      expect(result.text).not.toContain("user@example.com");
      expect(result.text).toContain("[EMAI_");
    });

    it("returns original and entity metadata", () => {
      const s = new Sanitizer();
      const result = s.sanitize("user@example.com");
      expect(result.original).toBe("user@example.com");
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]!.entityType).toBe(EntityType.EMAIL);
    });

    it("popsulates tokens map", () => {
      const s = new Sanitizer();
      const result = s.sanitize("user@example.com");
      expect(result.tokens["user@example.com"]).toBe("[EMAI_0]");
    });

    it("same input → same token (deterministic vault)", () => {
      const s = new Sanitizer();
      const r1 = s.sanitize("user@ex.com");
      const r2 = s.sanitize("user@ex.com");
      expect(r1.text).toBe(r2.text);
      expect(r1.tokens["user@ex.com"]).toBe(r2.tokens["user@ex.com"]);
    });

    it("handles multiple entities", () => {
      const s = new Sanitizer();
      const result = s.sanitize("Email: a@b.com, Card: 4111 1111 1111 1111");
      expect(result.text).toContain("[EMAI_");
      expect(result.text).toContain("[CRED_");
    });
  });

  describe("warn mode", () => {
    it("leaves text unchanged in warn mode", () => {
      const s = new Sanitizer({ onDetect: "warn" });
      const result = s.sanitize("user@example.com");
      expect(result.text).toBe("user@example.com");
      expect(result.entities).toHaveLength(1);
    });
  });

  describe("config — disable rule", () => {
    it("skips disabled entity type", () => {
      const s = new Sanitizer({ rules: { EMAIL: { enabled: false } } });
      const result = s.sanitize("user@example.com, Card: 4111 1111 1111 1111");
      expect(result.text).toContain("user@example.com"); // not redacted
    });
  });

  describe("restore", () => {
    it("restores tokens back to original", () => {
      const s = new Sanitizer();
      s.sanitize("Contact: user@example.com");
      const restored = s.restore("Contact: [EMAI_0]");
      expect(restored).toBe("Contact: user@example.com");
    });
  });

  describe("session", () => {
    it("creates a session that shares vault across calls", () => {
      const s = new Sanitizer();
      const sess = s.session();
      const clean1 = sess.anonymize("user@ex.com");
      const clean2 = sess.anonymize("admin@ex.com");
      expect(clean1).toBe("[EMAI_0]");
      expect(clean2).toBe("[EMAI_1]");

      const restored = sess.deanonymize("Reply to [EMAI_0] and [EMAI_1]");
      expect(restored).toBe("Reply to user@ex.com and admin@ex.com");
    });
  });

  describe("custom patterns via config", () => {
    it("loads custom patterns from config", () => {
      const s = new Sanitizer({
        customPatterns: [
          { name: "K8S_POD", pattern: "pod/[a-z0-9-]+", confidence: 0.85, engine: "regex" },
        ],
      });
      const result = s.sanitize("Deploy to pod/nginx-5x8f9");
      expect(result.text).toContain("[CUST_");
    });
  });

  describe("score", () => {
    it("returns 0 when no entities detected", () => {
      const s = new Sanitizer();
      const result = s.sanitize("Hello world");
      expect(result.score).toBe(0);
    });

    it("returns >0 when entities detected", () => {
      const s = new Sanitizer();
      const result = s.sanitize("user@example.com, AKIAIOSFODNN7EXAMPLE");
      expect(result.score).toBeGreaterThan(0);
    });
  });
});
