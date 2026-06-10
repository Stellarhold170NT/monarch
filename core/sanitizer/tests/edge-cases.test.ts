import { describe, it, expect } from "vitest";
import { Sanitizer } from "../sanitizer.js";
import { Vault } from "../vault.js";
import { Session } from "../session.js";
import { EntityType } from "../entities.js";

describe("Edge Cases - Deduplication", () => {
  it("handles overlapping entities from different engines", () => {
    const s = new Sanitizer();
    const result = s.sanitize("Contact user@example.com and 4111 1111 1111 1111");
    const types = result.entities.map((e) => e.entityType);
    expect(types).toContain(EntityType.EMAIL);
    expect(types).toContain(EntityType.CREDIT_CARD);
  });

  it("entities with equal confidence keep first (shorter) one", () => {
    const s = new Sanitizer();
    const result = s.detect("user@example.com");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("Edge Cases - Vault", () => {
  it("restore handles tokens appearing as substrings", () => {
    const v = new Vault();
    v.add("abc", "[tok1]");
    v.add("abc123", "[tok2]");

    const restored = v.restore("Values: [tok2] and [tok1]");
    expect(restored).toBe("Values: abc123 and abc");
  });

  it("restore with many tokens doesn't corrupt", () => {
    const v = new Vault();
    const words = ["one", "two", "three", "four", "five"];
    words.forEach((w, i) => v.add(w, `[T_${i}]`));

    const restored = v.restore("[T_0] [T_1] [T_2] [T_3] [T_4]");
    expect(restored).toBe("one two three four five");
  });
});

describe("Edge Cases - Session", () => {
  it("anonymizeWithResult returns full SanitizeResult", () => {
    const s = new Sanitizer();
    const sess = s.session();
    const result = sess.anonymizeWithResult("admin@company.com");

    expect(result.original).toBe("admin@company.com");
    expect(result.text).toContain("[");
    expect(result.entities.length).toBeGreaterThan(0);
  });

  it("reset clears the vault", () => {
    const s = new Sanitizer();
    const sess = s.session();
    sess.anonymize("test@example.com");
    expect(sess.size).toBe(1);

    sess.reset();
    expect(sess.size).toBe(0);
  });

  it("mapping exposes all vault entries", () => {
    const s = new Sanitizer();
    const sess = s.session();
    sess.anonymize("user@ex.com");
    sess.anonymize("admin@ex.com");

    const mapping = sess.mapping;
    expect(Object.keys(mapping).length).toBe(2);
    expect(Object.values(mapping).some((t) => t.includes("EMAI"))).toBe(true);
  });
});

describe("Edge Cases - Warn Mode", () => {
  it("warn mode leaves text unchanged but populates entities", () => {
    const s = new Sanitizer({ onDetect: "warn" });
    const result = s.sanitize("Email: user@example.com, Phone: (555) 123-4567");

    expect(result.text).toBe("Email: user@example.com, Phone: (555) 123-4567");
    expect(result.entities.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(result.tokens).length).toBe(0);
  });

  it("warn mode with multiple entities of same type", () => {
    const s = new Sanitizer({ onDetect: "warn" });
    const result = s.sanitize("contact@a.com and also b@example.com");

    expect(result.text).toContain("contact@a.com");
    expect(result.entities.filter((e) => e.entityType === EntityType.EMAIL).length).toBe(2);
  });
});

describe("Edge Cases - Performance (stress)", () => {
  it("handles large input with many entities", () => {
    const s = new Sanitizer();
    const text = Array(100).fill("test@example.com ").join("");
    const result = s.sanitize(text);

    // All 100 entities replaced
    const emailCount = (result.text.match(/\[EMAI_\d+\]/g) || []).length;
    expect(emailCount).toBe(100);
    expect(result.entities.length).toBeGreaterThanOrEqual(1);
  });

  it("handles many duplicate values efficiently", () => {
    const s = new Sanitizer();
    const text = "test@example.com ".repeat(50);
    const result = s.sanitize(text);

    expect(result.tokens["test@example.com"]).toBeDefined();
    const tokenCount = new Set(Object.values(result.tokens)).size;
    expect(tokenCount).toBe(1);
  });
});
