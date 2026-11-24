import { build } from "esbuild";
import { readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const hooks = fileURLToPath(new URL("./hooks/", import.meta.url));
const outdir = fileURLToPath(new URL("./dist/hooks/", import.meta.url));
const sources = (await readdir(hooks)).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")
);

await rm(outdir, { force: true, recursive: true });
// Transform each file independently. Bundling can hoist callback dependencies
// into a scope that PocketBase's isolated handler contexts cannot access.
await build({
    entryPoints: sources.map((name) => `${hooks}/${name}`),
    format: "cjs",
    outdir,
    platform: "neutral",
    target: "es2020",
});
