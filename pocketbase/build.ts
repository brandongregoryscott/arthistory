import { build } from "esbuild";
import { readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const HOOKS = fileURLToPath(new URL("./hooks/", import.meta.url));

const OUTDIR = fileURLToPath(new URL("./dist/hooks/", import.meta.url));

const SOURCES = (await readdir(HOOKS)).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")
);

await rm(OUTDIR, { force: true, recursive: true });
// Transform each file independently. Bundling can hoist callback dependencies
// into a scope that PocketBase's isolated handler contexts cannot access.
await build({
    entryPoints: SOURCES.map((name) => `${HOOKS}/${name}`),
    format: "cjs",
    outdir: OUTDIR,
    platform: "neutral",
    target: "es2020",
});
