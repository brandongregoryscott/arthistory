import { isNumber, isPlainObject } from "lodash";
import {
    createReadStream,
    closeSync,
    mkdtempSync,
    openSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { ReportImportProgress } from "./import-progress";
import type { ImportItem } from "./prepared-records";
import { importId, validateArtist, validateSnapshot } from "./prepared-records";

const MAX_LINE_BYTES = 16384;
const MAX_REPORT_BYTES = 64 * 1024;

// Validate and freeze the full export before making any target requests. Private
// spooling keeps memory bounded and isolates loading from concurrent input edits.
const stageImport = async (
    directory: string,
    reportProgress?: ReportImportProgress
) => {
    const reportFile = resolve(directory, "report.json");

    if (statSync(reportFile).size > MAX_REPORT_BYTES) {
        throw new Error("Import report is too large.");
    }

    const report: unknown = JSON.parse(readFileSync(reportFile, "utf8"));
    const counts = readCounts(report);
    const temporary = mkdtempSync(resolve(tmpdir(), "arthistory-import-"));
    const filename = resolve(temporary, "records.jsonl");
    let fd: number | undefined;
    let complete = false;
    let artists = 0;
    let snapshots = 0;
    const total = counts.artists + counts.snapshots;
    const progress = (force = false) =>
        reportProgress?.(
            { phase: "validating", processed: artists + snapshots, total },
            force
        );

    try {
        fd = openSync(filename, "wx", 0o600);
        progress();

        const rows = readJsonLines<unknown>(
            resolve(directory, "snapshots.jsonl")
        );
        let next = await rows.next();
        let previousArtist = "";

        try {
            for await (const input of readJsonLines<unknown>(
                resolve(directory, "artists.jsonl")
            )) {
                const artist = validateArtist(input);

                if (artist.spotifyId <= previousArtist) {
                    throw new Error(
                        "Prepared artists must be unique and sorted by Spotify ID."
                    );
                }

                previousArtist = artist.spotifyId;
                artists++;
                progress();
                writeFileSync(
                    fd,
                    JSON.stringify({
                        collection: "artists",
                        record: artist,
                    } satisfies ImportItem) + "\n"
                );

                let previousWeek = "";
                let artistSnapshots = 0;

                while (next.done !== true) {
                    const snapshot = validateSnapshot(next.value);

                    if (snapshot.artist !== artist.id) {
                        break;
                    }

                    if (
                        (previousWeek !== "" &&
                            snapshot.weekStart >= previousWeek) ||
                        snapshot.id !==
                            importId(
                                `snapshot:${artist.spotifyId}:${snapshot.weekStart}`
                            )
                    ) {
                        throw new Error(
                            "Invalid snapshot ordering or deterministic ID."
                        );
                    }

                    previousWeek = snapshot.weekStart;
                    artistSnapshots++;
                    snapshots++;
                    progress();
                    writeFileSync(
                        fd,
                        JSON.stringify({
                            collection: "snapshots",
                            record: snapshot,
                        } satisfies ImportItem) + "\n"
                    );
                    next = await rows.next();
                }

                if (artistSnapshots === 0) {
                    throw new Error("Prepared artist has no snapshots.");
                }
            }

            if (
                next.done !== true ||
                artists !== counts.artists ||
                snapshots !== counts.snapshots
            ) {
                throw new Error(
                    "Prepared records do not match their relationships or report counts."
                );
            }
        } finally {
            await rows.return(undefined);
        }

        complete = true;
        progress(true);

        return { artists, filename, snapshots, temporary };
    } finally {
        if (fd != null) {
            closeSync(fd);
        }

        if (!complete) {
            rmSync(temporary, { force: true, recursive: true });
        }
    }
};

async function* readJsonLines<T>(filename: string): AsyncGenerator<T> {
    const stream = createReadStream(filename, {
        encoding: "utf8",
        highWaterMark: MAX_LINE_BYTES,
    });
    let pending = "";

    try {
        for await (const chunk of stream) {
            pending += chunk;
            let newline = pending.indexOf("\n");

            while (newline !== -1) {
                const line = pending.slice(0, newline);

                if (
                    line.length === 0 ||
                    Buffer.byteLength(line) > MAX_LINE_BYTES
                ) {
                    throw new Error("Invalid or oversized import line.");
                }

                yield JSON.parse(line) as T;
                pending = pending.slice(newline + 1);
                newline = pending.indexOf("\n");
            }

            if (Buffer.byteLength(pending) > MAX_LINE_BYTES) {
                throw new Error("Oversized import line.");
            }
        }

        if (pending !== "") {
            yield JSON.parse(pending) as T;
        }
    } finally {
        stream.destroy();
    }
}

const readCounts = (input: unknown) => {
    const report = input as {
        counts?: { artists?: unknown; snapshots?: unknown };
    };

    if (
        !isPlainObject(report) ||
        report.counts == null ||
        !isPlainObject(report.counts)
    ) {
        throw new Error("Invalid import report.");
    }

    const { artists, snapshots } = report.counts;

    if (
        !isNumber(artists) ||
        !Number.isSafeInteger(artists) ||
        artists < 0 ||
        !isNumber(snapshots) ||
        !Number.isSafeInteger(snapshots) ||
        snapshots < 0
    ) {
        throw new Error("Invalid import report counts.");
    }

    return { artists, snapshots };
};

export { readJsonLines, stageImport };
