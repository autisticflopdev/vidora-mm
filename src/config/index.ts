import dotenv from "dotenv";

dotenv.config();

const getRequiredEnvVar = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const config = {
  port: process.env.PORT || 3000,
  primaryKey: getRequiredEnvVar("PRIMARY_KEY"),
  secondaryKey: getRequiredEnvVar("SECONDARY_KEY"),
  salt: getRequiredEnvVar("SALT"),
  pepper: getRequiredEnvVar("PEPPER"),
  baseUrl: getRequiredEnvVar("BASE_URL"),
  encryptionKey:
    getRequiredEnvVar("PRIMARY_KEY") + getRequiredEnvVar("SECONDARY_KEY"),
  iterations: parseInt(process.env.ITERATIONS || "310000"),
  cacheDuration: parseInt(process.env.CACHE_DURATION || "300000"),
  maxAge: 300000,
  jwtSecret: getRequiredEnvVar("JWT_SECRET"),
  jwtExpiresIn: "24h",
  mongoUri: getRequiredEnvVar("MONGODB_URI"),
} as const;

export const getEncryptionKey = (): string => {
  return config.encryptionKey;
};
