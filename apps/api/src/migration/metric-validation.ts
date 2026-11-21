type MetricName = "followers" | "monthlyListeners" | "popularity";

const isNullableMetric = (
    key: MetricName,
    value: unknown
): value is null | number =>
    value === null ||
    (typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        (key !== "popularity" || value <= 100));

export { isNullableMetric };
