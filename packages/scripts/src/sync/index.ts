import { runSync } from "../cron-service/worker";
import { withWorkerLock } from "../utils/worker-lock";

withWorkerLock(runSync)
    .then((ran) => {
        if (!ran) {
            throw new Error("Another sync or merge is running");
        }
    })
    .catch((error: Error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
