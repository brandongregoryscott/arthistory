"use client";

import type { Artist, ArtistWithTrackingStatus } from "@repo/common";
import type { RemovableBadgeProps, SearchResultProps } from "@repo/ui";
import Box from "@leafygreen-ui/box";
import { css } from "@leafygreen-ui/emotion";
import { BasicEmptyState } from "@leafygreen-ui/empty-state";
import Icon from "@leafygreen-ui/icon";
import LeafyGreenProvider from "@leafygreen-ui/leafygreen-provider";
import { palette } from "@leafygreen-ui/palette";
import { color } from "@leafygreen-ui/tokens";
import { Link } from "@leafygreen-ui/typography";
import { DEFAULT_ARTIST_IDS } from "@repo/common";
import { Footer, Header, SearchSelect } from "@repo/ui";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from "chart.js";
import { compact, isEmpty, uniq } from "lodash";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar } from "react-chartjs-2";
import {
    useBreakpoint,
    useGetLatestMeta,
    useListArtists,
    useListArtistSnapshots,
    useRequestArtist,
    useSearchArtistsByName,
} from "@/hooks";
import { humanizeNumber } from "@/utils/number-utils";

/**
 * This component needs to be dynamically imported for the NextJS build to work with Node 24+
 */
const PageLoader = dynamic(
    () =>
        import("@leafygreen-ui/loading-indicator").then(
            ({ PageLoader }) => PageLoader
        ),
    { ssr: false }
);

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
);

const EMPTY_ARTISTS: Record<string, Artist> = {};

