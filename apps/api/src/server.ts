import { app, metrics } from "./app";
import { METRICS_HOST, METRICS_PORT, PORT } from "./config";

const server = app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`⚡️[server]: Server is running at http://localhost:${PORT}`);
});

const metricsServer = metrics.app.listen(METRICS_PORT, METRICS_HOST);

for (const listener of [server, metricsServer]) {
    listener.on("error", () => {
        process.stderr.write("API or metrics listener failed to start.\n");
        process.exit(1);
    });
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
        let remaining = 2;
        for (const listener of [server, metricsServer]) {
            listener.close(() => {
                remaining -= 1;
                if (remaining === 0) {
                    process.exit(0);
                }
            });
        }
        setTimeout(() => process.exit(1), 10_000).unref();
    });
}
