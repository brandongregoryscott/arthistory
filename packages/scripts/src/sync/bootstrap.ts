import { existsSync } from "node:fs";
import { BucketName, DatabaseName } from "../constants/storage";
import { downloadObject } from "../utils/storage-utils";
import { withWorkerLock } from "../utils/worker-lock";
import { openRegistry } from "./registry";

const initializeRegistry = async () => {
    const ran = await withWorkerLock(async () => {
        if (!existsSync(DatabaseName.ArtistIds)) {
            try {
                await downloadObject({
                    bucket: BucketName.ArtistIds,
                    key: DatabaseName.ArtistIds,
                });
            } catch (error) {
                // Only an absent object means a new installation. Auth/network errors
                // must not silently replace the authoritative registry with an empty one.
                if ((error as { name?: string }).name !== "NoSuchKey") {
                    throw error;
                }
            }
        }
        const db = await openRegistry();
        await db.close();
    }, "sync-registry-init-lock.db");
    if (!ran) {
        throw new Error(
            "Registry initialization is already running; retry shortly"
        );
    }
};

export { initializeRegistry };
