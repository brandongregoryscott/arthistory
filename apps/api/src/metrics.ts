import type { RequestHandler } from "express";
import {
    collectDefaultMetrics,
    Histogram,
    Registry,
} from "@prometheus-io/client";
import express from "express";

function createMetrics() {
    const registry = new Registry();
    collectDefaultMetrics({ register: registry });
    const duration = new Histogram({
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        help: "Completed HTTP request duration in seconds.",
        labelNames: ["method", "route", "status_code"] as const,
        name: "http_request_duration_seconds",
        registers: [registry],
    });
    const middleware: RequestHandler = (req, res, next) => {
        // Health probes are tracked separately through /health and scrape availability.
        if (req.path === "/health") {
            next();
            return;
        }
        const start = process.hrtime.bigint();
        res.once("finish", () => {
            // Only registered templates are safe: raw paths can contain credentials.
            const route = (req.route as { path?: unknown } | undefined)?.path;
            duration.observe(
                {
                    method: [
                        "GET",
                        "POST",
                        "PUT",
                        "PATCH",
                        "DELETE",
                        "HEAD",
                        "OPTIONS",
                    ].includes(req.method)
                        ? req.method
                        : "OTHER",
                    route: typeof route === "string" ? route : "__unmatched__",
                    status_code: String(res.statusCode),
                },
                Number(process.hrtime.bigint() - start) / 1e9
            );
        });
        next();
    };
    const app = express();
    app.disable("x-powered-by");
    app.get("/metrics", async (_req, res) => {
        res.set("Content-Type", registry.contentType);
        res.end(await registry.metrics());
    });
    return { app, middleware, registry };
}

export { createMetrics };