const HomePage: React.FC = () => {
    const [isMounted, setIsMounted] = useState<boolean>(false);
    const breakpoint = useBreakpoint();
    const [darkMode, setDarkMode] = useState<boolean>(getDefaultDarkMode);
    const [searchValue, setSearchValue] = useState<string>("");
    const [selectedArtistIds, setSelectedArtistIds] =
        useState<string[]>(DEFAULT_ARTIST_IDS);
    const [requestedArtistIds, setRequestedArtistIds] = useState<string[]>([]);
    const { data: searchResults } = useSearchArtistsByName({
        name: searchValue,
    });
    const [loadingText, setLoadingText] = useState<string>("Loading...");
    const initialTimestampRef = useRef<number>(new Date().valueOf());
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined
    );
    const { mutate: requestArtist } = useRequestArtist();
    const { data: latestMeta } = useGetLatestMeta();
    const { data: artists = EMPTY_ARTISTS, error: artistsError } =
        useListArtists({
            ids: selectedArtistIds,
        });
    const {
        data: snapshots,
        error: snapshotsError,
        isLoading,
    } = useListArtistSnapshots({
        ids: selectedArtistIds,
    });
    const isLoadingRef = useRef<boolean>(isLoading);
    // eslint-disable-next-line react-hooks/refs -- Look into refactoring this the next time this page is updated
    isLoadingRef.current = isLoading;

    useEffect(() => {
        if (!isLoading) {
            return;
        }

        timerRef.current = setInterval(() => {
            const isLoading = isLoadingRef.current;
            if (!isLoading) {
                clearInterval(timerRef.current);
                return;
            }

            const initialTimestamp = initialTimestampRef.current;
            const currentTimestamp = new Date().valueOf();
            const loadingTimeInSeconds = differenceInSeconds(
                initialTimestamp,
                currentTimestamp
            );

            if (loadingTimeInSeconds > 40) {
                setLoadingText("Any second now...");
                return;
            }

            if (loadingTimeInSeconds > 30) {
                setLoadingText("Almost there...");
                return;
            }

            if (loadingTimeInSeconds > 15) {
                setLoadingText(
                    "The server is likely cold booting, please hold..."
                );
                return;
            }

            if (loadingTimeInSeconds > 5) {
                setLoadingText("Still loading, hold tight...");
                return;
            }
        }, 1000);
    }, [isLoading]);

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
                data: artistSnapshots.map((snapshot) => snapshot.followers),
                label,
                ...getHashedBarChartColor(artistId, darkMode),
            };
        });

        return { datasets: compact(datasets), labels: compact(labels) };
    }, [snapshots, selectedArtistIds, breakpoint, artists, darkMode]);

    const textColor = darkMode
        ? color.dark.text.primary.default
        : color.light.text.primary.default;

    const invertedTextColor = darkMode
        ? color.light.text.primary.default
        : color.dark.text.primary.default;

    const invertedBackgroundColor = darkMode
        ? color.light.background.primary.default
        : color.dark.background.primary.default;

    const gridColor = darkMode
        ? color.dark.background.disabled.default
        : color.light.background.disabled.default;

    const options = useMemo(
        () => ({
            elements: {
                bar: {
                    borderWidth: 2,
                },
            },
            indexAxis: "x" as const,
            maintainAspectRatio: breakpoint === "desktop",
            plugins: {
                legend: {
                    labels: {
                        color: textColor,
                    },
                    position:
                        breakpoint === "mobile"
                            ? ("bottom" as const)
                            : ("right" as const),
                },
                title: {
                    color: textColor,
                    display: true,
                    text: "Spotify followers over time",
                },
                tooltip: {
                    backgroundColor: invertedBackgroundColor,
                    bodyColor: invertedTextColor,
                    titleColor: invertedTextColor,
                },
            },
            responsive: true,
            scales: {
                x: {
                    grid: {
                        color: gridColor,
                    },
                    ticks: {
                        color: textColor,
                    },
                },
                y: {
                    grid: {
                        color: gridColor,
                    },
                    ticks: {
                        callback: (value: number | string) => {
                            if (typeof value === "number") {
                                return humanizeNumber(value);
                            }

                            return value;
                        },
                        color: textColor,
                    },
                    title: {
                        color: textColor,
                        display: true,
                        text: "Followers",
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
                            alignItems: "center",
                            columnGap: 4,
                            display: "flex",
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
                onClick: () => {
                    if (result.isTracked) {
                        addArtist(result.id);
                    }
                },
                selected: selectedArtistIds.includes(result.id),
            };
        },
        [addArtist, requestArtist, requestedArtistIds, selectedArtistIds]
    );

    const getRemovableBadgeProps = useCallback(
        (artist: Artist): RemovableBadgeProps => {
            return {
                children: artist.name,
                onRemove: () => {
                    removeArtist(artist.id);
                },
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

    const backgroundColor = darkMode
        ? color.dark.background.primary.default
        : color.light.background.primary.default;

    if (isLoading) {
        return (
            <LeafyGreenProvider darkMode={darkMode}>
                <Box
                    className={css({
                        alignItems: "center",
                        backgroundColor,
                        display: "flex",
                        flexDirection: "column",
                        height: "100%",
                        justifyContent: "center",
                        width: "100%",
                    })}>
                    <PageLoader description={loadingText} />
                </Box>
            </LeafyGreenProvider>
        );
    }

    if (snapshotsError != null || artistsError != null) {
        return (
            <LeafyGreenProvider darkMode={darkMode}>
                <Box
                    className={css({
                        alignItems: "center",
                        backgroundColor,
                        display: "flex",
                        flexDirection: "column",
                        height: "100%",
                        justifyContent: "center",
                        width: "100%",
                    })}>
                    <BasicEmptyState
                        description={
                            artistsError?.message ??
                            snapshotsError?.message ??
                            "One or more requests failed"
                        }
                        graphic={
                            <Icon
                                color={color.dark.icon.error.default}
                                glyph="Warning"
                                size={48}
                            />
                        }
                        title="Error loading artists"
                    />
                </Box>
            </LeafyGreenProvider>
        );
    }

    return (
        <LeafyGreenProvider darkMode={darkMode}>
            <Box
                className={css({
                    backgroundColor,
                    height: "100%",
                    width: "100%",
                })}>
                <Box
                    className={css({
                        display: "flex",
                        flexDirection: "column",
                        height: "calc(100% - 192px)",
                        padding: 16,
                        rowGap: 16,
                        width: "100%",
                    })}>
                    <Header />
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
                    darkMode={darkMode}
                    lastUpdated={latestMeta?.timestamp}
                    onThemeChange={setDarkMode}
                />
            </Box>
        </LeafyGreenProvider>
    );
};

const getHashedBarChartColor = (id: string, darkMode: boolean) => {
    const lightThemeColors = [
        {
            backgroundColor: palette.gray.light2,
            borderColor: palette.gray.dark3,
        },
        {
            backgroundColor: palette.blue.light3,
            borderColor: palette.blue.dark1,
        },
        {
            backgroundColor: palette.blue.light2,
            borderColor: palette.blue.dark3,
        },
        {
            backgroundColor: palette.green.light2,
            borderColor: palette.green.dark3,
        },
        {
            backgroundColor: palette.purple.light2,
            borderColor: palette.purple.dark3,
        },
        {
            backgroundColor: palette.red.light2,
            borderColor: palette.red.dark3,
        },
        {
            backgroundColor: palette.yellow.light2,
            borderColor: palette.yellow.dark3,
        },
    ];

    const lightOrDarkColors = [
        {
            backgroundColor: palette.green.light3,
            borderColor: palette.green.dark1,
        },
        {
            backgroundColor: palette.purple.light3,
            borderColor: palette.purple.base,
        },
        {
            backgroundColor: palette.red.light3,
            borderColor: palette.red.base,
        },
        {
            backgroundColor: palette.yellow.light3,
            borderColor: palette.yellow.base,
        },
    ];

    const colors = darkMode
        ? lightOrDarkColors
        : [...lightThemeColors, ...lightOrDarkColors];

    const index = Math.abs(hash(id) % colors.length);

    const color = colors[index];

    return color;
};

const differenceInSeconds = (
    initialTimestamp: number,
    currentTimestamp: number
): number => {
    const difference = currentTimestamp - initialTimestamp;
    return difference / 1000;
};

const hash = (value: string) => {
    let h = 0,
        l = value.length,
        i = 0;
    if (l > 0) {
        while (i < l) {
            h = ((h << 5) - h + value.charCodeAt(i++)) | 0;
        }
    }
    return h;
};

const getDefaultDarkMode = (): boolean =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

// eslint-disable-next-line collation/no-default-export -- NextJS pages need to be default exported
export default HomePage;
