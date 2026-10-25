import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const config = defineConfig({
    plugins: [
        tanstackRouter({
            autoCodeSplitting: true,
            generatedRouteTree: "./routeTree.gen.ts",
            routesDirectory: "./routes",
            target: "react",
        }),
        react(),
    ],
    resolve: {
        alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
    },
});

// eslint-disable-next-line collation/no-default-export -- Vite loads the default configuration export.
export default config;
