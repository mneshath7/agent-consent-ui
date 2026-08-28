import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 8787),
  rpName: required("RP_NAME"),
  rpID: required("RP_ID"),
  origin: required("ORIGIN"),
  clientOrigin: required("CLIENT_ORIGIN"),
  sessionSecret: required("SESSION_SECRET"),
};

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}

if (config.nodeEnv === "production" && config.sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must be at least 32 characters in production");
}
