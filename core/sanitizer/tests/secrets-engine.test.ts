import { describe, it, expect } from "vitest";
import { SecretsEngine } from "../engines/secrets-engine.js";
import { EntityType } from "../entities.js";

function engine() {
  return new SecretsEngine();
}

describe("SecretsEngine", () => {
  describe("JWT", () => {
    it("detects a JWT token", () => {
      const e = engine();
      const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.abcdef1234567890_ABC";
      const result = e.detect(`Token: ${jwt}`);
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.JWT_TOKEN);
      expect(result[0]!.confidence).toBe(0.99);
    });
  });

  describe("AWS keys", () => {
    it("detects AWS Access Key ID", () => {
      const e = engine();
      const result = e.detect("AKIAIOSFODNN7EXAMPLE");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.AWS_KEY);
    });

    it("detects AWS Secret Access Key context-anchored", () => {
      const e = engine();
      const result = e.detect('aws_secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"');
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("API keys", () => {
    it("detects OpenAI key (sk-...)", () => {
      const e = engine();
      const result = e.detect("sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.API_KEY);
    });

    it("detects Anthropic key", () => {
      const e = engine();
      const result = e.detect("sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789abcdefgh12345");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.API_KEY);
    });

    it("detects Google API key", () => {
      const e = engine();
      const result = e.detect("AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
      expect(result).toHaveLength(1);
    });

    it("detects HuggingFace token", () => {
      const e = engine();
      const result = e.detect("hf_abcdefghijklmnopqrstuvwxyz012345");
      expect(result).toHaveLength(1);
    });
  });

  describe("OAuth / tokens", () => {
    it("detects GitHub token (ghp_...)", () => {
      const e = engine();
      const result = e.detect("ghp_abcdefghijklmnopqrstuvwxyz0123456789abcd");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.OAUTH_TOKEN);
    });

    it("detects Bearer token (useGroup)", () => {
      const e = engine();
      const result = e.detect("Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789ab");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.OAUTH_TOKEN);
    });

    it("extracts only the secret value (not 'Bearer ') in useGroup patterns", () => {
      const e = engine();
      const result = e.detect("Bearer xyz12345678901234567890abcdefghijkl");
      expect(result).toHaveLength(1);
      expect(result[0]!.value.startsWith("xyz")).toBe(true);
      expect(result[0]!.value).not.toContain("Bearer");
    });
  });

  describe("PRIVATE_KEY", () => {
    it("detects PEM private key", () => {
      const e = engine();
      const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0G
-----END RSA PRIVATE KEY-----`;
      const result = e.detect(pem);
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.PRIVATE_KEY);
      expect(result[0]!.confidence).toBe(1.0);
    });
  });

  describe("DATABASE_URL", () => {
    it("detects postgres connection string", () => {
      const e = engine();
      const result = e.detect("postgresql://user:pass@localhost:5432/db");
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe(EntityType.DATABASE_URL);
    });

    it("detects mongodb+srv connection string", () => {
      const e = engine();
      const result = e.detect("mongodb+srv://admin:secret@cluster0.abcde.mongodb.net/");
      expect(result).toHaveLength(1);
    });
  });

  describe("PASSWORD", () => {
    it("detects password assignment", () => {
      const e = engine();
      const result = e.detect('password = "supersecret123"');
      expect(result.length).toBeGreaterThanOrEqual(1);
      if (result.length > 0) {
        expect(result[0]!.value).not.toContain("password");
      }
    });
  });

  describe("setEnabled / addPattern", () => {
    it("disables a pattern", () => {
      const e = engine();
      e.setEnabled(EntityType.JWT_TOKEN, false);
      const result = e.detect("eyJ.eyJ.abc");
      expect(result).toHaveLength(0);
    });

    it("adds a custom secret pattern", () => {
      const e = engine();
      e.addPattern(EntityType.CUSTOM, /GLSA_[A-Za-z0-9_\-]{20,}/g, 0.9);
      const result = e.detect("glsa_token: GLSA_abcdefghijklmnopqrstuvwxyz1234");
      expect(result).toHaveLength(1);
      expect(result[0]!.confidence).toBe(0.9);
    });
  });
});
