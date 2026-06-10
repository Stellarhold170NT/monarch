/** All entity types the sanitizer can detect and redact. */
export enum EntityType {
  // PII
  EMAIL = "EMAIL",
  PHONE = "PHONE",
  SSN = "SSN",
  CREDIT_CARD = "CREDIT_CARD",
  IBAN = "IBAN",
  IP_ADDRESS = "IP_ADDRESS",
  MAC_ADDRESS = "MAC_ADDRESS",
  URL = "URL",
  CRYPTO_ADDRESS = "CRYPTO_ADDRESS",
  DATE_OF_BIRTH = "DATE_OF_BIRTH",
  PASSPORT = "PASSPORT",
  // Secrets
  API_KEY = "API_KEY",
  JWT_TOKEN = "JWT_TOKEN",
  OAUTH_TOKEN = "OAUTH_TOKEN",
  AWS_KEY = "AWS_KEY",
  PRIVATE_KEY = "PRIVATE_KEY",
  DATABASE_URL = "DATABASE_URL",
  PASSWORD = "PASSWORD",
  // User-defined
  CUSTOM = "CUSTOM",
}
