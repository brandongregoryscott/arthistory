import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT ?? 3001;
const CLIENT_ID = process.env.CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.CLIENT_SECRET ?? "";
const DATABASE_PATH = process.env.DATABASE_PATH ?? "";
const POSTHOG_KEY = process.env.POSTHOG_KEY ?? "";

export { CLIENT_ID, CLIENT_SECRET, DATABASE_PATH, PORT, POSTHOG_KEY };
