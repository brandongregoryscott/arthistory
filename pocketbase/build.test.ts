import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { beforeAll, describe, expect, it, vi } from "vitest";

type Handler = (...args: unknown[]) => unknown;

type CommonJSModule = { exports: Record<string, unknown> };

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const HOOKS = resolve(ROOT, "pocketbase/dist/hooks");

// Load the actual build output as CommonJS without Node's module resolver or
// globals. Recreate each registered callback in a fresh context, as PocketBase
// does, so a compiler-generated reference to outer scope fails here.
const loadCommonJS = (filename: string): Record<string, unknown> => {
    const module: CommonJSModule = { exports: {} };

    runInNewContext(readFileSync(filename, "utf8"), {
        exports: module.exports,
        module,
        require: (path: string) =>
            loadCommonJS(resolve(dirname(filename), path)),
    });

    return module.exports;
};

describe("compiled PocketBase hooks", () => {
    beforeAll(() => {
        execFileSync(
            process.execPath,
            ["--import", "tsx", "pocketbase/build.ts"],
            {
                cwd: ROOT,
            }
        );
    });

    it("emits CommonJS helpers and excludes tests from deployment", () => {
        expect(readdirSync(HOOKS).sort()).toEqual([
            "artist-page-http.js",
            "artist-page-parser.js",
            "artist-sync.js",
            "artist-sync.pb.js",
            "constants.js",
            "validation.js",
            "validation.pb.js",
        ]);
        expect(loadCommonJS(resolve(HOOKS, "constants.js"))).toEqual({
            MISSING_METRIC: -1,
        });
    });

    it("executes a compiled validation callback in isolation", () => {
        const handlers = new Map<string, Handler>();

        runInNewContext(
            readFileSync(resolve(HOOKS, "validation.pb.js"), "utf8"),
            {
                onRecordValidate: (handler: Handler, collection: string) =>
                    handlers.set(collection, handler),
            }
        );

        const next = vi.fn();
        const record = {
            getFloat: () => 1,
            getString: (field: string) =>
                field === "weekStart"
                    ? "2026-11-16T00:00:00Z"
                    : "2026-11-18T12:00:00Z",
        };
        const source = `(${String(handlers.get("song_snapshots"))})(event)`;
        const context = {
            __hooks: HOOKS,
            event: { next, record },
            require: loadCommonJS,
        };

        runInNewContext(source, context);
        expect(next).toHaveBeenCalledOnce();
        record.getFloat = () => -2;
        expect(() => runInNewContext(source, context)).toThrow("listen count");
    });

    it("executes the compiled cron callback in isolation", () => {
        let scheduled: Handler | undefined;

        runInNewContext(
            readFileSync(resolve(HOOKS, "artist-sync.pb.js"), "utf8"),
            {
                cronAdd: (
                    _name: string,
                    _schedule: string,
                    handler: Handler
                ) => {
                    scheduled = handler;
                },
                onBootstrap: vi.fn(),
                onRecordUpdateRequest: vi.fn(),
            }
        );

        const runInTransaction = vi.fn();
        const error = vi.fn();

        runInNewContext(`(${String(scheduled)})()`, {
            __hooks: HOOKS,
            $app: { logger: () => ({ error }), runInTransaction },
            require: loadCommonJS,
        });
        expect(error).not.toHaveBeenCalled();
        expect(runInTransaction).toHaveBeenCalledTimes(2);
    });
});
