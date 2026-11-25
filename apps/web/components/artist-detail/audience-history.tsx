import type { ArtistSnapshot } from "@repo/common";
import { Box, Spinner, Text } from "@chakra-ui/react";
import { Line } from "react-chartjs-2";
import { COLORS, getHistoryChartOptions } from "./history-chart";
import { date } from "./history-format";

type AudienceHistoryProps = {
    darkMode: boolean;
    error: Error | null;
    history: ArtistSnapshot[];
    isLoading: boolean;
    start: number;
    weeks: string[];
};

const AudienceHistory = (props: AudienceHistoryProps) => {
    const { darkMode, error, history, isLoading, start, weeks } = props;
    const audienceValues = new Map(history.map((row) => [row.timestamp, row]));

    if (isLoading) {
        return <Spinner aria-label="Loading audience history" />;
    }

    if (error != null) {
        return (
            <Text role="alert">
                Unable to load audience history. {error.message}
            </Text>
        );
    }

    if (
        !history.some(
            (row) =>
                Date.parse(row.timestamp) >= start &&
                (row.followers != null || row.monthlyListeners != null)
        )
    ) {
        return <Text>No audience measurements available in this range.</Text>;
    }

    return (
        <Box h="280px" minW="0">
            <Line
                aria-label="Artist followers and monthly listeners by week (UTC)"
                data={{
                    datasets: (["followers", "monthlyListeners"] as const).map(
                        (metric, index) => ({
                            backgroundColor: COLORS[index],
                            borderColor: COLORS[index],
                            data: weeks.map(
                                (week) =>
                                    audienceValues.get(week)?.[metric] ?? null
                            ),
                            label:
                                metric === "followers"
                                    ? "Followers"
                                    : "Monthly listeners",
                            pointRadius: 3,
                            spanGaps: false,
                        })
                    ),
                    labels: weeks.map(date),
                }}
                options={getHistoryChartOptions(darkMode, "People")}
                role="img"
            />
        </Box>
    );
};

export { AudienceHistory };
