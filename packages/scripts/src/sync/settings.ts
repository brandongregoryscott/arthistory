import "../config";

const positiveInteger = (name: string, fallback: number): number => {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error(`${name} must be a positive integer`);
    }
    return value;
};

const getSyncSettings = () => ({
    cooldownMs: positiveInteger("SYNC_COOLDOWN_HOURS", 24) * 3600000,
    failureDelayMs: positiveInteger("SYNC_FAILURE_RETRY_HOURS", 24) * 3600000,
    intervalMs: positiveInteger("SYNC_INTERVAL_HOURS", 24) * 3600000,
    maxRequests: positiveInteger("SYNC_MAX_REQUESTS_PER_RUN", 5),
    spacingMs: positiveInteger("SYNC_REQUEST_SPACING_SECONDS", 60) * 1000,
});

export { getSyncSettings };
