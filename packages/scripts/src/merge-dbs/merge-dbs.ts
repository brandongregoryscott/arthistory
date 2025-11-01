import { copyFile } from "fs/promises";
import type { ArtistSnapshotRow } from "@repo/common";
import {
    BULK_INSERTION_CHUNK_SIZE,
    DatabaseName,
    TableName,
} from "../constants/storage";
import { getDbFilenames } from "../utils/fs-utils";
import {
    buildInsertArtistSnapshotStatement,
    createArtistSnapshotsIndexes,
    dropArtistSnapshotsConstraintIfExists,
    findCheckpointDbFilename,
    flushStatements,
    flushStatementsIfNeeded,
    openDb,
    paginateRows,
    setPerformancePragmas,
} from "../utils/db-utils";
import { toUnixTimestampInSeconds } from "../utils/date-utils";
import type { SQLStatement } from "../types";
import { createTimerLogger, logger } from "../utils/logger";

const PAGE_SIZE = 100000;

interface MergeDbsOptions {
    filename?: string;
    skipCheckpointAsBase: boolean;
    skipIndexes: boolean;
}

const mergeDbs = async (options: MergeDbsOptions): Promise<string> => {
    const {
        skipCheckpointAsBase,
        skipIndexes,
        filename = DatabaseName.Merged,
    } = options;
    let sourceDbFileNames = await getDbFilenames();

    // The original database from the git-based tracking is ~6GB, there's no point in wasting time copying rows
    // over to a new, empty database. Just copy it with a new filename and move on
    const checkpointFileName = await findCheckpointDbFilename();
    if (checkpointFileName !== undefined && !skipCheckpointAsBase) {
        logger.info(
            { checkpointFileName, filename },
            "Found checkpoint database, copying to use as base"
        );
        await copyFile(checkpointFileName, filename);

        // Filter out the checkpoint db so we don't try to merge it into the copied base
        sourceDbFileNames = sourceDbFileNames.filter(
            (sourceDbFileName) => sourceDbFileName !== checkpointFileName
        );
    }

    const targetDb = await openDb(filename);
    await dropArtistSnapshotsConstraintIfExists(targetDb);
    await setPerformancePragmas(targetDb);

    const sourceDatabaseCount = sourceDbFileNames.length;
    const stopMergeTimer = createTimerLogger(
        { sourceDatabaseCount },
        "Merging partial databases"
    );

    let statements: SQLStatement[] = [];
    for (const sourceDbFileName of sourceDbFileNames) {
        const index = sourceDbFileNames.indexOf(sourceDbFileName);
        logger.info({ sourceDbFileName, index }, "Reading rows");
        const sourceDb = await openDb(sourceDbFileName);
        await paginateRows<ArtistSnapshotRow>(
            sourceDb,
            TableName.ArtistSnapshots,
            PAGE_SIZE,
            async (rows) => {
                statements = [
                    ...statements,
                    ...buildInsertArtistSnapshotStatements(rows),
                ];
                const flushed = await flushStatementsIfNeeded(
                    targetDb,
                    statements,
                    BULK_INSERTION_CHUNK_SIZE
                );
                if (flushed) {
                    statements = [];
                }
            }
        );

        await sourceDb.close();
    }

    await flushStatements(targetDb, statements);
    statements = [];

    if (!skipIndexes) {
        const stopIndexTimer = createTimerLogger("Creating indexes");
        await createArtistSnapshotsIndexes(targetDb);
        stopIndexTimer();
    }

    stopMergeTimer();

    return filename;
};

const buildInsertArtistSnapshotStatements = (
    rows: ArtistSnapshotRow[]
): SQLStatement[] =>
    rows.map((row) => {
        const { id, followers, popularity } = row;
        const timestampInSeconds = toUnixTimestampInSeconds(row.timestamp);

        return buildInsertArtistSnapshotStatement({
            id,
            followers,
            popularity,
            timestamp: timestampInSeconds,
        });
    });

export type { MergeDbsOptions };
export { mergeDbs };
