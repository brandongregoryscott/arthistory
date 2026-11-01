import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { BucketName, DatabaseName } from "../constants/storage";
import { downloadDbs } from "../download-dbs/download-dbs";
import { mergeDbs } from "../merge-dbs/merge-dbs";
import { initializeRegistry } from "../sync/bootstrap";
import { publishPending } from "../sync/outbox";
import { openRegistry } from "../sync/registry";
import { collectArtists } from "../sync/sync";
import { uploadObject } from "../upload-object/upload-object";
import { openDb } from "../utils/db-utils";
import { getDbFilenames } from "../utils/fs-utils";
import { logger } from "../utils/logger";
import { listObjects, s3 } from "../utils/storage-utils";

const MANIFEST = "sync-checkpoint.json";

const storage = {
    deleteKeys: async (keys: string[]) => {
        const result = await s3.deleteObjects({
            Bucket: BucketName.Snapshots,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
        });
        if ((result.Errors?.length ?? 0) > 0) {
            throw new Error(
                "Some merged partials could not be deleted; cleanup will retry"
            );
        }
    },
    download: downloadDbs,
    list: listObjects,
    upload: uploadObject,
};

type CheckpointManifest = {
    checkpoint: string;
    cleanup: string[];
    remoteCleanup: string[];
};

const readManifest = async (): Promise<CheckpointManifest | undefined> => {
    if (!existsSync(MANIFEST)) {
        return undefined;
    }
    const manifest: CheckpointManifest = JSON.parse(
        await readFile(MANIFEST, "utf8")
    );
    if (
        typeof manifest.checkpoint !== "string" ||
        !Array.isArray(manifest.cleanup) ||
        !Array.isArray(manifest.remoteCleanup) ||
        ![
            manifest.checkpoint,
            ...manifest.cleanup,
            ...manifest.remoteCleanup,
        ].every(
            (file) =>
                typeof file === "string" &&
                /^spotify-data_[a-zA-Z0-9_-]+\.db$/.test(file)
        )
    ) {
        throw new Error("Invalid checkpoint manifest");
    }
    if (!existsSync(manifest.checkpoint)) {
        throw new Error(
            "Checkpoint database is missing; restore it before continuing"
        );
    }
    return manifest;
};

const writeManifest = async (manifest: CheckpointManifest) => {
    await writeFile(`${MANIFEST}.tmp`, JSON.stringify(manifest, null, 2));
    await rename(`${MANIFEST}.tmp`, MANIFEST);
};

const backupRegistry = async (upload = uploadObject) => {
    const temporary = "artist-registry-backup.db";
    await rm(temporary, { force: true });
    const db = await openDb(DatabaseName.ArtistIds);
    try {
        await db.run("VACUUM INTO ?", temporary);
    } finally {
        await db.close();
    }
    try {
        await upload({
            bucket: BucketName.ArtistIds,
            filename: temporary,
            key: DatabaseName.ArtistIds,
        });
    } finally {
        await rm(temporary, { force: true });
    }
};

const finishCleanup = async (
    manifest: CheckpointManifest,
    deleteKeys = storage.deleteKeys
) => {
    // The manifest is committed only after the merged backup upload completes.
    // Retry only this captured input set; never rediscover files for deletion.
    for (
        let offset = 0;
        offset < manifest.remoteCleanup.length;
        offset += 1000
    ) {
        const keys = manifest.remoteCleanup.slice(offset, offset + 1000);
        await deleteKeys(keys);
    }
    for (const file of manifest.cleanup) {
        await rm(file, { force: true });
    }
    await writeManifest({
        checkpoint: manifest.checkpoint,
        cleanup: [],
        remoteCleanup: [],
    });
};

const recoverCleanup = async (deleteKeys = storage.deleteKeys) => {
    const manifest = await readManifest();
    if (manifest !== undefined && manifest.cleanup.length > 0) {
        await finishCleanup(manifest, deleteKeys);
    }
};

const runSync = async () => {
    await recoverCleanup();
    await initializeRegistry();
    const registry = await openRegistry();
    try {
        await publishPending(registry);
        await collectArtists(registry);
        await publishPending(registry);
    } finally {
        await registry.close();
        // This includes the durable outbox and scheduler state, even after an upload failure.
        await backupRegistry();
    }
};

const mergeAndBackup = async (dependencies = storage) => {
    await recoverCleanup(dependencies.deleteKeys);
    await initializeRegistry();
    const registry = await openRegistry();
    try {
        await publishPending(registry, dependencies.upload);
    } finally {
        await registry.close();
    }
    await backupRegistry(dependencies.upload);
    await dependencies.download();
    const manifest = await readManifest();
    const sources = await getDbFilenames();
    const remote = await dependencies.list({
        bucket: BucketName.Snapshots,
        prefix: DatabaseName.PartialSnapshotPrefix,
    });
    const hasNewSources = sources.some(
        (source) => source !== manifest?.checkpoint
    );
    if (!hasNewSources) {
        logger.info("No partial databases to merge");
        return;
    }
    // A fixed staging filename bounds disk usage after interrupted builds/uploads.
    // It is outside the partial-file glob; remote backup names remain unique.
    const checkpoint = `${DatabaseName.PartialSnapshotPrefix}checkpoint-${randomUUID()}.db`;
    const filename = "merged-sync-checkpoint.db";
    await mergeDbs({
        checkpoint: manifest?.checkpoint,
        filename,
        skipCheckpointAsBase: false,
        skipIndexes: true,
        sources,
    });
    await dependencies.upload({
        bucket: BucketName.SnapshotBackups,
        filename,
        key: `merged-${checkpoint}`,
    });
    await rename(filename, checkpoint);
    const remoteKeys = new Set(remote.map((object) => object.Key));
    const cleanup = sources;
    const remoteCleanup = sources.filter((source) => remoteKeys.has(source));
    await writeManifest({ checkpoint, cleanup, remoteCleanup });
    await finishCleanup(
        { checkpoint, cleanup, remoteCleanup },
        dependencies.deleteKeys
    );
    logger.info(
        { checkpoint, sources: sources.length },
        "Merge and backup finished"
    );
};

const runMerge = async () => mergeAndBackup();

export { mergeAndBackup, runMerge, runSync };
