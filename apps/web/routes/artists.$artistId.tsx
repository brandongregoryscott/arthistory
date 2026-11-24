import {
    Box,
    Button,
    Flex,
    Heading,
    Image,
    Input,
    Spinner,
    Text,
    Theme,
} from "@chakra-ui/react";
import { Footer, Header } from "@repo/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
} from "chart.js";
import { useState } from "react";
import { Line } from "react-chartjs-2";
import { useListArtists, useBreakpoint } from "@/hooks";
import { useArtistHistory } from "@/hooks/use-artist-history";
import { useTheme } from "@/hooks/use-theme";
import { historyWeeks, summarizeSongs } from "@/utils/song-history";

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Tooltip,
    Legend
);

const COLORS = ["#319795", "#805ad5", "#dd6b20", "#3182ce", "#d53f8c"];

const date = (value: string) =>
    new Date(value).toLocaleDateString(undefined, { timeZone: "UTC" });

const number = (value: null | number | undefined) =>
    value == null ? "Unavailable" : value.toLocaleString();

const formatChange = (change: null | number, decreased: boolean) => {
    if (decreased) {
        return "Count decreased; unavailable";
    }

    if (change == null) {
        return "Insufficient comparable data";
    }

    return "+" + number(change);
};

const ArtistPage = () => {
    const { artistId } = Route.useParams();
    const validId = /^[A-Za-z0-9]{22}$/.test(artistId);

    return validId ? (
        <ArtistDetail artistId={artistId} key={artistId} />
    ) : (
        <Box p="6">
            <Link to="/">← Back to artists</Link>
            <Heading mt="6">Unknown artist</Heading>
        </Box>
    );
};

type ArtistDetailParams = { artistId: string };

