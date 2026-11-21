import dotenv from "dotenv";

dotenv.config();

type PocketBaseConfig = {
    email: string;
    password: string;
    url: string;
};

// CLI tools and the server load their PocketBase connection on use.
const loadPocketBaseConfig = (): PocketBaseConfig => {
    const url = process.env.POCKETBASE_URL ?? "";
    const email = process.env.POCKETBASE_SUPERUSER_EMAIL ?? "";
    const password = process.env.POCKETBASE_SUPERUSER_PASSWORD ?? "";
    const parsed = new URL(url);
    if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username !== "" ||
        parsed.password !== "" ||
        parsed.pathname !== "/" ||
        parsed.search !== "" ||
        parsed.hash !== "" ||
        email.trim() === "" ||
        password === ""
    ) {
        throw new Error("Invalid server-side PocketBase configuration.");
    }
    return { email, password, url: parsed.origin };
};

const PORT = process.env.PORT ?? 3001;
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS ?? 0);
if (!Number.isSafeInteger(TRUST_PROXY_HOPS) || TRUST_PROXY_HOPS < 0) {
    throw new Error("Invalid TRUST_PROXY_HOPS.");
}
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
const POSTHOG_KEY = process.env.POSTHOG_KEY ?? "";

export {
    loadPocketBaseConfig,
    METRICS_HOST,
    METRICS_PORT,
    PORT,
    POSTHOG_KEY,
    TRUST_PROXY_HOPS,
};
export type { PocketBaseConfig };
