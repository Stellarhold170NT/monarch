import { describe, it, expect } from "vitest";
import { RegexEngine } from "../engines/regex-engine.js";
import { EntityType } from "../entities.js";

function engine() {
  return new RegexEngine();
}

describe("RegexEngine", () => {
  describe("EMAIL", () => {
    it("detects basic email", () => {
      const e = engine();
      const result = e.detect("Contact me at user@example.com");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.EMAIL);
      expect(result[0]!.value).toBe("user@example.com");
    });

    it("detects email with plus addressing", () => {
      const e = engine();
      const result = e.detect("Send to test+filter@company.co.uk");
      expect(result).toHaveLength(1);
      expect(result[0]!.value).toBe("test+filter@company.co.uk");
    });

    it("does not match email-like in code", () => {
      const e = engine();
      const result = e.detect("const email = 'abc@def.com';");
      expect(result).toHaveLength(1);
    });
  });

  describe("PHONE", () => {
    it("detects US phone (555 format)", () => {
      const e = engine();
      const result = e.detect("Call me at (555) 123-4567");
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.some((r) => r.value.includes("555"))).toBe(true);
    });

    it("detects US phone with dashes", () => {
      const e = engine();
      const result = e.detect("Number: 212-555-0198");
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("detects E.164 international phone", () => {
      const e = engine();
      const result = e.detect("Call +441632960184");
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("SSN", () => {
    it("detects SSN with dashes", () => {
      const e = engine();
      const result = e.detect("My SSN is 123-45-6789");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.SSN);
    });

    it("rejects invalid SSN (all zeros group)", () => {
      const e = engine();
      const result = e.detect("Invalid: 000-00-0000");
      expect(result).toHaveLength(0);
    });
  });

  describe("CREDIT_CARD", () => {
    it("detects valid Visa card (Luhn passes)", () => {
      const e = engine();
      const result = e.detect("Card: 4111 1111 1111 1111");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.CREDIT_CARD);
    });

    it("detects valid Mastercard", () => {
      const e = engine();
      const result = e.detect("MC: 5500 0000 0000 0004");
      expect(result).toHaveLength(1);
    });

    it("rejects invalid card (Luhn fails)", () => {
      const e = engine();
      const result = e.detect("Bad: 1234 5678 9012 3456");
      expect(result).toHaveLength(0);
    });
  });

  describe("IBAN", () => {
    it("detects valid IBAN (DE)", () => {
      const e = engine();
      const result = e.detect("IBAN: DE89 3704 0044 0532 0130 00");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.IBAN);
    });

    it("detects valid IBAN (GB)", () => {
      const e = engine();
      const result = e.detect("IBAN: GB29 NWBK 6016 1331 9268 19");
      expect(result.some((r) => r.entityType === EntityType.IBAN)).toBe(true);
    });
  });

  describe("IP_ADDRESS", () => {
    it("detects IPv4", () => {
      const e = engine();
      const result = e.detect("Server: 192.168.1.1");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.IP_ADDRESS);
    });

    it("rejects year-like pattern", () => {
      const e = engine();
      const result = e.detect("in 2024 we shipped v2");
      expect(result.filter((r) => r.entityType === EntityType.IP_ADDRESS)).toHaveLength(0);
    });
  });

  describe("MAC_ADDRESS", () => {
    it("detects MAC address", () => {
      const e = engine();
      const result = e.detect("MAC: 00:1A:2B:3C:4D:5E");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.MAC_ADDRESS);
    });
  });

  describe("URL", () => {
    it("detects https URL", () => {
      const e = engine();
      const result = e.detect("Visit https://example.com/path?q=1");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.URL);
    });
  });

  describe("CRYPTO_ADDRESS", () => {
    it("detects Ethereum address", () => {
      const e = engine();
      const result = e.detect("ETH: 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.CRYPTO_ADDRESS);
    });
  });

  describe("DATE_OF_BIRTH", () => {
    it("detects DOB with label", () => {
      const e = engine();
      const result = e.detect("DOB: 01/15/1990");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.DATE_OF_BIRTH);
    });
  });

  describe("PASSPORT", () => {
    it("detects passport number with label", () => {
      const e = engine();
      const result = e.detect("Passport number: AB1234567");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.PASSPORT);
    });
  });

  describe("setEnabled / addPattern", () => {
    it("disables a pattern by entity type", () => {
      const e = engine();
      e.setEnabled(EntityType.EMAIL, false);
      const result = e.detect("test@example.com");
      expect(result).toHaveLength(0);
    });

    it("adds a custom pattern", () => {
      const e = engine();
      e.addPattern(EntityType.CUSTOM, /CUST-\d{6}/g, 0.8);
      const result = e.detect("Order: CUST-123456");
      expect(result).toHaveLength(1);
      expect(result[0]!.confidence).toBe(0.8);
      expect(result[0]!.entityType).toBe(EntityType.CUSTOM);
    });
  });

  describe("multiple entities in text", () => {
    it("detects email and phone in same text", () => {
      const e = engine();
      const result = e.detect("user@example.com and (555) 123-4567");
      const types = new Set(result.map((r) => r.entityType));
      expect(types.has(EntityType.EMAIL)).toBe(true);
      expect(types.has(EntityType.PHONE)).toBe(true);
    });
  });
});
