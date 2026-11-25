import type { alignMonthlyFollowers } from "@repo/common";

type MonthlyFollowers = ReturnType<typeof alignMonthlyFollowers>;

const hideEmptyFollowerMonths = (data: MonthlyFollowers): MonthlyFollowers => {
    const { timestamps, values } = data;

    const series = Object.values(values);
    const months = timestamps.flatMap((timestamp, index) =>
        series.some((followers) => followers[index] != null)
            ? [{ index, timestamp }]
            : []
    );

    return {
        timestamps: months.map((month) => month.timestamp),
        values: Object.fromEntries(
            Object.entries(values).map((entry) => {
                const [id, followers] = entry;

                return [
                    id,
                    months.map((month) => followers[month.index] ?? null),
                ];
            })
        ),
    };
};

export { hideEmptyFollowerMonths };
