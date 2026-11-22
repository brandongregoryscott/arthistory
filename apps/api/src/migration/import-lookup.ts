import type { RecordModel } from "pocketbase";
import { chunk, groupBy } from "lodash";
import type { PocketBaseClient } from "../storage/pocketbase";
import type { ImportItem } from "./prepared-records";

type ImportLookupOptions = {
    client: PocketBaseClient;
    onQuery: (records: ImportItem[]) => void;
    records: ImportItem[];
};

// Separate ID and natural-key queries keep PocketBase on its unique indexes.
// Mixing them with OR and default rowid sorting can force catalogue scans.
// Bounded chunks also stay below PB v0.40.6's filter-length/expression limits.
const MAX_LOOKUP_RECORDS = 20;

const lookupImportRecords = async (options: ImportLookupOptions) => {
    const { client, onQuery, records } = options;
    const [first] = records;
    if (first == null) {
        return [];
    }
    const { collection } = first;
    if (records.some((item) => item.collection !== collection)) {
        throw new Error("Import lookup must query one collection at a time.");
    }
    return client.run(async (pb) => {
        const found = new Map<string, RecordModel>();
        const query = async (
            items: ImportItem[],
            filter: string,
            sort: string
        ) => {
            onQuery(items);
            const limit = items.length * 2;
            const result = await pb
                .collection(collection)
                .getList<RecordModel>(1, limit + 1, {
                    fields:
                        collection === "artists"
                            ? "id,spotifyId"
                            : "id,artist,weekStart,capturedAt,followers,popularity,monthlyListeners,source",
                    filter,
                    skipTotal: true,
                    sort,
                });
            if (result.items.length > limit || result.totalItems > limit) {
                throw new Error("Unexpected import identity matches.");
            }
            for (const record of result.items) {
                found.set(record.id, record);
            }
        };
        for (const items of chunk(records, MAX_LOOKUP_RECORDS)) {
            await query(
                items,
                items
                    .map((item) => pb.filter("id = {:id}", item.record))
                    .join(" || "),
                "id"
            );
        }
        const artists = records.filter((item) => item.collection === "artists");
        for (const items of chunk(artists, MAX_LOOKUP_RECORDS)) {
            await query(
                items,
                items
                    .map((item) =>
                        pb.filter("spotifyId = {:spotifyId}", item.record)
                    )
                    .join(" || "),
                "spotifyId"
            );
        }
        const snapshots = records.filter(
            (item) => item.collection === "snapshots"
        );
        for (const group of Object.values(
            groupBy(snapshots, (item) => item.record.artist)
        )) {
            for (const items of chunk(group, MAX_LOOKUP_RECORDS)) {
                const [item] = items;
                if (item == null) {
                    continue;
                }
                const artist = pb.filter("artist = {:artist}", item.record);
                const weeks = items
                    .map((snapshot) =>
                        pb.filter("weekStart = {:weekStart}", {
                            weekStart: snapshot.record.weekStart.replace(
                                "T",
                                " "
                            ),
                        })
                    )
                    .join(" || ");
                await query(
                    items,
                    artist + " && (" + weeks + ")",
                    "artist,weekStart"
                );
            }
        }
        return [...found.values()];
    });
};

export { lookupImportRecords };
