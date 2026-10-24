import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT ?? 3001;
const METRICS_HOST = process.env.METRICS_HOST ?? "127.0.0.1";
const METRICS_PORT = Number(process.env.METRICS_PORT ?? 9464);
if (METRICS_HOST.trim() === "") {
    throw new Error("Invalid METRICS_HOST.");
}
if (
    !Number.isInteger(METRICS_PORT) ||
    METRICS_PORT < 1 ||
    METRICS_PORT > 65535
) {
    throw new Error("Invalid METRICS_PORT.");
}
const CLIENT_ID = process.env.CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.CLIENT_SECRET ?? "";
const DATABASE_PATH = process.env.DATABASE_PATH ?? "";
const POSTHOG_KEY = process.env.POSTHOG_KEY ?? "";

export {
    CLIENT_ID,
    CLIENT_SECRET,
    DATABASE_PATH,
    METRICS_HOST,
    METRICS_PORT,
    PORT,
    POSTHOG_KEY,
};
