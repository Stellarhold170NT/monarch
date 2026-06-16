/**
 * Sanitizer initialization module for Monarch
 * 
 * Auto-creates sanitizer-config.json in core/sanitizer/ if not exists,
 * then initializes and provides the sanitizer instance.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Sanitizer, loadConfig } from '../../../core/sanitizer/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default config content (copied from sanitizer-config.json template)
const DEFAULT_SANITIZER_CONFIG = {
  enabled: false,
  mode: "fast",
  onDetect: "redact",
  rules: {
    EMAIL: { enabled: true },
    PHONE: { enabled: true },
    SSN: { enabled: true },
    CREDIT_CARD: { enabled: true },
    IBAN: { enabled: true },
    IP_ADDRESS: { enabled: true },
    MAC_ADDRESS: { enabled: true },
    URL: { enabled: true },
    CRYPTO_ADDRESS: { enabled: true },
    DATE_OF_BIRTH: { enabled: true },
    PASSPORT: { enabled: true },
    API_KEY: { enabled: true },
    JWT_TOKEN: { enabled: true },
    OAUTH_TOKEN: { enabled: true },
    AWS_KEY: { enabled: true },
    PRIVATE_KEY: { enabled: true },
    DATABASE_URL: { enabled: true },
    PASSWORD: { enabled: true }
  },
  customPatterns: [
    {
      name: "OPENAI_ORG_ID",
      pattern: "org-[A-Za-z0-9]{20,}",
      confidence: 0.85,
      engine: "secrets"
},
    {
      name: "DOCKER_REGISTRY_TOKEN",
      pattern: "(?:docker|ghcr)\\..*?\\/[A-Za-z0-9_-]+:[A-Za-z0-9\\._-]+",
      confidence: 0.7,
      engine: "regex"
    }
  ]
};

let _sanitizerInstance = null;
let _sanitizerConfigPath = null;

/**
 * Ensure sanitizer-config.json exists, create default if not
 */
const ensureConfigFile = (configDir) => {
  const configPath = path.join(configDir, 'sanitizer-config.json');

  if (!fs.existsSync(configPath)) {
    try {
      // Write default config
      fs.writeFileSync(
        configPath, 
        JSON.stringify(DEFAULT_SANITIZER_CONFIG, null, 2), 
        'utf8'
      );
    } catch (err) {
      return null;
    }
  }

  return configPath;
};

/**
 * Initialize the sanitizer with config
 */
export const initSanitizer = (directory, configDir) => {
  // If already initialized, return cached instance
  if (_sanitizerInstance) {
    return { sanitizer: _sanitizerInstance, configPath: _sanitizerConfigPath };
  }

  // First, ensure config file exists
  _sanitizerConfigPath = ensureConfigFile(configDir);

  try {
    // Load config from file (will use default if file doesn't exist)
    const config = loadConfig(_sanitizerConfigPath);
    _sanitizerInstance = new Sanitizer(config);
    return { sanitizer: _sanitizerInstance, configPath: _sanitizerConfigPath };
  } catch (err) {
    // Fallback: create sanitizer with default config
    try {
      _sanitizerInstance = new Sanitizer(DEFAULT_SANITIZER_CONFIG);
      return { sanitizer: _sanitizerInstance, configPath: null };
    } catch (fallbackErr) {
      return { sanitizer: null, configPath: null };
    }
  }
};

/**
 * Get the cached sanitizer instance (must call initSanitizer first)
 */
export const getSanitizer = () => {
  return _sanitizerInstance;
};

export { DEFAULT_SANITIZER_CONFIG };