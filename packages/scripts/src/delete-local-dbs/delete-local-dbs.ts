import { rm } from "node:fs/promises";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import { getDbFilenames } from "../utils/fs-utils";
import { createTimerLogger, logger } from "../utils/logger";

type DeleteLocalDbsOptions = {
    dry: boolean;
    skipConfirmation: boolean;
};

const readlineInterface = readline.createInterface({ input, output });

const deleteLocalDbs = async (options: DeleteLocalDbsOptions) => {
    const { dry, skipConfirmation } = options;
    const localDbFilenames = await getDbFilenames();
    const localDbCount = localDbFilenames.length;
    logger.info({ localDbCount, ...options }, "Found local databases");

    if (dry) {
        logger.info(
            {
                localDbCount,
                localDbFilenames,
                ...options,
            },
            "Returning early and not deleting files"
        );
        return;
    }

    if (!skipConfirmation) {
        const answer = await readlineInterface.question(
            `Delete ${localDbCount} files from ${process.cwd()}? [y/N] `
        );

        if (answer.toLowerCase().trim() !== "y") {
            process.exit(0);
        }
    }

    readlineInterface.close();

    const stopDeleteTimer = createTimerLogger(
        { localDbCount, ...options },
        "Deleting local databases"
    );

    await Promise.all(localDbFilenames.map((filename) => rm(filename)));

    stopDeleteTimer();
};

export type { DeleteLocalDbsOptions };
export { deleteLocalDbs };
