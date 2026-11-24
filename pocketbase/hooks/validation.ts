import { MISSING_METRIC } from "./constants.js";

type ValidationRecord = {
    getFloat(field: string): number;
    getString(field: string): string;
};

const validateSnapshot = (record: ValidationRecord) => {
    for (const key of ["followers", "popularity", "monthlyListeners"]) {
        const value = record.getFloat(key);
        if (
            !Number.isSafeInteger(value) ||
            value < MISSING_METRIC ||
            (key === "popularity" && value > 100)
        ) {
            throw new Error("Invalid snapshot metric: " + key);
        }
    }
    validateCaptureDates(record);
};

const validateSongSnapshot = (record: ValidationRecord) => {
    const value = record.getFloat("listenCount");
    if (!Number.isSafeInteger(value) || value < MISSING_METRIC) {
        throw new Error("Invalid song listen count.");
    }
    validateCaptureDates(record);
};

const validateCaptureDates = (record: ValidationRecord) => {
    const week = new Date(record.getString("weekStart"));
    const capture = new Date(record.getString("capturedAt"));
    if (
        !Number.isFinite(week.getTime()) ||
        !Number.isFinite(capture.getTime()) ||
        week.getUTCDay() !== 1 ||
        week.getUTCHours() !== 0 ||
        week.getUTCMinutes() !== 0 ||
        week.getUTCSeconds() !== 0 ||
        week.getUTCMilliseconds() !== 0 ||
        capture < week ||
        capture.getTime() >= week.getTime() + 7 * 86400000
    ) {
        throw new Error("weekStart must be the capture's Monday at 00:00 UTC");
    }
};

const validateArtist = (record: ValidationRecord) => {
    for (const field of ["aliases", "searchNames"]) {
        const encoded = record.getString(field);
        const values: unknown = JSON.parse(encoded === "" ? "null" : encoded);
        if (
            values !== null &&
            (!Array.isArray(values) ||
                values.length > 100 ||
                values.some(
                    (name) =>
                        typeof name !== "string" ||
                        name.length === 0 ||
                        name.length > 500
                ))
        ) {
            throw new Error(field + " must be an array of up to 100 names");
        }
    }
};

export { validateArtist, validateSnapshot, validateSongSnapshot };
