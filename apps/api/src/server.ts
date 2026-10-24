import { app, metrics } from "./app";
import { METRICS_HOST, METRICS_PORT, PORT } from "./config";
import { logger } from "./logging";

const server = app.listen(PORT, () => {
    logger.info({ event: "listening", port: PORT }, "API listening");
});

const metricsServer = metrics.app.listen(METRICS_PORT, METRICS_HOST);

for (const listener of [server, metricsServer]) {
    listener.on("error", (error: Error) => {
        logger.error(
            { err: error, event: "startup-failed" },
            "API or metrics listener failed"
        );
        process.exit(1);
    });
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
        logger.info({ event: "stopping", signal }, "API stopping");
        let remaining = 2;
        for (const listener of [server, metricsServer]) {
            listener.close(() => {
                remaining -= 1;
                if (remaining === 0) {
                    logger.info({ event: "stopped" }, "API stopped");
                    process.exit(0);
                }
            });
        }
        setTimeout(() => process.exit(1), 10_000).unref();
    });
}
