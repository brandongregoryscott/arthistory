import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
    cpSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

test(
    "real PocketBase migrations, validation, indexes, transactions and reapply",
    {
        skip:
            process.env.POCKETBASE_TEST_BINARY == null
                ? "Set POCKETBASE_TEST_BINARY to run the real PocketBase integration test"
                : false,
    },
    () => {
        const binary = process.env.POCKETBASE_TEST_BINARY;
        assert.ok(
            binary,
            "Set POCKETBASE_TEST_BINARY to the pinned v0.40.6 executable"
        );
        assert.match(
            execFileSync(binary, ["--version"], { encoding: "utf8" }),
            /0\.40\.6/
        );
        const root = mkdtempSync(resolve(tmpdir(), "arthistory-schema-"));
        try {
            const migrations = resolve(root, "migrations");
            mkdirSync(migrations);
            cpSync(new URL("../migrations/", import.meta.url), migrations, {
                recursive: true,
            });

            const columnsMigration = "1794900003_snapshot_columns.js";
            rmSync(resolve(migrations, columnsMigration));

            const hooks = resolve(root, "hooks");
            cpSync(new URL("../hooks/", import.meta.url), hooks, {
                recursive: true,
            });
            cpSync(
                new URL("./fixture.js", import.meta.url),
                resolve(hooks, "fixture.js")
            );
            cpSync(
                new URL("./name-backfill-fixture.js", import.meta.url),
                resolve(hooks, "name-backfill-fixture.js")
            );
            cpSync(
                new URL("./collector-fixture.js", import.meta.url),
                resolve(hooks, "collector-fixture.js")
            );
            cpSync(
                new URL("./restore-fixture.js", import.meta.url),
                resolve(hooks, "restore-fixture.js")
            );
            cpSync(
                new URL("./metric-columns-fixture.js", import.meta.url),
                resolve(hooks, "metric-columns-fixture.js")
            );
            cpSync(
                new URL("./history-fixture.js", import.meta.url),
                resolve(hooks, "history-fixture.js")
            );
            const restorePhase = resolve(root, "restore-phase");
            const pageFixture = readFileSync(
                resolve("apps/api/src/artists/fixtures/artist.html"),
                "utf8"
            );
            const state = JSON.parse(
                Buffer.from(
                    />([^<]+)</.exec(pageFixture)[1],
                    "base64"
                ).toString("utf8")
            );
            state.entities.items[
                "spotify:artist:6lcwlkAjBPSKnFBZjjZFJs"
            ].profile.name = "東京事変 & Sigur Rós";
            const unicodeFixture =
                '<script id="initialState">' +
                Buffer.from(JSON.stringify(state)).toString("base64") +
                "</script>";
            const prepared = resolve(root, "prepared");
            execFileSync(process.execPath, [
                "--import",
                "tsx",
                resolve("apps/api/src/migration/index.ts"),
                "--source",
                resolve("pocketbase/tests/fixtures/legacy.db"),
                "--timestamp-unit",
                "seconds",
                "--output",
                prepared,
            ]);
            const items = ["artists", "snapshots"].flatMap((collection) =>
                readFileSync(resolve(prepared, collection + ".jsonl"), "utf8")
                    .trim()
                    .split("\n")
                    .filter(Boolean)
                    .map((line) => ({
                        collection,
                        record:
                            collection === "snapshots"
                                ? (() => {
                                      const { metrics, ...record } =
                                          JSON.parse(line);
                                      return {
                                          ...record,
                                          followers: metrics.followers ?? -1,
                                          monthlyListeners:
                                              metrics.monthlyListeners ?? -1,
                                          popularity: metrics.popularity ?? -1,
                                      };
                                  })()
                                : JSON.parse(line),
                    }))
            );
            assert.ok(items.length > 0 && items.length < 1000);
            cpSync(
                new URL("./prepared-fixture.js", import.meta.url),
                resolve(hooks, "prepared-fixture.js")
            );

            writeFileSync(
                resolve(hooks, "test.pb.js"),
                `
            $app.rootCmd.addCommand(new Command({ use: "test-history", run: () => { $app.bootstrap(); require(__hooks + "/history-fixture.js")($app); } }));
            for (const phase of ["seed", "columns", "json", "cleanup"]) {
                $app.rootCmd.addCommand(new Command({ use: "test-metrics-" + phase, run: () => { $app.bootstrap(); require(__hooks + "/metric-columns-fixture.js")($app, phase); } }));
            }
            onRecordUpdate((e) => {
                if (e.record.getString("attemptToken") === "" && e.record.original().getString("attemptToken") === "rollback-attempt") { throw new Error("Simulated completion save failure"); }
                return e.next();
            }, "sync_state");
            $app.rootCmd.addCommand(new Command({ use: "test-restore", run: (cmd) => { $app.bootstrap(); require(__hooks + "/restore-fixture.js")($app, cmd, ${JSON.stringify(restorePhase)}); } }));
            $app.rootCmd.addCommand(new Command({ use: "test-collector", run: () => { $app.bootstrap(); require(__hooks + "/collector-fixture.js")($app); } }));
            for (const phase of ["crash", "restart"]) {
                $app.rootCmd.addCommand(new Command({ use: "test-collector-" + phase, run: () => { $app.bootstrap(); require(__hooks + "/name-backfill-fixture.js")[phase]($app, "snapshots"); } }));
            }
            for (const mode of ["crash", "restart"]) {
                $app.rootCmd.addCommand(new Command({
                    use: "test-name-" + mode,
                    run: () => { $app.bootstrap(); require(__hooks + "/name-backfill-fixture.js")[mode]($app); }
                }));
            }
            $app.rootCmd.addCommand(new Command({
                use: "test-name-backfill",
                run: () => {
                    $app.bootstrap();
                    require(__hooks + "/name-backfill-fixture.js")($app, ${JSON.stringify(pageFixture)}, ${JSON.stringify(unicodeFixture)});
                }
            }));
            $app.rootCmd.addCommand(new Command({
                use: "test-schema",
                run: () => {
                    $app.bootstrap();
                    require(__hooks + "/fixture.js")($app);
                }
            }));
            $app.rootCmd.addCommand(new Command({
                use: "test-prepared",
                run: (cmd) => {
                    $app.bootstrap();
                    require(__hooks + "/prepared-fixture.js")($app, ${JSON.stringify(items)}, cmd);
                }
            }));
        `
            );
            const run = (...args) => {
                const output = execFileSync(
                    binary,
                    [
                        ...args,
                        "--dir",
                        resolve(root, "data"),
                        "--migrationsDir",
                        migrations,
                        "--hooksDir",
                        hooks,
                    ],
                    { encoding: "utf8", input: "y\n" }
                );
                assert.doesNotMatch(output, /failed to execute .*\.pb\.js/i);
                return output;
            };
            run("migrate", "up");
            run("test-metrics-seed");
            cpSync(
                new URL("../migrations/" + columnsMigration, import.meta.url),
                resolve(migrations, columnsMigration)
            );
            run("migrate", "up");
            run("test-metrics-columns");
            run("migrate", "down", "1", "--automigrate=false");
            run("test-metrics-json", "--automigrate=false");
            run("migrate", "up");
            run("test-metrics-cleanup");
            run("test-schema");
            run("test-history");
            process.stdout.write(run("test-prepared"));
            const backupBytes = statSync(
                resolve(root, "data", "backups", "prepared-fixture.zip")
            ).size;
            assert.ok(backupBytes > 0);
            process.stdout.write(
                "Native fixture backup bytes: " + backupBytes + "\n"
            );
            assert.match(run("migrate", "up"), /No new migrations/);
            assert.match(
                run("migrate", "down", "4", "--automigrate=false"),
                /Reverted 1794900000_collections.js/
            );
            run("migrate", "up");
            run("test-schema");
            run("test-name-crash");
            run("test-name-restart");
            run("test-name-backfill");
            run("test-collector");
            run("test-collector-crash");
            run("test-collector-restart");
            run("test-restore");
            assert.equal(readFileSync(restorePhase, "utf8"), "verified");
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    }
);
