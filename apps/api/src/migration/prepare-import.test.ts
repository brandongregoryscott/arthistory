import { createHash } from "node:crypto";
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LegacySource } from "./legacy-source";
import { openLegacySource, validateSource } from "./legacy-source";
import { prepareImport } from "./prepare-import";

const id = (digit: string) => digit.repeat(22);

const monday = Date.parse("2026-01-05T00:00:00Z") / 1000;

type FixtureRow = [string, number, null | number, null | number];

type ExportSnapshot = {
    artist: string;
    capturedAt: string;
    metrics: {
        followers: null | number;
        monthlyListeners: null | number;
        popularity: null | number;
    };
    source: string;
    weekStart: string;
};

describe("prepareImport", () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(resolve(tmpdir(), "legacy-import-"));
    });

    afterEach(() => {
        rmSync(root, { force: true, recursive: true });
    });

    const readLines = (filename: string) =>
        readFileSync(filename, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line: string) => JSON.parse(line));

    const fixture = (
        label: string,
        rows: FixtureRow[],
        timestampUnit: LegacySource["timestampUnit"] = "seconds"
    ): LegacySource => {
        const filename = resolve(root, label + ".db");
        const db = new DatabaseSync(filename);
        db.exec(
            "CREATE TABLE artist_snapshots (id TEXT, timestamp NUMERIC, followers NUMERIC, popularity NUMERIC)"
        );
        const insert = db.prepare(
            "INSERT INTO artist_snapshots VALUES (?, ?, ?, ?)"
        );
        for (const row of rows) {
            insert.run(...row);
        }
        db.close();
        return { filename, timestampUnit };
    };

    const digest = (filename: string) =>
        createHash("sha256").update(readFileSync(filename)).digest("hex");

    it("prunes on latest known followers, includes exactly the cutoff and keeps earlier history", () => {
        const source = fixture("backup", [
            [id("1"), monday - 7 * 86400, 50, 1],
            [id("1"), monday, 10000, 0],
            [id("1"), monday + 86400, null, null],
            [id("2"), monday - 86400, 20000, 50],
            [id("2"), monday, 9999, 40],
            [id("3"), monday, null, null],
            [id("4"), monday, 1, null],
        ]);
        const before = digest(source.filename);
        const output = resolve(root, "export");

        const report = prepareImport({
            keepIds: [id("4"), id("5")],
            output,
            source,
        });

        expect(digest(source.filename)).toBe(before);
        expect(report.counts).toEqual({
            artists: 2,
            collapsedRows: 1,
            excludedArtists: 2,
            namedArtists: 0,
            retainedRows: 4,
            snapshots: 3,
            sourceRows: 7,
        });
        expect(report.missingKeepIds).toEqual([id("5")]);
        expect(report.nameCoverage).toEqual({ named: 0, unresolved: 2 });

        const snapshots = readLines(
            resolve(output, "snapshots.jsonl")
        ) as ExportSnapshot[];

        expect(snapshots[0]?.metrics).toEqual({
            followers: null,
            monthlyListeners: null,
            popularity: null,
        });
        expect(snapshots[1]?.metrics.followers).toBe(50);

        const artists = readLines(resolve(output, "artists.jsonl"));

        expect(
            artists.every(
                (artist) =>
                    artist.syncEnabled === false && artist.displayName === ""
            )
        ).toBe(true);
        expect(artists[0].id).toMatch(/^[a-z0-9]{15}$/);
        expect(
            readLines(resolve(output, "excluded-artists.jsonl")).map(
                (artist) => artist.spotifyId
            )
        ).toEqual([id("2"), id("3")]);
    });

    it("uses explicit milliseconds with deterministic rowid ties and whole capture values", () => {
        const source = fixture(
            "backup",
            [
                [id("1"), monday * 1000, 50000, 99],
                [id("1"), monday * 1000, 20000, 10],
                [id("1"), monday * 1000, null, 0],
            ],
            "milliseconds"
        );

        const report = prepareImport({
            output: resolve(root, "first"),
            source,
        });

        const snapshots = readLines(
            resolve(root, "first", "snapshots.jsonl")
        ) as ExportSnapshot[];

        expect(snapshots).toHaveLength(1);
        expect(snapshots[0]).toMatchObject({
            capturedAt: "2026-01-05T00:00:00.000Z",
            metrics: { followers: null, monthlyListeners: null, popularity: 0 },
            source: "legacy:3",
            weekStart: "2026-01-05T00:00:00.000Z",
        });
        expect(report.source.rows).toBe(3);

        prepareImport({ output: resolve(root, "second"), source });

        for (const file of readdirSync(resolve(root, "first"))) {
            expect(readFileSync(resolve(root, "first", file))).toEqual(
                readFileSync(resolve(root, "second", file))
            );
        }

        const opened = openLegacySource(source);

        try {
            expect(() =>
                opened.db.exec("DELETE FROM artist_snapshots")
            ).toThrow();
        } finally {
            opened.db.close();
        }
    });

    it("aligns Sunday and Monday captures to separate UTC weeks", () => {
        const source = fixture("backup", [
            [id("1"), monday - 1, 10000, 10],
            [id("1"), monday, 10000, 20],
        ]);

        prepareImport({ output: resolve(root, "export"), source });

        const rows = readLines(
            resolve(root, "export", "snapshots.jsonl")
        ) as ExportSnapshot[];

        expect(rows.map((row) => row.weekStart)).toEqual([
            "2026-01-05T00:00:00.000Z",
            "2025-12-29T00:00:00.000Z",
        ]);
    });

    it.each([
        { field: "followers", value: -1 },
        { field: "popularity", value: 101 },
        { field: "timestamp", value: monday * 1000 },
    ])(
        "rejects invalid $field without publishing partial output",
        ({ field, value }) => {
            const source = fixture("backup", [[id("1"), monday, 10000, 10]]);
            const db = new DatabaseSync(source.filename);
            db.prepare(`UPDATE artist_snapshots SET ${field} = ?`).run(value);
            db.close();

            expect(() =>
                prepareImport({
                    output: resolve(root, "export"),
                    source,
                })
            ).toThrow();

            expect(existsSync(resolve(root, "export"))).toBe(false);
            expect(readdirSync(root)).toEqual(["backup.db"]);
        }
    );

    it("rejects a roster-only database and existing output", () => {
        const source = fixture("backup", []);
        const db = new DatabaseSync(source.filename);
        db.exec(
            "DROP TABLE artist_snapshots; CREATE TABLE artist_ids (id TEXT)"
        );
        db.close();

        expect(() =>
            prepareImport({
                output: resolve(root, "export"),
                source,
            })
        ).toThrow("lacks artist_snapshots");

        expect(() => prepareImport({ output: root, source })).toThrow(
            "already exists"
        );
    });

    it("rejects invalid timestamp units and policies", () => {
        const source = fixture("backup", []);

        expect(() =>
            validateSource({ ...source, timestampUnit: "minutes" })
        ).toThrow("timestamp unit");

        expect(() =>
            prepareImport({
                cutoff: -1,
                output: resolve(root, "export"),
                source,
            })
        ).toThrow("Invalid cutoff");
    });
});
