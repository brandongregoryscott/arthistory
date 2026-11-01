import { CronJob } from "cron";
import { initializeRegistry } from "../sync/bootstrap";
import { getSyncSettings } from "../sync/settings";
import { logger } from "../utils/logger";
import { withWorkerLock } from "../utils/worker-lock";
import { runMerge, runSync } from "./worker";

const runJob = async (name: string, work: () => Promise<void>) => {
    try {
        const ran = await withWorkerLock(work);
        if (!ran) {
            logger.info(
                { name },
                "Another sync or merge is running; skipping tick"
            );
        }
    } catch (error) {
        logger.error(
            {
                error: error instanceof Error ? error.message : "Unknown error",
                name,
            },
            "Cron job failed; durable work will retry"
        );
    }
};

void runJob("initialize", initializeRegistry);

logger.info({ settings: getSyncSettings() }, "Starting artist cron service");

CronJob.from({
    cronTime: "34 * * * *",
    onTick: () => runJob("sync", runSync),
    start: true,
    timeZone: "America/New_York",
    waitForCompletion: true,
});

CronJob.from({
    cronTime: "0 0 * * 0",
    onTick: () => runJob("merge", runMerge),
    start: true,
    timeZone: "America/New_York",
    waitForCompletion: true,
});
