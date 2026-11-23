import type { SongSnapshot } from "@repo/common";

type DataRecord = {
    getBool(field: string): boolean;
    getInt(field: string): number;
    getString(field: string): string;
    id: string;
    original(): DataRecord;
    set(field: string, value: unknown): void;
};

type BackfillApp = {
    countRecords(collection: string, filter?: unknown): number;
    delete(record: DataRecord): void;
    findCollectionByNameOrId(collection: string): unknown;
    findFirstRecordByData(
        collection: string,
        field: string,
        value: string
    ): DataRecord;
    findRecordById(collection: string, id: string): DataRecord;
    findRecordsByFilter(
        collection: string,
        filter: string,
        sort: string,
        limit: number,
        offset: number,
        params?: Record<string, unknown>
    ): DataRecord[];
    runInTransaction(operation: (app: BackfillApp) => void): void;
    save(record: DataRecord): void;
};

type PageResult = {
    displayName: null | string;
    metrics?: {
        followers: null | number;
        monthlyListeners: null | number;
        popularity: null | number;
    };
    retryAfterMs: null | number;
    songs?: null | SongSnapshot[];
    status: number;
};

type BackfillDependencies = {
    now(): number;
    readPage(id: string, timeoutSeconds: number): PageResult;
    token(): string;
};

type Claim = {
    artistId: string;
    displayName: string;
    intervalMs: number;
    metadataUpdatedAt: string;
    spotifyId: string;
    timeoutSeconds: number;
    token: string;
};

export type {
    BackfillApp,
    BackfillDependencies,
    Claim,
    DataRecord,
    PageResult,
};

declare global {
    const Record: { new (collection: unknown): DataRecord };
    const $dbx: { hashExp(values: Record<string, unknown>): unknown };
}