const ArtistDetail = (parameter2: ArtistDetailParams) => {
    const { artistId } = parameter2;

    const [darkMode, setDarkMode] = useTheme();
    const breakpoint = useBreakpoint();
    const metadata = useListArtists({ ids: [artistId] });
    const artist = metadata.data?.[artistId];
    const { audience, songs } = useArtistHistory(artistId);
    const [range, setRange] = useState(90);
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState("listens");
    const [selected, setSelected] = useState<null | string[]>(null);
    const allSongs = songs.data ?? [];
    const allAudience = audience.data ?? [];
    const end = Math.max(
        0,
        ...allSongs.map((row) => Date.parse(row.timestamp)),
        ...allAudience.map((row) => Date.parse(row.timestamp))
    );
    const start = range === 0 ? 0 : end - range * 86400000;
    const summaries = summarizeSongs(allSongs, start);
    const ranked = [...summaries].sort((a, b) =>
        (b.latest.listenCount ?? -1) - (a.latest.listenCount ?? -1) !== 0
            ? (b.latest.listenCount ?? -1) - (a.latest.listenCount ?? -1)
            : a.name.localeCompare(b.name)
    );
    const initialSong =
        ranked.find((song) =>
            song.range.some((row) => row.listenCount != null)
        ) ?? ranked[0];
    const chosen = selected ?? (initialSong == null ? [] : [initialSong.id]);
    const rows = [...ranked]
        .filter((song) =>
            song.name.toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => {
            if (sort === "name") {
                return a.name.localeCompare(b.name);
            }

            if (sort === "change") {
                return (b.change ?? -1) - (a.change ?? -1);
            }

            return 0;
        });
    const weeks = historyWeeks(
        [...allSongs, ...allAudience]
            .filter((row) => Date.parse(row.timestamp) >= start)
            .map((row) => row.timestamp)
    );
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
    const textColor = darkMode ? "#e2e8f0" : "#2d3748";

    const options = (title: string) => ({
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
    });

    const latest = allAudience.at(-1);
    const captured = [
        ...allSongs.map((row) => row.capturedAt),
        ...allAudience.map((row) => row.capturedAt ?? row.timestamp),
    ]
        .sort()
        .at(-1);
    const audienceValues = new Map(
        allAudience.map((row) => [row.timestamp, row])
    );

    const renderSongChart = () => {
        if (chosen.length === 0) {
            return <Text>Select a song to view its history.</Text>;
        }

        if (
            !chart.datasets.some((dataset) =>
                dataset.data.some((value) => value != null)
            )
        ) {
            return (
                <Text>
                    No listen counts for the selected songs in this range.
                </Text>
            );
        }

        return (
            <Box h="340px" minW="0">
                <Line
                    aria-label="Selected songs lifetime listens by week (UTC)"
                    data={chart}
                    options={options("Lifetime cumulative listens")}
                    role="img"
                />
            </Box>
        );
    };

    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) =>
        setSearch(event.currentTarget.value);

    const handleSortChange = (event: React.ChangeEvent<HTMLSelectElement>) =>
        setSort(event.currentTarget.value);

    const handleSongChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const id = event.currentTarget.value;

        setSelected(
            chosen.includes(id)
                ? chosen.filter((selectedId) => selectedId !== id)
                : [...chosen, id]
        );
    };

    const handleSongClick = (event: React.MouseEvent<HTMLButtonElement>) =>
        setSelected([event.currentTarget.value]);

    const handleRangeClick = (event: React.MouseEvent<HTMLButtonElement>) =>
        setRange(Number(event.currentTarget.value));

    const handleThemeChange = (value: React.SetStateAction<boolean>) =>
        setDarkMode(value);

    const renderSongs = () => {
        if (songs.isLoading) {
            return <Spinner aria-label="Loading song history" />;
        }

        if (songs.error != null) {
            return (
                <Text role="alert">
                    Unable to load song history. {songs.error.message}
                </Text>
            );
        }

        if (summaries.length === 0) {
            return <Text>No song observations collected yet.</Text>;
        }

        return (
            <>
                <Flex gap="3" wrap="wrap">
                    <Input
                        aria-label="Search songs"
                        maxW="420px"
                        onChange={handleSearchChange}
                        placeholder="Search songs"
                        value={search}
                    />
                    <Box as="label">
                        Sort by{" "}
                        <select
                            aria-label="Sort songs"
                            onChange={handleSortChange}
                            style={{
                                background: "inherit",
                                color: "inherit",
                                colorScheme: darkMode ? "dark" : "light",
                                padding: 10,
                            }}
                            value={sort}>
                            <option value="listens">Lifetime listens</option>
                            <option value="change">Range change</option>
                            <option value="name">Song title</option>
                        </select>
                    </Box>
                </Flex>
                <Box borderWidth="1px" overflowX="auto" rounded="lg">
                    <Box
                        as="table"
                        css={{
                            th: {
                                color: "var(--chakra-colors-fg-muted)",
                                fontWeight: 500,
                            },
                            "th, td": {
                                borderBottomWidth: "1px",
                                padding: "14px 16px",
                                textAlign: "left",
                            },
                        }}
                        minW="660px"
                        w="full">
                        <thead>
                            <tr>
                                <th scope="col">Chart</th>
                                <th scope="col">Rank / song</th>
                                <th scope="col">Lifetime listens</th>
                                <th scope="col">Change in range</th>
                                <th scope="col">Last captured</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((song) => (
                                <tr key={song.id}>
                                    <td>
                                        <input
                                            aria-label={`Chart ${song.name}`}
                                            checked={chosen.includes(song.id)}
                                            onChange={handleSongChange}
                                            type="checkbox"
                                            value={song.id}
                                        />
                                    </td>
                                    <td>
                                        <button
                                            onClick={handleSongClick}
                                            style={{
                                                cursor: "pointer",
                                                textAlign: "left",
                                            }}
                                            value={song.id}>
                                            {ranked.findIndex(
                                                (row) => row.id === song.id
                                            ) + 1}
                                            . {song.name}
                                        </button>
                                    </td>
                                    <td>{number(song.latest.listenCount)}</td>
                                    <td>
                                        {formatChange(
                                            song.change,
                                            song.decreased
                                        )}
                                        <Text color="fg.muted" fontSize="xs">
                                            {song.change != null &&
                                            song.first != null &&
                                            song.last != null
                                                ? `${date(song.first.capturedAt)} – ${date(song.last.capturedAt)}`
                                                : ""}
                                        </Text>
                                    </td>
                                    <td>{date(song.latest.capturedAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </Box>
                </Box>
                {rows.length === 0 && <Text>No songs match your search.</Text>}
                <Heading size="lg">Lifetime listens over time</Heading>
                <Text color="fg.muted">
                    Select songs to compare, or click a title to focus. A single
                    observation appears as a point; no trend is inferred.
                </Text>
                {renderSongChart()}
            </>
        );
    };

    const renderAudience = () => {
        if (audience.isLoading) {
            return <Spinner aria-label="Loading audience history" />;
        }

        if (audience.error != null) {
            return (
                <Text role="alert">
                    Unable to load audience history. {audience.error.message}
                </Text>
            );
        }

        if (
            !allAudience.some(
                (row) =>
                    Date.parse(row.timestamp) >= start &&
                    (row.followers != null || row.monthlyListeners != null)
            )
        ) {
            return (
                <Text>No audience measurements available in this range.</Text>
            );
        }

        return (
            <Box h="280px" minW="0">
                <Line
                    aria-label="Artist followers and monthly listeners by week (UTC)"
                    data={{
                        datasets: (
                            ["followers", "monthlyListeners"] as const
                        ).map((metric, index) => ({
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
                        })),
                        labels: weeks.map(date),
                    }}
                    options={options("People")}
                    role="img"
                />
            </Box>
        );
    };

    const renderArtist = () => {
        if (metadata.isLoading) {
            return <Spinner aria-label="Loading artist" />;
        }

        if (metadata.error != null) {
            return (
                <Text role="alert">
                    Unable to load artist. {metadata.error.message}
                </Text>
            );
        }

        if (artist == null) {
            return <Heading>Unknown artist</Heading>;
        }

        return (
            <>
                <Flex align="center" gap="5">
                    {artist.images[0] != null && (
                        <Image
                            alt=""
                            boxSize={{ base: "80px", md: "128px" }}
                            objectFit="cover"
                            rounded="xl"
                            src={artist.images[0].url}
                        />
                    )}
                    <Box>
                        <Text color="fg.muted">PUBLIC ARTIST HISTORY</Text>
                        <Heading size={{ base: "2xl", md: "4xl" }}>
                            {artist.name}
                        </Heading>
                        <Text color="fg.muted">
                            {artist.genres.join(" · ")}
                        </Text>
                    </Box>
                </Flex>
                <Flex gap="8" wrap="wrap">
                    <Box>
                        <Text color="fg.muted">Followers</Text>
                        <Heading>{number(latest?.followers)}</Heading>
                    </Box>
                    <Box>
                        <Text color="fg.muted">Monthly listeners</Text>
                        <Heading>{number(latest?.monthlyListeners)}</Heading>
                    </Box>
                    <Box>
                        <Text color="fg.muted">Popularity / 100</Text>
                        <Heading>{number(latest?.popularity)}</Heading>
                    </Box>
                </Flex>
                <Text color="fg.muted">
                    Latest capture:{" "}
                    {captured != null
                        ? new Date(captured).toLocaleString()
                        : "No observations yet"}
                    .{" "}
                    {latest != null &&
                        `Artist metrics captured ${date(latest.capturedAt ?? latest.timestamp)}.`}
                </Text>
                <Flex aria-label="History range" gap="2" wrap="wrap">
                    {[
                        [28, "4 weeks"],
                        [90, "90 days"],
                        [365, "1 year"],
                        [0, "All history"],
                    ].map((parameter) => {
                        const [value, label] = parameter;

                        return (
                            <Button
                                aria-pressed={range === value}
                                key={value}
                                onClick={handleRangeClick}
                                size="sm"
                                value={value}
                                variant={range === value ? "solid" : "outline"}>
                                {label}
                            </Button>
                        );
                    })}
                </Flex>
                <Box>
                    <Heading size="xl">Song performance</Heading>
                    <Text color="fg.muted" mt="2">
                        Observed songs from public artist pages; coverage may
                        include only part of the catalog. Counts are lifetime
                        cumulative listens, not streams during the selected
                        range. Missing weeks remain gaps.
                    </Text>
                    <Text color="fg.muted" mt="1">
                        Range ends{" "}
                        {end > 0
                            ? date(new Date(end).toISOString())
                            : "when observations are available"}
                        . Changes compare the first and last observations inside
                        the range; each row shows its comparison dates.
                    </Text>
                </Box>
                {renderSongs()}
                <Heading size="xl">Artist audience history</Heading>
                {renderAudience()}
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
                    gap="6"
                    maxW="1400px"
                    minW="0"
                    mx="auto"
                    p={{ base: "4", md: "8" }}
                    w="full">
                    <Header />
                    <Link to="/">← Back to artist comparison</Link>
                    {renderArtist()}
                </Flex>
                <Footer
                    breakpoint={breakpoint}
                    darkMode={darkMode}
                    lastUpdated={captured}
                    onThemeChange={handleThemeChange}
                />
            </Flex>
        </Theme>
    );
};

const Route = createFileRoute("/artists/$artistId")({ component: ArtistPage });

export { Route };
