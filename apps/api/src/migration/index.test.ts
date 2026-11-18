import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("migration CLI", () => {
    let root: string;
    let filename: string;

    beforeEach(() => {
        root = mkdtempSync(resolve(tmpdir(), "legacy-cli-"));
        filename = resolve(root, "backup.db");
        const db = new DatabaseSync(filename);
        db.exec(`CREATE TABLE artist_snapshots (id TEXT, timestamp NUMERIC, followers NUMERIC, popularity NUMERIC);
            INSERT INTO artist_snapshots VALUES ('1111111111111111111111', 1767571200, 10000, NULL)`);
        db.close();
    });

    afterEach(() => rmSync(root, { force: true, recursive: true }));

    const run = (...args: string[]) =>
        spawnSync(
            process.execPath,
            [
                "--import",
                "tsx",
                resolve(__dirname, "index.ts"),
                "--source",
                filename,
                "--timestamp-unit",
                "seconds",
                ...args,
            ],
            { encoding: "utf8" }
        );

    it("returns after inventory without requiring an output directory", () => {
        const result = run("--inventory");

        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout).rows).toBe(1);
    });

    it("uses the supplied decimal integer cutoff", () => {
        const output = resolve(root, "export");

        const result = run("--output", output, "--cutoff", "10001");

        expect(result.status).toBe(0);
        expect(
            JSON.parse(readFileSync(resolve(output, "report.json"), "utf8"))
                .counts.artists
        ).toBe(0);
    });

    it.each(["10000.5", "10000oops", "1e4", "-1", "", "9007199254740992"])(
        "rejects invalid cutoff %j without truncation or partial output",
        (cutoff) => {
            const output = resolve(root, "export");

            const result = run("--output", output, "--cutoff", cutoff);

            expect(result.status).not.toBe(0);
            expect(result.stderr).toMatch(/cutoff/i);
            expect(existsSync(output)).toBe(false);
        }
    );
});
