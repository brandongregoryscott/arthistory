import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const config = defineConfig({
    plugins: [
        tanstackRouter({
            autoCodeSplitting: true,
            generatedRouteTree: "./routeTree.gen.ts",
            routesDirectory: "./routes",
            target: "react",
        }),
        react(),
        // LeafyGreen Emotion initializes SSR helpers that reference Node streams.
        nodePolyfills({
            include: ["buffer", "events", "process", "stream", "util"],
        }),
    ],
    resolve: {
        alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
    },
});

// eslint-disable-next-line collation/no-default-export -- Vite loads the default configuration export.
export default config;
