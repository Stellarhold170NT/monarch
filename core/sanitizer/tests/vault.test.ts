import { describe, it, expect } from "vitest";
import { Vault } from "../vault.js";

describe("Vault", () => {
  it("stores forward mapping", () => {
    const v = new Vault();
    v.add("user@example.com", "[EMAI_0]");
    expect(v.getReplacement("user@example.com")).toBe("[EMAI_0]");
  });

  it("stores reverse mapping", () => {
    const v = new Vault();
    v.add("user@example.com", "[EMAI_0]");
    expect(v.getOriginal("[EMAI_0]")).toBe("user@example.com");
  });

  it("is deterministic — same original gets same replacement", () => {
    const v = new Vault();
    const r1 = v.add("secret@email.com", "[EMAI_0]");
    const r2 = v.add("secret@email.com", "[EMAI_1]"); // different proposed
    expect(r1).toBe("[EMAI_0]");
    expect(r2).toBe("[EMAI_0]"); // still first
  });

  it("has() checks both directions", () => {
    const v = new Vault();
    v.add("a@b.com", "[X_0]");
    expect(v.has("a@b.com")).toBe(true);
    expect(v.has("[X_0]")).toBe(true);
    expect(v.has("unknown")).toBe(false);
  });

  it("restore() replaces tokens back to originals", () => {
    const v = new Vault();
    v.add("alice@co.com", "[EMAI_0]");
    v.add("555-0100", "[PHON_1]");
    const restored = v.restore("Contact [EMAI_0] or [PHON_1]");
    expect(restored).toBe("Contact alice@co.com or 555-0100");
  });

  it("restore() handles longest-first ordering", () => {
    const v = new Vault();
    v.add("xxx", "[AAA_0]");
    v.add("xxxxx", "[BBB_1]"); // longer
    const restored = v.restore("token [BBB_1] and [AAA_0]");
    expect(restored).toBe("token xxxxx and xxx");
  });

  it("snapshot() returns all mappings", () => {
    const v = new Vault();
    v.add("a", "1");
    v.add("b", "2");
    expect(v.snapshot()).toEqual({ a: "1", b: "2" });
  });

  it("clear() wipes all mappings", () => {
    const v = new Vault();
    v.add("a", "1");
    v.clear();
    expect(v.size).toBe(0);
    expect(v.has("a")).toBe(false);
  });

  it("size returns correct count", () => {
    const v = new Vault();
    expect(v.size).toBe(0);
    v.add("a", "1");
    expect(v.size).toBe(1);
    v.add("b", "2");
    expect(v.size).toBe(2);
  });
});
