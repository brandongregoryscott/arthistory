type DataRecord = {
    getBool(field: string): boolean;
    getInt(field: string): number;
    getString(field: string): string;
    id: string;
    set(field: string, value: unknown): void;
};

type BackfillApp = {
    countRecords(collection: string, filter?: unknown): number;
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
    retryAfterMs: null | number;
    status: number;
};

type BackfillDependencies = {
    now(): number;
    readPage(id: string, timeoutSeconds: number): PageResult;
    token(): string;
};

type Claim = {
    artistId: string;
    intervalMs: number;
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
    const $dbx: { hashExp(values: Record<string, unknown>): unknown };
}
