import type { SongHistoryObservation } from "@repo/common";

const MAX_HISTORY_WEEKS = 5200;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const historyWeeks = (timestamps: string[]) => {
    if (timestamps.length === 0) {
        return [];
    }

    const times = timestamps.map(Date.parse);
    const first = Math.min(...times);
    const last = Math.max(...times);
    const count = Math.floor((last - first) / WEEK_MS) + 1;

    if (count > MAX_HISTORY_WEEKS) {
        throw new Error("History exceeds 100 years.");
    }

    return Array.from({ length: count }, (_, index) =>
        new Date(first + index * WEEK_MS).toISOString()
    );
};

const summarizeSongs = (history: SongHistoryObservation[], start: number) => {
    const grouped = new Map<string, SongHistoryObservation[]>();

    for (const row of history) {
        const rows = grouped.get(row.spotifyId) ?? [];

        rows.push(row);
        grouped.set(row.spotifyId, rows);
    }

    return [...grouped.entries()].map((parameter) => {
        const [id, rows] = parameter;

        rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

        const latest = rows.at(-1);

        if (latest == null) {
            throw new Error("Song group has no observations.");
        }

        const range = rows.filter((row) => Date.parse(row.timestamp) >= start);
        const valid = range.filter((row) => row.listenCount !== null);
        const decreased = valid.some((row, index) => {
            const previous = valid[index - 1];

            return (
                row.listenCount != null &&
                previous?.listenCount != null &&
                row.listenCount < previous.listenCount
            );
        });
        const [first] = range;
        const last = range.at(-1);
        const change =
            !decreased &&
            range.length > 1 &&
            first?.listenCount != null &&
            last?.listenCount != null
                ? last.listenCount - first.listenCount
                : null;

        return {
            change,
            decreased,
            first,
            id,
            last,
            latest,
            name: latest.name,
            range,
        };
    });
};

export { historyWeeks, summarizeSongs };
