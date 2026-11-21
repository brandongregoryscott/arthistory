import type { RecordModel } from "pocketbase";
import { isEmpty } from "lodash";
import { rmSync } from "node:fs";
import type { PocketBaseClient } from "../storage/pocketbase";
import type { ImportItem } from "./prepared-records";
import { MISSING_METRIC } from "../../../../pocketbase/hooks/snapshot-metrics.cjs";
import { snapshotColumns } from "./prepared-records";
import { readJsonLines, stageImport } from "./staged-import";

type LoadImportOptions = {
    batchSize?: number;
    client: PocketBaseClient;
    directory: string;
};

type LoadBatchCounts = { created: number; skipped: number };

type LoadBatchOptions = {
    client: PocketBaseClient;
    counts: LoadBatchCounts;
    items: ImportItem[];
};

const MAX_BATCH_SIZE = 100;

const loadImport = async (options: LoadImportOptions) => {
    const { batchSize = 50, client, directory } = options;

    if (
        !Number.isSafeInteger(batchSize) ||
        batchSize < 1 ||
        batchSize > MAX_BATCH_SIZE
    ) {
        throw new Error(
            `Import batch size must be between 1 and ${MAX_BATCH_SIZE}.`
        );
    }

    const staged = await stageImport(directory);
    const counts = {
        artists: staged.artists,
        created: 0,
        skipped: 0,
        snapshots: staged.snapshots,
    };

    try {
        await client.ready();
        let pending: ImportItem[] = [];

        for await (const item of readJsonLines<ImportItem>(staged.filename)) {
            pending.push(item);

            if (pending.length === batchSize) {
                await loadBatch({ client, counts, items: pending });
                pending = [];
            }
        }

        if (!isEmpty(pending)) {
            await loadBatch({ client, counts, items: pending });
        }

        return counts;
    } finally {
        rmSync(staged.temporary, { force: true, recursive: true });
    }
};

const loadBatch = async (options: LoadBatchOptions) => {
    const { client, counts, items } = options;

    const missing = new Set<ImportItem>();

    // Query only this bounded batch. Looking up both identity and natural keys
    // detects collisions before create, including pre-existing random record IDs.
    for (const collection of ["artists", "snapshots"] as const) {
        const records = items.filter((item) => item.collection === collection);

        if (isEmpty(records)) {
            continue;
        }

        const result = await client.run((pb) => {
            const filter = records
                .map((item) => {
                    if (item.collection === "artists") {
                        return pb.filter(
                            "(id = {:id} || spotifyId = {:spotifyId})",
                            item.record
                        );
                    }

                    return pb.filter(
                        "(id = {:id} || (artist = {:artist} && weekStart = {:weekStart}))",
                        {
                            ...item.record,
                            weekStart: item.record.weekStart.replace("T", " "),
                        }
                    );
                })
                .join(" || ");

            return pb
                .collection(collection)
                .getList<RecordModel>(1, records.length * 2, { filter });
        });

        if (result.totalItems > records.length * 2) {
            throw new Error("Unexpected import identity matches.");
        }

        for (const item of records) {
            const matches = result.items.filter((existing) =>
                matchesIdentity(item, existing)
            );

            if (matches.length === 0) {
                // Preserve original stream order when constructing the batch.
                missing.add(item);
                continue;
            }

            if (matches.length !== 1 || !canSkip(item, matches[0])) {
                throw new Error(
                    `Conflicting ${collection} record ${item.record.id}; import stopped without overwriting it.`
                );
            }

            counts.skipped++;
        }
    }

    if (missing.size === 0) {
        return;
    }

    const requests = items.filter((item) => missing.has(item));
    const results = await client.run((pb) => {
        const batch = pb.createBatch();

        for (const item of requests) {
            batch
                .collection(item.collection)
                .create(
                    item.collection === "snapshots"
                        ? snapshotColumns(item.record)
                        : item.record
                );
        }

        return batch.send();
    });

    if (
        results.length !== requests.length ||
        results.some(
            (result, index) =>
                result.status < 200 ||
                result.status >= 300 ||
                result.body?.id !== requests[index]?.record.id
        )
    ) {
        throw new Error(
            "Unexpected PocketBase batch result; rerun the same export to reconcile."
        );
    }

    counts.created += requests.length;
};

const matchesIdentity = (item: ImportItem, existing: RecordModel) =>
    existing.id === item.record.id ||
    (item.collection === "artists"
        ? existing.spotifyId === item.record.spotifyId
        : existing.artist === item.record.artist &&
          Date.parse(existing.weekStart) === Date.parse(item.record.weekStart));

const canSkip = (item: ImportItem, existing: RecordModel | undefined) => {
    if (existing == null) {
        return false;
    }

    if (item.collection === "artists") {
        return (
            existing.id === item.record.id &&
            existing.spotifyId === item.record.spotifyId
        );
    }

    const incoming = item.record;

    if (
        existing.artist !== incoming.artist ||
        Date.parse(existing.weekStart) !== Date.parse(incoming.weekStart)
    ) {
        return false;
    }

    const capture = Date.parse(existing.capturedAt);
    const week = Date.parse(incoming.weekStart);

    if (
        !Number.isFinite(capture) ||
        capture < week ||
        capture >= week + 7 * 86400000
    ) {
        return false;
    }

    return (
        capture > Date.parse(incoming.capturedAt) ||
        (capture === Date.parse(incoming.capturedAt) &&
            existing.followers ===
                (incoming.metrics.followers ?? MISSING_METRIC) &&
            existing.monthlyListeners ===
                (incoming.metrics.monthlyListeners ?? MISSING_METRIC) &&
            existing.popularity ===
                (incoming.metrics.popularity ?? MISSING_METRIC) &&
            existing.source === incoming.source)
    );
};

export { loadImport };
export type { LoadImportOptions };
