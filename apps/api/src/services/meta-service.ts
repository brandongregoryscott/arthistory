import type { GitHistory, GitHistoryRow } from "@repo/common";
import { getDb } from "../database";
import { fromUnixTime } from "date-fns";

const MetaService = {
    latest: async (): Promise<GitHistory | undefined> => {
        const db = await getDb();
        const row = await db.get<GitHistoryRow>(
            `SELECT * FROM git_history ORDER BY timestamp DESC LIMIT 1;`
        );

        if (row === undefined) {
            return undefined;
        }

        return { ...row, timestamp: fromUnixTime(row.timestamp).toISOString() };
    },
};

export { MetaService };
