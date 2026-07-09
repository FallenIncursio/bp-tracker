import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const repoRoot = path.resolve(apiRoot, "../..");

dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(apiRoot, ".env"), override: true });

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:5173",
  apiBaseUrl: process.env.API_BASE_URL ?? "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL,
  directDatabaseUrl: process.env.DIRECT_DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET ?? "dev-session-secret-change-me",
  cookieName: process.env.COOKIE_NAME ?? "bp_tracker_session",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  firstAdminSetupToken: process.env.FIRST_ADMIN_SETUP_TOKEN,
  discordClientId: process.env.DISCORD_CLIENT_ID,
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET,
  discordRedirectUri: process.env.DISCORD_REDIRECT_URI,
  discordOAuthStateSecret:
    process.env.DISCORD_OAUTH_STATE_SECRET ??
    process.env.SESSION_SECRET ??
    "dev-discord-state-secret-change-me",
  discordBotToken: process.env.DISCORD_BOT_TOKEN,
  discordAllowedGuildIds: (process.env.DISCORD_ALLOWED_GUILD_IDS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  wantedBlueprintAlertScannerEnabled: parseBoolean(
    process.env.BP_WANTED_ALERT_SCANNER_ENABLED,
    false,
  ),
  wantedBlueprintAlertScannerIntervalMs: parsePositiveInt(
    process.env.BP_WANTED_ALERT_SCANNER_INTERVAL_MS,
    15 * 60 * 1000,
  ),
  wantedBlueprintAlertScannerPrimeOnStart: parseBoolean(
    process.env.BP_WANTED_ALERT_SCANNER_PRIME_ON_START,
    true,
  ),
};

export const isProduction = env.nodeEnv === "production";
