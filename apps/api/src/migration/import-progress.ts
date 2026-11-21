type ImportProgressUpdate = {
    batch?: number;
    created?: number;
    phase: "complete" | "connecting" | "importing" | "validating";
    processed: number;
    skipped?: number;
    total: number;
};

type ImportProgress = {
    elapsedSeconds: number;
    percent: number;
    recordsPerSecond: number;
} & ImportProgressUpdate;

type ReportImportProgress = (
    update: ImportProgressUpdate,
    force?: boolean
) => void;

const createImportProgressReporter = (
    onProgress?: (progress: ImportProgress) => void
): ReportImportProgress => {
    const started = Date.now();
    let phaseStarted = started;
    let phase: ImportProgressUpdate["phase"] | undefined;
    let lastReport = started;

    return (update, force = false) => {
        if (onProgress == null) {
            return;
        }
        const now = Date.now();
        const { phase: nextPhase } = update;
        const changed = phase !== nextPhase;
        if (changed) {
            if (update.phase !== "complete") {
                phaseStarted = now;
            }
            phase = nextPhase;
        }
        if (!changed && !force && now - lastReport < 5000) {
            return;
        }
        lastReport = now;
        const phaseSeconds = (now - phaseStarted) / 1000;
        onProgress({
            ...update,
            elapsedSeconds: Math.round((now - started) / 1000),
            percent:
                update.total === 0
                    ? 100
                    : Math.min(
                          100,
                          Math.round((update.processed / update.total) * 1000) /
                              10
                      ),
            recordsPerSecond:
                phaseSeconds > 0
                    ? Math.round(update.processed / phaseSeconds)
                    : 0,
        });
    };
};

export { createImportProgressReporter };
export type { ImportProgress, ReportImportProgress };
