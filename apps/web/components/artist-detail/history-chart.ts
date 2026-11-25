import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
} from "chart.js";

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Tooltip,
    Legend
);

const COLORS = ["#319795", "#805ad5", "#dd6b20", "#3182ce", "#d53f8c"];

const getHistoryChartOptions = (darkMode: boolean, title: string) => {
    const textColor = darkMode ? "#e2e8f0" : "#2d3748";

    return {
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } },
        responsive: true,
        scales: {
            x: {
                ticks: { color: textColor, maxTicksLimit: 8 },
                title: {
                    color: textColor,
                    display: true,
                    text: "Week beginning (UTC)",
                },
            },
            y: {
                ticks: { color: textColor },
                title: { color: textColor, display: true, text: title },
            },
        },
    };
};

export { COLORS, getHistoryChartOptions };
