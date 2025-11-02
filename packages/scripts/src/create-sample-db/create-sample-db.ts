import { existsSync } from "node:fs";
import { ArtistId, DatabaseName, TableName } from "../constants";
import {
    buildInsertArtistSnapshotStatement,
    createArtistSnapshotsIndexes,
    createArtistSnapshotsTable,
    flushStatements,
    openDb,
} from "../utils/db-utils";
import { createTimerLogger, logger } from "../utils/logger";
import { isEmpty } from "lodash";
import type { ArtistSnapshotRow } from "@repo/common";

interface CreateSampleDbOptions {
    ids?: string[];
    inputFilename: string;
    outputFilename?: string;
    skipIndexes: boolean;
}

const DEFAULT_IDS = [ArtistId.AlexG, ArtistId.Duster];

const createSampleDb = async (options: CreateSampleDbOptions) => {
    const {
        inputFilename,
        outputFilename = DatabaseName.Sample,
        skipIndexes,
    } = options ?? {};

    const ids = isEmpty(options?.ids)
        ? DEFAULT_IDS
        : options.ids?.slice(0, 50) ?? DEFAULT_IDS;

    if (!existsSync(inputFilename)) {
        logger.error({ inputFilename }, "Input file not found on filesystem");
        process.exit(1);
    }

    const stopTimer = createTimerLogger(
        { ids, inputFilename, outputFilename },
        "Retrieving snapshots for artists and inserting to sample database"
    );

    const inputDb = await openDb(inputFilename);
    const outputDb = await openDb(outputFilename);
    await createArtistSnapshotsTable(outputDb);

    const idsCsv = ids.map((id) => `'${id}'`).join(",");
    const rows = await inputDb.all<ArtistSnapshotRow[]>(
        `SELECT * FROM ${TableName.ArtistSnapshots} WHERE id IN (${idsCsv}) ORDER BY timestamp ASC;`
    );

    const statements = rows.map(buildInsertArtistSnapshotStatement);

    await flushStatements(outputDb, statements);

    if (!skipIndexes) {
        await createArtistSnapshotsIndexes(outputDb);
    }

    const rowCount = rows.length;
    stopTimer({ rowCount });
};

export type { CreateSampleDbOptions };
export { createSampleDb };
