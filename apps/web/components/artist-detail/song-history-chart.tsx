import { Box, Text } from "@chakra-ui/react";
import { isEmpty } from "lodash";
import { Line } from "react-chartjs-2";
import type { summarizeSongs } from "@/utils/song-history";
import { COLORS, getHistoryChartOptions } from "./history-chart";
import { date } from "./history-format";

type SongHistoryChartProps = {
    chosen: string[];
    darkMode: boolean;
    summaries: ReturnType<typeof summarizeSongs>;
    weeks: string[];
};

const SongHistoryChart = (props: SongHistoryChartProps) => {
    const { chosen, darkMode, summaries, weeks } = props;
    const chart = {
        datasets: chosen.map((id, index) => {
            const song = summaries.find((row) => row.id === id);
            const values = new Map(
                song?.range.map((row) => [row.timestamp, row.listenCount])
            );

            return {
                backgroundColor: COLORS[index % COLORS.length],
                borderColor: COLORS[index % COLORS.length],
                data: weeks.map((week) => values.get(week) ?? null),
                label: song?.name ?? id,
                pointRadius: 4,
                spanGaps: false,
            };
        }),
        labels: weeks.map(date),
    };

    if (isEmpty(chosen)) {
        return <Text>Select a song to view its history.</Text>;
    }

    if (
        !chart.datasets.some((dataset) =>
            dataset.data.some((value) => value != null)
        )
    ) {
        return (
            <Text>No listen counts for the selected songs in this range.</Text>
        );
    }

    return (
        <Box h="340px" minW="0">
            <Line
                aria-label="Selected songs lifetime listens by week (UTC)"
                data={chart}
                options={getHistoryChartOptions(
                    darkMode,
                    "Lifetime cumulative listens"
                )}
                role="img"
            />
        </Box>
    );
};

export { SongHistoryChart };
