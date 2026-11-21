import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

            const hooks = resolve(root, "hooks");
            cpSync(new URL("../hooks/", import.meta.url), hooks, {
                recursive: true,
            });
            cpSync(
                new URL("./fixture.js", import.meta.url),
                resolve(hooks, "fixture.js")
            );
            writeFileSync(
                resolve(hooks, "test.pb.js"),
                `
            $app.rootCmd.addCommand(new Command({
                use: "test-schema",
                run: () => {
                    $app.bootstrap();
                    require(__hooks + "/fixture.js")($app);
                }
            }));
        `
            );
            const run = (...args) =>
                execFileSync(
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
            run("migrate", "up");
            run("test-schema");
            assert.match(run("migrate", "up"), /No new migrations/);
            assert.match(
                run("migrate", "down", "1", "--automigrate=false"),
                /Reverted 1794900000_collections.js/
            );
            run("migrate", "up");
            run("test-schema");
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    }
);
