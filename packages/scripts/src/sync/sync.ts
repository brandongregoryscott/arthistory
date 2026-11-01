import type { Database } from "../types";
import { ArtistPageError, fetchArtistStats } from "../utils/artist-html";
import { logger } from "../utils/logger";
import { getDueArtists } from "./registry";
import { getSyncSettings } from "./settings";

type SyncDependencies = {
    fetchStats: typeof fetchArtistStats;
    now: () => number;
    sleep: (ms: number) => Promise<void>;
};

const collectArtists = async (
    db: Database,
    settings = getSyncSettings(),
    dependencies: SyncDependencies = {
        fetchStats: fetchArtistStats,
        now: Date.now,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    }
) => {
    const { fetchStats, now, sleep } = dependencies;
    const state = await db.get<{ next_request_at: number }>(
        "SELECT next_request_at FROM sync_state WHERE id = 1"
    );
    if ((state?.next_request_at ?? 0) > now()) {
        logger.info(
            { nextRequestAt: state?.next_request_at },
            "Collection deferred until next request window"
        );
        return;
    }
    const due = await getDueArtists(
        db,
        now(),
        settings.intervalMs,
        settings.maxRequests
    );
    let collected = 0;
    for (const { id } of due) {
        const gate = await db.get<{ next_request_at: number }>(
            "SELECT next_request_at FROM sync_state WHERE id = 1"
        );
        const wait = (gate?.next_request_at ?? 0) - now();
        if (wait > 0) {
            await sleep(wait);
        }
        // Recheck after waiting so a CLI disable takes effect during the batch.
        const artist = await db.get<{ sync_enabled: number }>(
            "SELECT sync_enabled FROM artist_ids WHERE id = ?",
            id
        );
        if (artist?.sync_enabled !== 1) {
            continue;
        }
        const startedAt = now();
        // Reserve before fetching so a crash cannot cause an immediate retry.
        await db.run(
            "UPDATE sync_state SET next_request_at = ? WHERE id = 1",
            startedAt + settings.spacingMs
        );
        await db.run(
            "UPDATE artist_ids SET next_attempt_at = ? WHERE id = ?",
            startedAt + settings.failureDelayMs,
            id
        );
        try {
            const stats = await fetchStats(id);
            const observedAt = now();
            await db.exec("BEGIN IMMEDIATE");
            try {
                await db.run(
                    `INSERT OR IGNORE INTO sync_outbox (id, timestamp, followers, monthly_listeners, popularity) VALUES (?, ?, ?, ?, NULL)`,
                    id,
                    Math.floor(observedAt / 1000),
                    stats.followers,
                    stats.monthlyListeners
                );
                await db.run(
                    "UPDATE artist_ids SET last_success_at = ?, next_attempt_at = 0 WHERE id = ?",
                    observedAt,
                    id
                );
                await db.exec("COMMIT");
            } catch (error) {
                await db.exec("ROLLBACK");
                throw error;
            }
            collected++;
            logger.info({ id, ...stats }, "Collected artist audience counts");
        } catch (error) {
            logger.warn(
                {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                    id,
                },
                "Artist collection failed"
            );
            // Missing state may be a page-wide change. Stop rather than fetch the
            // rest of the roster against a broken parser. A 404 affects only one ID.
            if (!(error instanceof ArtistPageError) || error.status !== 404) {
                const delay =
                    error instanceof ArtistPageError
                        ? Math.max(settings.cooldownMs, error.retryAfterMs)
                        : settings.cooldownMs;
                await db.run(
                    "UPDATE sync_state SET next_request_at = ? WHERE id = 1",
                    now() + delay
                );
                break;
            }
        }
    }
    logger.info({ collected, due: due.length }, "Artist collection finished");
};

export { collectArtists };
