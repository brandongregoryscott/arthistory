import type { RecordModel } from "pocketbase";
import { isEmpty } from "lodash";
import { rmSync } from "node:fs";
import type { PocketBaseClient } from "../storage/pocketbase";
import type { ImportContext } from "./import-error";
import type { ImportProgress } from "./import-progress";
import type { ImportItem } from "./prepared-records";
import type { ImportSource } from "./staged-import";
import { MISSING_METRIC } from "../../../../pocketbase/hooks/snapshot-metrics.cjs";
import { ImportCheckpoint } from "./import-checkpoint";
import { importError } from "./import-error";
import { lookupImportRecords } from "./import-lookup";
import { createImportProgressReporter } from "./import-progress";
import { snapshotColumns } from "./prepared-records";
import { readPreparedImport, stageImport } from "./staged-import";

type LoadImportOptions = {
    batchSize?: number;
    checkpointPath?: string;
    client: PocketBaseClient;
    directory: string;
    onProgress?: (progress: ImportProgress) => void;
    resumeAfter?: number;
    skipPreflight?: boolean;
};

type LoadBatchCounts = { created: number; skipped: number };

type LoadBatchOptions = {
    client: PocketBaseClient;
    context: ImportContext;
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

    const reportProgress = createImportProgressReporter(options.onProgress);
    if (
        options.resumeAfter != null &&
        (!Number.isSafeInteger(options.resumeAfter) || options.resumeAfter < 0)
    ) {
        throw new Error(
            "--resume-after must be a nonnegative safe integer from a confirmed progress log."
        );
    }
    const checkpoint =
        options.checkpointPath == null
            ? undefined
            : new ImportCheckpoint(
                  directory,
                  options.checkpointPath,
                  client.origin
              );
    const checkpointPrefix =
        checkpoint?.cursor == null
            ? 0
            : checkpoint.cursor.artists + checkpoint.cursor.snapshots;
    const resumed = Math.max(options.resumeAfter ?? 0, checkpointPrefix);
    const input: ImportSource =
        options.skipPreflight === true ||
        checkpoint != null ||
        options.resumeAfter != null
            ? readPreparedImport(directory, checkpoint?.cursor)
            : await stageImport(directory, reportProgress);
    const counts = {
        artists: input.artists,
        created: 0,
        skipped: 0,
        snapshots: input.snapshots,
    };
    const context: ImportContext = {
        batch: 0,
        records: [],
        ...(resumed > 0 ? { resumed } : {}),
        stage: "Check PocketBase authentication and required collections",
    };
    const total = counts.artists + counts.snapshots;
    if (resumed > total) {
        throw new Error(
            "Resume position exceeds the prepared export record count."
        );
    }
    const progress = (phase: "complete" | "connecting" | "importing") =>
        reportProgress({
            batch: context.batch,
            created: counts.created,
            phase,
            processed: resumed + counts.created + counts.skipped,
            ...(resumed > 0 ? { resumed } : {}),
            skipped: counts.skipped,
            total,
        });

    try {
        progress("connecting");
        await client.ready();
        const anchor = checkpoint?.cursor?.anchor;
        if (anchor != null) {
            context.stage = "Verify checkpoint against PocketBase";
            context.records = [{ collection: "snapshots", id: anchor.id }];
            const result = await client.run((pb) =>
                pb.collection("snapshots").getList<RecordModel>(1, 2, {
                    filter: pb.filter(
                        "(id = {:id} || (artist = {:artist} && weekStart = {:weekStart}))",
                        {
                            ...anchor,
                            weekStart: anchor.weekStart.replace("T", " "),
                        }
                    ),
                })
            );
            const item: ImportItem = {
                collection: "snapshots",
                record: anchor,
            };
            if (result.items.length !== 1 || !canSkip(item, result.items[0])) {
                throw new Error(
                    "Checkpoint anchor no longer matches PocketBase; reconcile from the beginning without the checkpoint after restore/deletion."
                );
            }
        }
        let toSkip = resumed - checkpointPrefix;
        if (toSkip === 0) {
            progress("importing");
        } else {
            reportProgress({
                phase: "seeking",
                processed: checkpointPrefix,
                total: resumed,
            });
        }
        let pending: ImportItem[] = [];
        context.stage = "Read prepared export records";
        context.records = [];
        const saveCheckpoint = (force = false) => {
            if (checkpoint != null && input.cursor != null) {
                context.stage = "Save import checkpoint";
                checkpoint.save(input.cursor(), force);
            }
        };

        for await (const item of input.records) {
            if (toSkip > 0) {
                toSkip--;
                reportProgress({
                    phase: "seeking",
                    processed: resumed - toSkip,
                    total: resumed,
                });
                if (toSkip === 0) {
                    progress("importing");
                }
                continue;
            }
            pending.push(item);

            if (pending.length === batchSize) {
                await loadBatch({ client, context, counts, items: pending });
                saveCheckpoint();
                progress("importing");
                pending = [];
                context.stage = "Read prepared export records";
                context.records = [];
            }
        }

        if (!isEmpty(pending)) {
            await loadBatch({ client, context, counts, items: pending });
        }

        saveCheckpoint(true);
        progress("complete");
        return resumed > 0 ? { ...counts, resumed } : counts;
    } catch (error) {
        throw importError(error, context, counts);
    } finally {
        await input.records.return(undefined);
        if (input.temporary != null) {
            rmSync(input.temporary, { force: true, recursive: true });
        }
    }
};

const loadBatch = async (options: LoadBatchOptions) => {
    const { client, context, counts, items } = options;
    context.batch++;

    const missing = new Set<ImportItem>();

    // Query only this bounded batch. Looking up both identity and natural keys
    // detects collisions before create, including pre-existing random record IDs.
    for (const collection of ["artists", "snapshots"] as const) {
        const records = items.filter((item) => item.collection === collection);

        if (isEmpty(records)) {
            continue;
        }
        context.stage = `Look up existing ${collection} records`;
        const found = await lookupImportRecords({
            client,
            onQuery: (items) => {
                context.records = items.map((item) => ({
                    collection: item.collection,
                    id: item.record.id,
                }));
            },
            records,
        });

        for (const item of records) {
            const matches = found.filter((existing) =>
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
    context.stage = "Create PocketBase record batch";
    context.records = requests.map((item) => ({
        collection: item.collection,
        id: item.record.id,
    }));
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
