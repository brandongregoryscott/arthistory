// @ts-check
// PocketBase executes plain JS; the existing typecheck command checks this helper.
/** @typedef {{ getString(field: string): string }} ValidationRecord */
/** @param {ValidationRecord} record */
const validateSnapshot = (record) => {
    /** @type {unknown} */
    const metrics = JSON.parse(record.getString("metrics"));
    const keys = ["followers", "popularity", "monthlyListeners"];
    if (
        metrics == null ||
        typeof metrics !== "object" ||
        Array.isArray(metrics) ||
        Object.keys(metrics).length !== keys.length
    ) {
        throw new Error(
            "metrics must contain exactly followers, popularity, monthlyListeners"
        );
    }
    for (const key of keys) {
        const value = /** @type {Record<string, unknown>} */ (metrics)[key];
        if (
            value !== null &&
            (typeof value !== "number" ||
                !Number.isSafeInteger(value) ||
                value < 0 ||
                (key === "popularity" && value > 100))
        ) {
            throw new Error("Invalid nullable metric: " + key);
        }
    }
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

/** @param {ValidationRecord} record */
const validateArtist = (record) => {
    for (const field of ["aliases", "searchNames"]) {
        /** @type {unknown} */
        const values = JSON.parse(record.getString(field) || "null");
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

module.exports = { validateSnapshot, validateArtist };
