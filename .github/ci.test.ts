import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { changedFiles, checkResults, selectJobs, targets } from "./ci.ts";

const selected = (files: string[]) =>
    targets.filter((target) => selectJobs(files)[target]);

test("selects checks from actual source and packaging dependencies", (t) => {
    const cases = [
        { files: ["render.yaml"], jobs: [] },
        {
            files: ["apps/api/src/app.ts"],
            jobs: ["quality", "api", "api_container"],
        },
        { files: ["apps/web/routes/index.tsx"], jobs: ["quality", "web"] },
        { files: ["packages/ui/src/header.tsx"], jobs: ["quality", "web"] },
        {
            files: ["packages/scripts/src/sync/sync.ts"],
            jobs: ["quality", "scripts", "cron_container"],
        },
        {
            files: ["packages/common/api/routes.ts"],
            jobs: targets.filter((target) => target !== "workflow"),
        },
        {
            files: ["packages/typescript-config/base.json"],
            jobs: targets.filter((target) => target !== "workflow"),
        },
        { files: ["Dockerfile.api"], jobs: ["api_container"] },
        { files: ["Dockerfile.cron"], jobs: ["cron_container"] },
        { files: [".dockerignore"], jobs: ["api_container", "cron_container"] },
        { files: ["README.md"], jobs: ["quality"] },
        { files: ["eslint.config.mjs"], jobs: ["quality"] },
        { files: ["package-lock.json"], jobs: [...targets] },
        { files: ["apps/web/package.json"], jobs: [...targets] },
        { files: ["packages/ui/package.json"], jobs: [...targets] },
        { files: [".github/workflows/ci.mts"], jobs: [...targets] },
        { files: ["packages/new-package/source.ts"], jobs: [...targets] },
        { files: ["unrecognized.config.ts"], jobs: [...targets] },
    ];
    for (const { files, jobs } of cases) {
        t.assert.deepEqual(selected(files), jobs, files.join(", "));
    }
});

test("unions owners across files and runs everything for manual or unknown comparisons", (t) => {
    t.assert.deepEqual(selected(["apps/web/main.tsx", "Dockerfile.cron"]), [
        "quality",
        "web",
        "cron_container",
    ]);
    t.assert.deepEqual(
        targets.filter((target) => selectJobs([], true)[target]),
        [...targets]
    );
    t.assert.equal(changedFiles("workflow_dispatch", {}), null);
    t.assert.equal(
        changedFiles("push", { before: "0".repeat(40), after: "1".repeat(40) }),
        null
    );
    t.assert.equal(
        changedFiles("push", { before: "--unsafe", after: "1".repeat(40) }),
        null
    );
});

test("accepts only intentional skips and successful selected jobs", (t) => {
    const selection = selectJobs(["apps/web/main.tsx"]);
    const needs = {
        changes: {
            result: "success",
            outputs: Object.fromEntries(
                targets.map((target) => [target, String(selection[target])])
            ),
        },
        ...Object.fromEntries(
            targets.map((target) => [
                target,
                { result: selection[target] ? "success" : "skipped" },
            ])
        ),
    };
    t.assert.doesNotThrow(() => checkResults(needs));
    for (const result of ["failure", "cancelled", "skipped", ""]) {
        t.assert.throws(
            () => checkResults({ ...needs, web: { result } }),
            /web/
        );
    }
    t.assert.throws(
        () => checkResults({ ...needs, changes: { result: "failure" } }),
        /detection/
    );
    t.assert.throws(
        () =>
            checkResults({
                ...needs,
                changes: { result: "success", outputs: {} },
            }),
        /selection/
    );
    t.assert.throws(
        () => checkResults({ ...needs, api: { result: "failure" } }),
        /api/
    );
    t.assert.throws(
        () => checkResults({ ...needs, api: { result: "success" } }),
        /api/
    );
});

