import { isArray, isPlainObject, isString } from "lodash";
import { createHash } from "node:crypto";
import {
    isPocketBaseRecordId,
    isSpotifyArtistId,
} from "../utilities/id-validation";
import { isNullableMetric } from "./metric-validation";

type PreparedArtist = {
    aliases: [];
    displayName: "";
    id: string;
    metadataSource: "legacy-id";
    searchNames: [];
    spotifyId: string;
    syncEnabled: false;
};

type PreparedSnapshot = {
    artist: string;
    capturedAt: string;
    id: string;
    metrics: {
        followers: null | number;
        monthlyListeners: null | number;
        popularity: null | number;
    };
    source: string;
    weekStart: string;
};

type ImportItem =
    | { collection: "artists"; record: PreparedArtist }
    | { collection: "snapshots"; record: PreparedSnapshot };

const importId = (key: string) =>
    BigInt("0x" + createHash("sha256").update(key).digest("hex"))
        .toString(36)
        .slice(-15)
        .padStart(15, "0");

const validateArtist = (input: unknown): PreparedArtist => {
    const record = objectWithKeys(input, [
        "aliases",
        "displayName",
        "id",
        "metadataSource",
        "searchNames",
        "spotifyId",
        "syncEnabled",
    ]);

    if (
        !isSpotifyArtistId(record.spotifyId) ||
        record.id !== importId(`artist:${record.spotifyId}`) ||
        record.displayName !== "" ||
        record.metadataSource !== "legacy-id" ||
        record.syncEnabled !== false ||
        !isArray(record.aliases) ||
        record.aliases.length !== 0 ||
        !isArray(record.searchNames) ||
        record.searchNames.length !== 0
    ) {
        throw new Error(
            "Invalid prepared artist; expected a disabled legacy-ID record."
        );
    }

    return record as PreparedArtist;
};

const validateSnapshot = (input: unknown): PreparedSnapshot => {
    const record = objectWithKeys(input, [
        "artist",
        "capturedAt",
        "id",
        "metrics",
        "source",
        "weekStart",
    ]);
    const metrics = objectWithKeys(record.metrics, [
        "followers",
        "monthlyListeners",
        "popularity",
    ]);

    for (const key of [
        "followers",
        "monthlyListeners",
        "popularity",
    ] as const) {
        const value = metrics[key];

        if (!isNullableMetric(key, value)) {
            throw new Error("Invalid nullable metric in prepared snapshot.");
        }
    }

    if (
        !isPocketBaseRecordId(record.id) ||
        !isPocketBaseRecordId(record.artist) ||
        !isString(record.source) ||
        record.source.length > 1000 ||
        !/^legacy:[1-9][0-9]*$/.test(record.source) ||
        !isCanonicalDate(record.weekStart) ||
        !isCanonicalDate(record.capturedAt)
    ) {
        throw new Error("Invalid prepared snapshot.");
    }

    const week = new Date(record.weekStart);
    const capture = Date.parse(record.capturedAt);

    if (
        week.getUTCDay() !== 1 ||
        week.getUTCHours() !== 0 ||
        week.getUTCMinutes() !== 0 ||
        week.getUTCSeconds() !== 0 ||
        week.getUTCMilliseconds() !== 0 ||
        capture < week.getTime() ||
        capture >= week.getTime() + 7 * 86400000
    ) {
        throw new Error("Snapshot capture must belong to its Monday UTC week.");
    }

    return record as PreparedSnapshot;
};

const objectWithKeys = (
    input: unknown,
    keys: string[]
): Record<string, unknown> => {
    if (!isPlainObject(input)) {
        throw new Error("Expected a prepared JSON object.");
    }

    const record = input as Record<string, unknown>;

    if (
        Object.keys(record).length !== keys.length ||
        keys.some((key) => !Object.hasOwn(record, key))
    ) {
        throw new Error("Unexpected prepared record fields.");
    }

    return record;
};

const isCanonicalDate = (input: unknown): input is string =>
    isString(input) &&
    Number.isFinite(Date.parse(input)) &&
    new Date(input).toISOString() === input;

export { importId, validateArtist, validateSnapshot };
export type { ImportItem, PreparedArtist, PreparedSnapshot };
