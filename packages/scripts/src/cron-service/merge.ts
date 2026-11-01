import { withWorkerLock } from "../utils/worker-lock";
import { runMerge } from "./worker";

withWorkerLock(runMerge)
    .then((ran) => {
        if (!ran) {
            throw new Error("Another sync or merge is running");
        }
    })
    .catch((error: Error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
