import type { Artist, ArtistWithTrackingStatus } from "@repo/common";
import type { RemovableBadgeProps, SearchResultProps } from "@repo/ui";
import {
    Box,
    Button,
    Center,
    EmptyState,
    Flex,
    Spinner,
    Text,
    Theme,
    useToken,
} from "@chakra-ui/react";
import { DEFAULT_ARTIST_IDS } from "@repo/common";
import { Footer, Header, SearchSelect } from "@repo/ui";
import { createFileRoute } from "@tanstack/react-router";
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
import { ChartNoAxesCombined, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
    useEffect(() => {
        if (!isLoading) {
            return;
        }
        const initialTimestamp = Date.now();
        const timer = setInterval(() => {
            const seconds = differenceInSeconds(initialTimestamp, Date.now());
            if (seconds > 40) {
                setLoadingText("Any second now...");
                return;
            }
            if (seconds > 30) {
                setLoadingText("Almost there...");
                return;
            }
            if (seconds > 15) {
                setLoadingText(
                    "The server is likely cold booting, please hold..."
                );
                return;
            }
            if (seconds > 5) {
                setLoadingText("Still loading, hold tight...");
                return;
            }
            setLoadingText("Loading...");
        }, 1000);
        return () => clearInterval(timer);
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

    const [
        lightText,
        darkText,
        lightGrid,
        darkGrid,
        lightBackground,
        darkBackground,
    ] = useToken("colors", [
        "gray.800",
        "gray.100",
        "gray.200",
        "gray.800",
        "white",
        "gray.950",
    ]);
    const textColor = darkMode ? darkText : lightText;
    const invertedTextColor = darkMode ? lightText : darkText;
    const invertedBackgroundColor = darkMode ? lightBackground : darkBackground;
    const gridColor = darkMode ? darkGrid : lightGrid;

    const options = useMemo(
        () => ({
            elements: {
                bar: {
                    borderWidth: 2,
                },
            },
            indexAxis: "x" as const,
            maintainAspectRatio: false,
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
                    <Flex align="center" flexWrap="wrap" gap="1">
                        This artist is not yet being tracked.
                        <Button
                            disabled={requestedArtistIds.includes(result.id)}
                            onClick={(event) => {
                                event.stopPropagation();
                                if (requestedArtistIds.includes(result.id)) {
                                    return;
                                }

                                requestArtist({ id: result.id });
                                setRequestedArtistIds((requestedArtistIds) => [
                                    ...requestedArtistIds,
                                    result.id,
                                ]);
                            }}
                            size="xs"
                            variant="plain">
                            {requestedArtistIds.includes(result.id)
                                ? "Requested"
                                : "Request"}
                        </Button>
                    </Flex>
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

    const renderContent = () => {
        if (isLoading) {
            return (
                <Center flex="1" minH="60vh" role="status">
                    <Flex align="center" direction="column" gap="4">
                        <Spinner color="teal.500" size="xl" />
                        <Text>{loadingText}</Text>
                    </Flex>
                </Center>
            );
        }
        if (snapshotsError != null || artistsError != null) {
            return (
                <EmptyState.Root flex="1">
                    <EmptyState.Content>
                        <EmptyState.Indicator>
                            <TriangleAlert />
                        </EmptyState.Indicator>
                        <EmptyState.Title>
                            Error loading artists
                        </EmptyState.Title>
                        <EmptyState.Description>
                            {artistsError?.message ??
                                snapshotsError?.message ??
                                "One or more requests failed"}
                        </EmptyState.Description>
                    </EmptyState.Content>
                </EmptyState.Root>
            );
        }
        return (
            <>
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
                    <EmptyState.Root flex="1">
                        <EmptyState.Content>
                            <EmptyState.Indicator>
                                <ChartNoAxesCombined />
                            </EmptyState.Indicator>
                            <EmptyState.Title>
                                No artists selected
                            </EmptyState.Title>
                            <EmptyState.Description>
                                Select one or more artists to view historical
                                data
                            </EmptyState.Description>
                        </EmptyState.Content>
                    </EmptyState.Root>
                ) : (
                    <Box
                        h={{
                            base: "480px",
                            md: "min(65vh, 800px)",
                        }}
                        minW="0"
                        position="relative"
                        w="full">
                        <Bar
                            aria-label="Spotify followers over time"
                            data={data}
                            key={breakpoint}
                            options={options}
                            role="img"
                        />
                    </Box>
                )}
            </>
        );
    };

    return (
        <Theme appearance={darkMode ? "dark" : "light"}>
            <Flex bg="bg" color="fg" direction="column" minH="100dvh">
                <Flex
                    as="main"
                    direction="column"
                    flex="1"
                    gap="4"
                    maxW="1600px"
                    mx="auto"
                    p={{ base: "4", md: "6" }}
                    w="full">
                    <Header />
                    {renderContent()}
                </Flex>
                <Footer
                    breakpoint={breakpoint}
                    darkMode={darkMode}
                    lastUpdated={latestMeta?.timestamp}
                    onThemeChange={setDarkMode}
                />
            </Flex>
        </Theme>
    );
};

const getHashedBarChartColor = (id: string, darkMode: boolean) => {
    const colors = [
        "#319795",
        "#805ad5",
        "#dd6b20",
        "#3182ce",
        "#d53f8c",
        "#38a169",
        "#d69e2e",
        "#00a3c4",
        "#e53e3e",
        "#718096",
        "#667eea",
    ];
    const color = colors[Math.abs(hash(id) % colors.length)];
    return {
        backgroundColor: `${color}${darkMode ? "99" : "55"}`,
        borderColor: color,
    };
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

const Route = createFileRoute("/")({ component: HomePage });

export { Route };
