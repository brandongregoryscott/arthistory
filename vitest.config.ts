import { defineConfig } from "vitest/config";

const config = defineConfig({
    test: {
        projects: [
            { test: { name: "api", root: "./apps/api" } },
            {
                extends: "./apps/web/vite.config.ts",
                test: { name: "web", root: "./apps/web" },
            },
            { test: { name: "pocketbase", root: "./pocketbase" } },
        ],
    },
});

// eslint-disable-next-line collation/no-default-export -- Vitest loads the default configuration export.
export default config;
