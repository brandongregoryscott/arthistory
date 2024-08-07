"use client";

import Box from "@leafygreen-ui/box";
import { Link } from "@leafygreen-ui/typography";
import { css } from "@leafygreen-ui/emotion";
import { useCallback, useEffect, useMemo, useState } from "react";
import LeafyGreenProvider from "@leafygreen-ui/leafygreen-provider";
import { Bar } from "react-chartjs-2";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from "chart.js";
import {
    useBreakpoint,
    useGetLatestMeta,
    useListArtists,
    useListArtistSnapshots,
    useRequestArtist,
    useSearchArtistsByName,
} from "@/hooks";
import { compact, isEmpty, uniq } from "lodash";
import { color } from "@leafygreen-ui/tokens";
import { palette } from "@leafygreen-ui/palette";
import {
    Footer,
    Header,
    RemovableBadgeProps,
    SearchResultProps,
    SearchSelect,
} from "@repo/ui";
import {
    ArtistRow,
    ArtistWithTrackingStatus,
    DEFAULT_ARTIST_IDS,
} from "@repo/common";
import { humanizeNumber } from "@/utils/number-utils";
import { BasicEmptyState } from "@leafygreen-ui/empty-state";
import Icon from "@leafygreen-ui/icon";

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
);

const EMPTY_ARTISTS: Record<string, ArtistRow> = {};

const HomePage: React.FC = () => {
    const [isMounted, setIsMounted] = useState<boolean>(false);
    const breakpoint = useBreakpoint();
    const [darkTheme, setDarkTheme] = useState<boolean>(getDefaultDarkTheme);
    const [searchValue, setSearchValue] = useState<string>("");
    const [selectedArtistIds, setSelectedArtistIds] =
        useState<string[]>(DEFAULT_ARTIST_IDS);
    const [requestedArtistIds, setRequestedArtistIds] = useState<string[]>([]);
    const { data: searchResults } = useSearchArtistsByName({
        name: searchValue,
    });
    const { mutate: requestArtist } = useRequestArtist();
    const { data: latestMeta } = useGetLatestMeta();
    const { data: artists = EMPTY_ARTISTS } = useListArtists({
        ids: selectedArtistIds,
    });
    const { data: snapshots } = useListArtistSnapshots({
        ids: selectedArtistIds,
    });

    const data = useMemo(() => {
        const labels = uniq(
            compact(
                snapshots?.map((snapshot) =>
                    new Date(snapshot.timestamp).toLocaleDateString(undefined, {
                        dateStyle:
                            breakpoint === "mobile" ? "short" : undefined,
                    })
                )
            )
        );

        const datasets = selectedArtistIds.map((artistId) => {
            const artistSnapshots =
                snapshots?.filter((snapshot) => snapshot.id === artistId) ?? [];

            const label = artists[artistId]?.name;
            if (label === undefined) {
                return undefined;
            }

            return {
                label,
                data: artistSnapshots.map((snapshot) => snapshot.followers),
                ...getHashedBarChartColor(artistId, darkTheme),
            };
        });

        return { labels: compact(labels), datasets: compact(datasets) };
    }, [snapshots, selectedArtistIds, breakpoint, artists, darkTheme]);

    const textColor = darkTheme
        ? color.dark.text.primary.default
        : color.light.text.primary.default;

    const invertedTextColor = darkTheme
        ? color.light.text.primary.default
        : color.dark.text.primary.default;

    const invertedBackgroundColor = darkTheme
        ? color.light.background.primary.default
        : color.dark.background.primary.default;

    const gridColor = darkTheme
        ? color.dark.background.disabled.default
        : color.light.background.disabled.default;

    const options = useMemo(
        () => ({
            indexAxis: "x" as const,
            maintainAspectRatio: breakpoint === "desktop",
            elements: {
                bar: {
                    borderWidth: 2,
                },
            },
            responsive: true,
            plugins: {
                tooltip: {
                    bodyColor: invertedTextColor,
                    titleColor: invertedTextColor,
                    backgroundColor: invertedBackgroundColor,
                },
                legend: {
                    position:
                        breakpoint === "mobile"
                            ? ("bottom" as const)
                            : ("right" as const),
                    labels: {
                        color: textColor,
                    },
                },
                title: {
                    display: true,
                    text: "Spotify followers over time",
                    color: textColor,
                },
            },
            scales: {
                y: {
                    ticks: {
                        color: textColor,
                        callback: (value: string | number) => {
                            if (typeof value === "number") {
                                return humanizeNumber(value);
                            }

                            return value;
                        },
                    },
                    grid: {
                        color: gridColor,
                    },
                    title: {
                        display: true,
                        text: "Followers",
                        color: textColor,
                    },
                },
                x: {
                    ticks: {
                        color: textColor,
                    },
                    grid: {
                        color: gridColor,
                    },
                },
            },
        }),
        [
            breakpoint,
            gridColor,
            invertedBackgroundColor,
            invertedTextColor,
            textColor,
        ]
    );

    const addArtist = useCallback(
        (id: string) =>
            setSelectedArtistIds((selectedArtistIds) =>
                selectedArtistIds.includes(id) || selectedArtistIds.length >= 10
                    ? selectedArtistIds
                    : [...selectedArtistIds, id]
            ),
        []
    );

    const removeArtist = useCallback(
        (id: string) =>
            setSelectedArtistIds((selectedArtistIds) =>
                selectedArtistIds.filter(
                    (selectedArtistId) => selectedArtistId !== id
                )
            ),
        []
    );

    const getSearchResultProps = useCallback(
        (result: ArtistWithTrackingStatus): SearchResultProps => {
            return {
                children: result.name,
                description: result.isTracked ? (
                    result.genres.join(", ")
                ) : (
                    <Box
                        className={css({
                            display: "flex",
                            alignItems: "center",
                            columnGap: 4,
                        })}>
                        This artist is not yet being tracked.
                        <Link
                            onClick={(
                                event: React.MouseEvent<HTMLAnchorElement>
                            ) => {
                                event.stopPropagation();
                                if (requestedArtistIds.includes(result.id)) {
                                    return;
                                }

                                requestArtist({ id: result.id });
                                setRequestedArtistIds((requestedArtistIds) => [
                                    ...requestedArtistIds,
                                    result.id,
                                ]);
                            }}>
                            {requestedArtistIds.includes(result.id)
                                ? "Requested"
                                : "Request"}
                        </Link>
                    </Box>
                ),
                disabled: !result.isTracked,
                selected: selectedArtistIds.includes(result.id),
                onClick: () => {
                    if (result.isTracked) {
                        addArtist(result.id);
                    }
                },
            };
        },
        [addArtist, requestArtist, requestedArtistIds, selectedArtistIds]
    );

    const getRemovableBadgeProps = useCallback(
        (artist: ArtistRow): RemovableBadgeProps => {
            return {
                onRemove: () => {
                    removeArtist(artist.id);
                },
                children: artist.name,
            };
        },
        [removeArtist]
    );

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return;
    }

    return (
        <LeafyGreenProvider darkMode={darkTheme}>
            <Box
                className={css({
                    width: "100%",
                    height: "100%",
                    backgroundColor: darkTheme
                        ? color.dark.background.primary.default
                        : color.light.background.primary.default,
                })}>
                <Box
                    className={css({
                        width: "100%",
                        height: "calc(100% - 192px)",
                        padding: 16,
                        rowGap: 16,
                        display: "flex",
                        flexDirection: "column",
                    })}>
                    <Header
                        breakpoint={breakpoint}
                        darkTheme={darkTheme}
                        onThemeChange={setDarkTheme}
                    />
                    <SearchSelect
                        getRemovableBadgeProps={getRemovableBadgeProps}
                        getSearchResultProps={getSearchResultProps}
                        onChange={setSearchValue}
                        results={searchResults}
                        selectedIds={selectedArtistIds}
                        selectedValueMap={artists}
                        value={searchValue}
                    />
                    {isEmpty(selectedArtistIds) ? (
                        <BasicEmptyState
                            description="Select one or more artists to view historical data"
                            graphic={
                                <Icon
                                    color={textColor}
                                    glyph="Charts"
                                    size={48}
                                />
                            }
                            title="No artists selected"
                        />
                    ) : (
                        <Bar data={data} key={breakpoint} options={options} />
                    )}
                </Box>
                <Footer
                    breakpoint={breakpoint}
                    darkTheme={darkTheme}
                    lastUpdated={latestMeta?.timestamp}
                />
            </Box>
        </LeafyGreenProvider>
    );
};

