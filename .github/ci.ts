import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const targets = [
    "workflow",
    "quality",
    "api",
    "web",
    "scripts",
    "api_container",
    "cron_container",
] as const;

type Target = (typeof targets)[number];
type Selection = Record<Target, boolean>;
type JobResult = { result: string; outputs?: Record<string, string> };

const applicationTargets: Target[] = [
    "quality",
    "api",
    "web",
    "scripts",
    "api_container",
    "cron_container",
];

const sharedInputs = new Set([
    "package-lock.json",
    "npm-shrinkwrap.json",
    "package.json",
    ".npmrc",
    ".nvmrc",
    "tsconfig.json",
    "turbo.json",
]);

const selectJobs = (files: string[], full = false): Selection => {
    const selection = Object.fromEntries(
        targets.map((target) => [target, full])
    ) as Selection;
    const enable = (...names: Target[]) => {
        for (const name of names) {
            selection[name] = true;
        }
    };

    for (const file of files) {
        // Both images install the entire workspace graph and copy every manifest.
        if (
            sharedInputs.has(file) ||
            file.endsWith("/package.json") ||
            file.startsWith(".github/")
        ) {
            enable(...targets);
        } else if (file.endsWith(".md")) {
            enable("quality");
        } else if (
            file.startsWith("packages/typescript-config/") ||
            file.startsWith("packages/common/")
        ) {
            enable(...applicationTargets);
        } else if (file.startsWith("apps/api/")) {
            enable("quality", "api", "api_container");
        } else if (
            file.startsWith("apps/web/") ||
            file.startsWith("packages/ui/")
        ) {
            enable("quality", "web");
        } else if (file.startsWith("packages/scripts/")) {
            enable("quality", "scripts", "cron_container");
        } else if (file === "Dockerfile.api") {
            enable("api_container");
        } else if (file === "Dockerfile.cron") {
            enable("cron_container");
        } else if (file === ".dockerignore") {
            enable("api_container", "cron_container");
        } else if (
            ["eslint.config.mjs", ".prettierrc", ".prettierignore"].includes(
                file
            )
        ) {
            enable("quality");
        } else if (
            [
                "render.yaml",
                "docker-compose.yml",
                "docker-compose.override.yml",
                ".gitignore",
            ].includes(file)
        ) {
            // These files are not inputs to the application checks or image builds.
            continue;
        } else {
            // New packages or configuration should receive full coverage until mapped.
            enable(...targets);
        }
    }
    return selection;
};

type ChangeEvent = {
    before?: string;
    after?: string;
    pull_request?: { base: { sha: string }; head: { sha: string } };
};

const changedFiles = (
    eventName: string,
    event: ChangeEvent
): string[] | null => {
    if (eventName === "workflow_dispatch") {
        return null;
    }
    const pullRequest =
        eventName === "pull_request" ? event.pull_request : undefined;
    const base = pullRequest?.base.sha ?? event.before;
    const head = pullRequest?.head.sha ?? event.after;
    const validSha = (sha: string | undefined): sha is string =>
        sha !== undefined && /^[a-f0-9]{40}$/i.test(sha) && !/^0+$/.test(sha);
    if (!validSha(base) || !validSha(head)) {
        return null;
    }
    const range =
        pullRequest === undefined ? `${base}..${head}` : `${base}...${head}`;
    try {
        // No rename detection: both the old and new path must invalidate their owners.
        return execFileSync(
            "git",
            [
                "diff",
                "--no-ext-diff",
                "--name-only",
                "--no-renames",
                "-z",
                range,
                "--",
            ],
            {
                encoding: "utf8",
                maxBuffer: 16 * 1024 * 1024,
                stdio: ["ignore", "pipe", "pipe"],
            }
        )
            .split("\0")
            .filter(Boolean);
    } catch {
        // Missing history must never silently turn required checks off.
        return null;
    }
};

const checkResults = (needs: Record<string, JobResult>): void => {
    if (needs.changes?.result !== "success") {
        throw new Error("Change detection did not succeed.");
    }
    for (const target of targets) {
        const selected = needs.changes.outputs?.[target];
        if (selected !== "true" && selected !== "false") {
            throw new Error(`Missing selection for ${target}.`);
        }
        const expected = selected === "true" ? "success" : "skipped";
        if (needs[target]?.result !== expected) {
            throw new Error(
                `${target}: expected ${expected}, got ${needs[target]?.result ?? "missing"}.`
            );
        }
    }
};

if (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    if (process.argv[2] === "detect") {
        const event = JSON.parse(
            readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")
        ) as ChangeEvent;
        const files = changedFiles(process.env.GITHUB_EVENT_NAME ?? "", event);
        const selected = selectJobs(files ?? [], files === null);
        appendFileSync(
            process.env.GITHUB_OUTPUT ?? "",
            targets.map((target) => `${target}=${selected[target]}\n`).join("")
        );
        process.stdout.write(
            `Selected jobs: ${targets.filter((target) => selected[target]).join(", ") || "none"}\n`
        );
        if (files === null) {
            process.stdout.write(
                "Full coverage: manual run or unavailable comparison.\n"
            );
        }
    } else if (process.argv[2] === "check") {
        checkResults(
            JSON.parse(process.env.NEEDS_JSON ?? "{}") as Record<
                string,
                JobResult
            >
        );
    } else {
        throw new Error("Expected detect or check.");
    }
}

export { changedFiles, checkResults, selectJobs, targets };
