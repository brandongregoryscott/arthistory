import { conditions, job, step, workflow } from "gagen";

const checkout = step({ uses: "actions/checkout@v7.0.1" });
const setupNode = step.dependsOn(checkout)({
    uses: "actions/setup-node@v7.1.0",
    with: { "node-version-file": ".nvmrc", cache: "npm" },
});
const install = step.dependsOn(setupNode)({
    name: "Install dependencies",
    run: "npm ci",
});

// Every image installs the workspace graph, so manifests affect all consumers.
const sharedInputs = [
    ".github/**",
    "**/package.json",
    "package-lock.json",
    "npm-shrinkwrap.json",
    ".npmrc",
    ".nvmrc",
    "tsconfig.json",
    "turbo.json",
];
const applicationInputs = [
    ...sharedInputs,
    "packages/common/**",
    "packages/typescript-config/**",
];
const filters = {
    workflow: sharedInputs,
    quality: [
        ...applicationInputs,
        "apps/**",
        "packages/**",
        "**/*.md",
        "eslint.config.mjs",
        ".prettier*",
    ],
    api: [...applicationInputs, "apps/api/**"],
    web: [...applicationInputs, "apps/web/**", "packages/ui/**"],
    scripts: [...applicationInputs, "packages/scripts/**"],
    api_container: [
        ...applicationInputs,
        "apps/api/**",
        "Dockerfile.api",
        ".dockerignore",
    ],
    cron_container: [
        ...applicationInputs,
        "packages/scripts/**",
        "Dockerfile.cron",
        ".dockerignore",
    ],
};
const targets = Object.keys(filters) as Array<keyof typeof filters>;
const changesCheckout = step({
    uses: "actions/checkout@v7.0.1",
    if: "github.event_name != 'pull_request'",
    with: { "fetch-depth": 0, filter: "blob:none" },
});
const detect = step({
    id: "detect",
    uses: "dorny/paths-filter@v4.0.3",
    outputs: targets,
    with: {
        base: "${{ github.ref }}",
        filters: JSON.stringify(filters, null, 2),
    },
});
const changes = job("changes", {
    name: "affected jobs",
    runsOn: "ubuntu-latest",
    timeoutMinutes: 5,
    permissions: { contents: "read", "pull-requests": "read" },
    outputs: Object.fromEntries(
        targets.map((target) => [
            target,
            conditions
                .isEvent("workflow_dispatch")
                .then("true")
                .else(detect.outputs[target]),
        ])
    ),
    steps: [changesCheckout, detect],
});

const workflowCheck = job("workflow", {
    name: "workflow",
    needs: [changes],
    if: "needs.changes.outputs.workflow == 'true'",
    runsOn: "ubuntu-latest",
    timeoutMinutes: 15,
    steps: [
        step.dependsOn(install)({
            name: "Check workflow source and generation",
            run: `npm run ci:typecheck
npm run ci:lint
npm run ci:check
npm exec prettier -- --check .github/workflows/ci.mts .github/tsconfig.json .github/eslint.config.mjs`,
        }),
        step({
            uses: "docker://rhysd/actionlint@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667",
            with: { args: "-color .github/workflows/ci.generated.yml" },
        }),
    ],
});

const quality = job("quality", {
    name: "format and lint",
    needs: [changes],
    if: "needs.changes.outputs.quality == 'true'",
    runsOn: "ubuntu-latest",
    timeoutMinutes: 15,
    steps: [
        step.dependsOn(install)({
            name: "Check formatting and lint",
            run: "npm run format\nnpm run lint",
        }),
    ],
});

const api = job("api", {
    name: "API checks",
    needs: [changes],
    if: "needs.changes.outputs.api == 'true'",
    runsOn: "ubuntu-latest",
    timeoutMinutes: 15,
    steps: [
        step.dependsOn(install)({
            name: "Check API",
            run: "npm run typecheck --workspace=api\nnpm run test --workspace=api\nnpm run build --workspace=api",
        }),
    ],
});

