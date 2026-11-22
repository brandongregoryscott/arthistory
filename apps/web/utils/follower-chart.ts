import type { alignMonthlyFollowers } from "@repo/common";

type MonthlyFollowers = ReturnType<typeof alignMonthlyFollowers>;

const hideEmptyFollowerMonths = ({
    timestamps,
    values,
}: MonthlyFollowers): MonthlyFollowers => {
    const series = Object.values(values);
    const months = timestamps.flatMap((timestamp, index) =>
        series.some((followers) => followers[index] != null)
            ? [{ index, timestamp }]
            : []
    );

    return {
        timestamps: months.map(({ timestamp }) => timestamp),
        values: Object.fromEntries(
            Object.entries(values).map(([id, followers]) => [
                id,
                months.map(({ index }) => followers[index] ?? null),
            ])
        ),
    };
};

export { hideEmptyFollowerMonths };
