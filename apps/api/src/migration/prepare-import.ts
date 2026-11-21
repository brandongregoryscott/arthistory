import type { SQLOutputValue } from "node:sqlite";
import { isError } from "lodash";
import {
    closeSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    openSync,
    renameSync,
    rmSync,
    writeFileSync,
    writeSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { LegacySource } from "./legacy-source";
import { isSpotifyArtistId } from "../utilities/id-validation";
import { openLegacySource, validateSource } from "./legacy-source";
import { isNullableMetric } from "./metric-validation";
import { importId } from "./prepared-records";

type PrepareImportOptions = {
    cutoff?: number;
    keepIds?: string[];
    output: string;
    source: LegacySource;
};

type LegacyRow = Record<string, SQLOutputValue>;

const prepareImport = (options: PrepareImportOptions) => {
    const { cutoff = 10000, keepIds = [] } = options;
    const legacySource = validateSource(options.source);

    if (
        !Number.isSafeInteger(cutoff) ||
        cutoff < 0 ||
        keepIds.length > 1000 ||
        keepIds.some((id) => !isSpotifyArtistId(id))
    ) {
        throw new Error("Invalid cutoff or keep IDs (maximum 1000).");
    }

    const output = resolve(options.output);

    if (existsSync(output)) {
        throw new Error("Output already exists; choose a new directory.");
    }

    mkdirSync(dirname(output), { recursive: true });
    const temporary = mkdtempSync(
        resolve(dirname(output), `.${basename(output)}-`)
    );

    const descriptors: number[] = [];
    let source: ReturnType<typeof openLegacySource> | undefined;

    try {
        source = openLegacySource(legacySource);

        const createWriter = (filename: string) => {
            const fd = openSync(resolve(temporary, filename), "wx");
            descriptors.push(fd);

            return (value: unknown) =>
                writeSync(fd, JSON.stringify(value) + "\n");
        };

        const writeArtist = createWriter("artists.jsonl");
        const writeSnapshot = createWriter("snapshots.jsonl");
        const writeExcluded = createWriter("excluded-artists.jsonl");
        const writeError = createWriter("errors.jsonl");
        const keep = new Set(keepIds);
        const missingKeepIds = new Set(keepIds);

        const counts = {
            artists: 0,
            collapsedRows: 0,
            excludedArtists: 0,
            invalidRows: 0,
            namedArtists: 0,
            retainedRows: 0,
            snapshots: 0,
            sourceRows: 0,
        };

        let currentArtist = "";
        let currentWeek = "";
        let retained = false;
        let firstCapture: null | string = null;
        let lastCapture: null | string = null;

        // Audit raw rows before sorting/ranking. Invalid latest captures must
        // not determine whether an otherwise valid artist passes the cutoff.
        for (const row of source.rawRows.iterate()) {
            const { sourceRow } = row;
            if (
                typeof sourceRow !== "number" ||
                !Number.isSafeInteger(sourceRow)
            ) {
                throw new Error("Invalid source row number.");
            }
            counts.sourceRows++;
            try {
                validateRow(row);
            } catch (error) {
                writeError({
                    followers: row.followers,
                    id: row.id,
                    popularity: row.popularity,
                    reason: isError(error)
                        ? error.message
                        : "Invalid source row.",
                    sourceRow,
                    timestamp: row.timestamp,
                });
                source.excludeRow.run(sourceRow);
                counts.invalidRows++;
            }
        }

        for (const row of source.rows.iterate()) {
            const { captured, id } = validateRow(row);
            const capturedAt = new Date(captured).toISOString();

            if (firstCapture == null || capturedAt < firstCapture) {
                firstCapture = capturedAt;
            }

            if (lastCapture == null || capturedAt > lastCapture) {
                lastCapture = capturedAt;
            }

            if (id !== currentArtist) {
                currentArtist = id;
                currentWeek = "";
                missingKeepIds.delete(id);
                retained =
                    keep.has(id) ||
                    (typeof row.latestFollowers === "number" &&
                        row.latestFollowers >= cutoff);

                if (retained) {
                    counts.artists++;

                    writeArtist({
                        aliases: [],
                        displayName: "",
                        id: importId(`artist:${id}`),
                        metadataSource: "legacy-id",
                        searchNames: [],
                        spotifyId: id,
                        syncEnabled: false,
                    });
                } else {
                    counts.excludedArtists++;

                    writeExcluded({
                        latestFollowers: row.latestFollowers,
                        spotifyId: id,
                    });
                }
            }

            if (!retained) {
                continue;
            }

            counts.retainedRows++;

            const week = new Date(captured);
            week.setUTCHours(0, 0, 0, 0);
            week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
            const weekStart = week.toISOString();

            if (weekStart === currentWeek) {
                counts.collapsedRows++;
                continue;
            }

            currentWeek = weekStart;
            counts.snapshots++;

            writeSnapshot({
                artist: importId(`artist:${id}`),
                capturedAt,
                id: importId(`snapshot:${id}:${weekStart}`),
                metrics: {
                    followers: row.followers,
                    monthlyListeners: null,
                    popularity: row.popularity,
                },
                source: `legacy:${row.sourceRow}`,
                weekStart,
            });
        }

        const report = {
            counts,
            cutoff,
            firstCapture,
            lastCapture,
            missingKeepIds: [...missingKeepIds].sort(),
            nameCoverage: {
                named: counts.namedArtists,
                unresolved: counts.artists,
            },
            source: source.inventory,
            tiePolicy: "latest capture; larger source rowid",
        };

        writeFileSync(
            resolve(temporary, "report.json"),
            JSON.stringify(report, null, 4) + "\n",
            { flag: "wx" }
        );

        source.db.close();
        source = undefined;
        for (const fd of descriptors.splice(0)) {
            closeSync(fd);
        }

        renameSync(temporary, output);

        return report;
    } catch (error) {
        source?.db.close();
        for (const fd of descriptors) {
            closeSync(fd);
        }

        rmSync(temporary, { force: true, recursive: true });

        throw error;
    }
};

const validateRow = (row: LegacyRow) => {
    if (!isSpotifyArtistId(row.id)) {
        throw new Error("Invalid Spotify artist ID.");
    }

    if (
        typeof row.timestamp !== "number" ||
        !Number.isSafeInteger(row.timestamp) ||
        typeof row.captured !== "number" ||
        !Number.isSafeInteger(row.captured) ||
        row.captured < Date.UTC(2000, 0, 1) ||
        row.captured >= Date.UTC(2100, 0, 1)
    ) {
        throw new Error("Invalid timestamp; check explicit timestamp units.");
    }

    for (const key of ["followers", "popularity"] as const) {
        const value = row[key];

        if (!isNullableMetric(key, value)) {
            throw new Error(`Invalid legacy metric: ${key}.`);
        }
    }

    return { captured: row.captured, id: row.id };
};

export { prepareImport };
export type { PrepareImportOptions };
