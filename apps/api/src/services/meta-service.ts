import type { ArtistSnapshot, ArtistSnapshotRow } from "@repo/common";
import { getDb } from "../database";
import { fromUnixTime } from "date-fns";

const MetaService = {
    latest: async (): Promise<
        Pick<ArtistSnapshot, "timestamp"> | undefined
    > => {
        const db = await getDb();
        const row = await db.get<ArtistSnapshotRow>(
            `SELECT * FROM artist_snapshots ORDER BY timestamp DESC LIMIT 1;`
        );

        if (row === undefined) {
            return undefined;
        }

        return { timestamp: fromUnixTime(row.timestamp).toISOString() };
    },
};

export { MetaService };