const web = job("web", {
    name: "web checks",
    needs: [changes],
    if: "needs.changes.outputs.web == 'true'",
    runsOn: "ubuntu-latest",
    timeoutMinutes: 15,
    steps: [
        step.dependsOn(install)({
            name: "Check web",
            run: "npm run typecheck --workspace=web\nnpm run build --workspace=web",
        }),
    ],
});

const scripts = job("scripts", {
    name: "script checks",
    needs: [changes],
    if: "needs.changes.outputs.scripts == 'true'",
    runsOn: "ubuntu-latest",
    timeoutMinutes: 15,
    steps: [
        step.dependsOn(install)({
            name: "Check scripts",
            run: "npm run typecheck --workspace=scripts",
        }),
    ],
});

const containerJob = (image: "api" | "cron") =>
    job(`${image}_container`, {
        name: `container (${image})`,
        needs: [changes],
        if: `needs.changes.outputs.${image}_container == 'true'`,
        runsOn: "ubuntu-latest",
        timeoutMinutes: 30,
        steps: [
            checkout,
            step({ uses: "docker/setup-buildx-action@v4.4.1" }),
            step({
                name: "Build image",
                uses: "docker/build-push-action@v7.4.0",
                with: {
                    context: ".",
                    file: `Dockerfile.${image}`,
                    push: false,
                    load: true,
                    tags: `ci-${image}:check`,
                    "build-args": "SOURCE_VERSION=${{ github.sha }}",
                    "cache-from": `type=gha,scope=${image}`,
                    "cache-to": `type=gha,mode=max,scope=${image}`,
                },
            }),
            step({
                name: "Check native SQLite",
                run:
                    image === "api"
                        ? "docker run --rm --entrypoint node ci-api:check -e \"require('./build/Release/node_sqlite3.node')\""
                        : "docker run --rm --entrypoint node ci-cron:check -e \"const sqlite = require('/app/node_modules/sqlite3'); const db = new sqlite.Database(':memory:'); db.exec('CREATE TABLE smoke (id INTEGER)', error => { if (error) throw error; db.close(); });\"",
            }),
        ],
    });
const apiContainer = containerJob("api");
const cronContainer = containerJob("cron");

const ci = job("ci", {
    name: "ci",
    needs: [
        changes,
        workflowCheck,
        quality,
        api,
        web,
        scripts,
        apiContainer,
        cronContainer,
    ],
    if: "always()",
    runsOn: "ubuntu-latest",
    timeoutMinutes: 5,
    steps: [
        step({
            name: "Require affected checks to succeed",
            env: { NEEDS_JSON: "${{ toJSON(needs) }}" },
            run: `node <<'NODE'
const needs = JSON.parse(process.env.NEEDS_JSON);
if (needs.changes.result !== 'success') throw new Error('Change detection failed');
for (const name of ${JSON.stringify(targets)}) {
    const selected = needs.changes.outputs[name];
    if (!['true', 'false'].includes(selected)) throw new Error('Missing selection: ' + name);
    const expected = selected === 'true' ? 'success' : 'skipped';
    if (needs[name]?.result !== expected) throw new Error(name + ': expected ' + expected);
}
NODE`,
        }),
    ],
});

workflow({
    name: "CI",
    on: {
        push: { branches: ["main"] },
        pull_request: { branches: ["main"] },
        workflow_dispatch: {},
    },
    permissions: { contents: "read" },
    concurrency: {
        group: "${{ github.workflow }}-${{ github.event_name }}-${{ github.ref }}",
        cancelInProgress: "${{ github.event_name != 'push' }}",
    },
    defaults: { run: { shell: "bash" } },
    jobs: [
        changes,
        workflowCheck,
        quality,
        api,
        web,
        scripts,
        apiContainer,
        cronContainer,
        ci,
    ],
}).writeOrLint({
    filePath: new URL("./ci.generated.yml", import.meta.url),
    header: "# Generated by ci.mts. Run npm run ci:generate; do not edit directly.",
});