test("compares the whole PR, push commit range, and both sides of cross-package renames", (t) => {
    const directory = mkdtempSync(join(tmpdir(), "arthistory-ci-"));
    const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
    const cwd = process.cwd();
    try {
        git("init", "-q", "-b", "main");
        git("config", "user.name", "CI test");
        git("config", "user.email", "ci@example.invalid");
        git("config", "commit.gpgsign", "false");
        git("config", "core.hooksPath", "/dev/null");
        mkdirSync(join(directory, "apps/api"), { recursive: true });
        mkdirSync(join(directory, "apps/web"), { recursive: true });
        writeFileSync(join(directory, "apps/api/source.ts"), "original\n");
        git("add", ".");
        git("commit", "-qm", "base");
        const base = git("rev-parse", "HEAD");
        git("switch", "-qc", "feature");
        git("mv", "apps/api/source.ts", "apps/web/source.ts");
        git("commit", "-qm", "rename");
        const first = git("rev-parse", "HEAD");
        writeFileSync(join(directory, "second.txt"), "second\n");
        git("add", ".");
        git("commit", "-qm", "second");
        const head = git("rev-parse", "HEAD");
        git("switch", "-q", "main");
        writeFileSync(join(directory, "main-only.txt"), "advanced base\n");
        git("add", ".");
        git("commit", "-qm", "advance base");
        const advancedBase = git("rev-parse", "HEAD");
        process.chdir(directory);
        t.assert.deepEqual(
            changedFiles("pull_request", {
                pull_request: {
                    base: { sha: advancedBase },
                    head: { sha: head },
                },
            }),
            ["apps/api/source.ts", "apps/web/source.ts", "second.txt"]
        );
        t.assert.deepEqual(
            changedFiles("push", { before: first, after: head }),
            ["second.txt"]
        );
        t.assert.deepEqual(
            changedFiles("push", { before: base, after: head }),
            ["apps/api/source.ts", "apps/web/source.ts", "second.txt"]
        );
        t.assert.equal(
            changedFiles("push", { before: "a".repeat(40), after: head }),
            null
        );
        // Path detection must work without downloading historical binary blobs.
        git("config", "uploadpack.allowFilter", "true");
        const partial = join(directory, "partial");
        execFileSync("git", [
            "clone",
            "--quiet",
            "--filter=blob:none",
            "--no-checkout",
            pathToFileURL(directory).href,
            partial,
        ]);
        const partialGit = (...args: string[]) =>
            execFileSync("git", ["-C", partial, ...args], { encoding: "utf8" });
        const missing = partialGit(
            "rev-list",
            "--objects",
            "--all",
            "--missing=print"
        );
        t.assert.equal(
            missing.split("\n").some((line) => line.startsWith("?")),
            true
        );
        partialGit(
            "remote",
            "set-url",
            "origin",
            join(directory, "unavailable-remote")
        );
        process.chdir(partial);
        t.assert.deepEqual(
            changedFiles("push", { before: base, after: head }),
            ["apps/api/source.ts", "apps/web/source.ts", "second.txt"]
        );
        process.chdir(directory);
        const unusualPath = "apps/api/name\nwith spaces.ts";
        writeFileSync(join(directory, unusualPath), "new file\n");
        git("add", unusualPath);
        git("commit", "-qm", "unusual filename");
        const unusualHead = git("rev-parse", "HEAD");
        t.assert.deepEqual(
            changedFiles("push", { before: advancedBase, after: unusualHead }),
            [unusualPath]
        );
    } finally {
        process.chdir(cwd);
        rmSync(directory, { recursive: true, force: true });
    }
});

test("accepts a Render-only change without running application jobs", (t) => {
    const needs: Parameters<typeof checkResults>[0] = {
        changes: {
            result: "success",
            outputs: Object.fromEntries(
                targets.map((target) => [target, "false"])
            ),
        },
        ...Object.fromEntries(
            targets.map((target) => [target, { result: "skipped" }])
        ),
    };

    t.assert.deepEqual(selected(["render.yaml"]), []);
    t.assert.doesNotThrow(() => checkResults(needs));
    delete needs.api;
    t.assert.throws(() => checkResults(needs), /api/);
});