const getHashedBarChartColor = (id: string, darkTheme: boolean) => {
    const lightThemeColors = [
        {
            borderColor: palette.gray.dark3,
            backgroundColor: palette.gray.light2,
        },
        {
            borderColor: palette.blue.dark1,
            backgroundColor: palette.blue.light3,
        },
        {
            borderColor: palette.blue.dark3,
            backgroundColor: palette.blue.light2,
        },
        {
            borderColor: palette.green.dark3,
            backgroundColor: palette.green.light2,
        },
        {
            borderColor: palette.purple.dark3,
            backgroundColor: palette.purple.light2,
        },
        {
            borderColor: palette.red.dark3,
            backgroundColor: palette.red.light2,
        },
        {
            borderColor: palette.yellow.dark3,
            backgroundColor: palette.yellow.light2,
        },
    ];

    const lightOrDarkColors = [
        {
            borderColor: palette.green.dark1,
            backgroundColor: palette.green.light3,
        },
        {
            borderColor: palette.purple.base,
            backgroundColor: palette.purple.light3,
        },
        {
            borderColor: palette.red.base,
            backgroundColor: palette.red.light3,
        },
        {
            borderColor: palette.yellow.base,
            backgroundColor: palette.yellow.light3,
        },
    ];

    const colors = darkTheme
        ? lightOrDarkColors
        : [...lightThemeColors, ...lightOrDarkColors];

    const index = Math.abs(hash(id) % colors.length);

    const color = colors[index];

    return color!;
};

const hash = (value: string) => {
    var h = 0,
        l = value.length,
        i = 0;
    if (l > 0) while (i < l) h = ((h << 5) - h + value.charCodeAt(i++)) | 0;
    return h;
};

const getDefaultDarkTheme = (): boolean =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

export default HomePage;
