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

type ImportCounts = { artists: number; snapshots: number };

const readPreparedImport = (directory: string) => {
    const reportFile = resolve(directory, "report.json");
    if (statSync(reportFile).size > MAX_REPORT_BYTES) {
        throw new Error("Import report is too large.");
    }
    const report: unknown = JSON.parse(readFileSync(reportFile, "utf8"));
    const counts = readCounts(report);
    return { ...counts, records: readPreparedRecords(directory, counts) };
};

// Both modes validate every record and cross-file relationship. Streaming mode
// discovers late errors after earlier batches may already have been written.
async function* readPreparedRecords(
    directory: string,
    counts: ImportCounts
): AsyncGenerator<ImportItem> {
    const rows = readJsonLines<unknown>(resolve(directory, "snapshots.jsonl"));
    let artists = 0;
    let snapshots = 0;
    let previousArtist = "";
    try {
        let next = await rows.next();
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
            yield { collection: "artists", record: artist };
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
                yield { collection: "snapshots", record: snapshot };
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
}

// Default mode freezes the full validated export before target requests. Private
// spooling keeps memory bounded and isolates loading from concurrent input edits.
const stageImport = async (
    directory: string,
    reportProgress?: ReportImportProgress
) => {
    const prepared = readPreparedImport(directory);
    const temporary = mkdtempSync(resolve(tmpdir(), "arthistory-import-"));
    const filename = resolve(temporary, "records.jsonl");
    let fd: number | undefined;
    let complete = false;
    let processed = 0;
    const total = prepared.artists + prepared.snapshots;
    const progress = (force = false) =>
        reportProgress?.({ phase: "validating", processed, total }, force);
    try {
        fd = openSync(filename, "wx", 0o600);
        progress();
        for await (const item of prepared.records) {
            writeFileSync(fd, JSON.stringify(item) + "\n");
            processed++;
            progress();
        }
        progress(true);
        complete = true;
        return {
            artists: prepared.artists,
            filename,
            records: readJsonLines<ImportItem>(filename),
            snapshots: prepared.snapshots,
            temporary,
        };
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

export { readJsonLines, readPreparedImport, stageImport };
