import type { ArtistSnapshot, ArtistSnapshotRow } from "@repo/common";
import { getDb } from "../database";
import { artistSnapshotStore } from "../snapshots";
import { normalizeTimestamp } from "../utilities/date-utils";

const MetaService = {
    latest: async (): Promise<
        Pick<ArtistSnapshot, "timestamp"> | undefined
    > => {
        if (artistSnapshotStore != null) {
            return artistSnapshotStore.latest();
        }

        const db = await getDb();
        const row = await db.get<ArtistSnapshotRow>(
            `SELECT * FROM artist_snapshots ORDER BY timestamp DESC LIMIT 1;`
        );

        if (row === undefined) {
            return undefined;
        }

        return { timestamp: normalizeTimestamp(row.timestamp) };
    },
};

export { MetaService };
