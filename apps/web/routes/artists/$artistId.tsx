import {
    Box,
    Button,
    Flex,
    Heading,
    Image,
    Spinner,
    Text,
    Theme,
} from "@chakra-ui/react";
import { Footer, Header } from "@repo/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AudienceHistory } from "@/components/artist-detail/audience-history";
import { SongPerformance } from "@/components/artist-detail/song-performance";
import { useListArtists, useBreakpoint } from "@/hooks";
import { useArtistHistory } from "@/hooks/use-artist-history";
import { useTheme } from "@/hooks/use-theme";
import { formatDate, formatNumber } from "@/utils/format";
import { historyWeeks } from "@/utils/song-history";

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

const ArtistDetail = (props: ArtistDetailParams) => {
    const { artistId } = props;

    const [darkMode, setDarkMode] = useTheme();
    const breakpoint = useBreakpoint();
    const metadata = useListArtists({ ids: [artistId] });
    const artist = metadata.data?.[artistId];
    const { audience, songs } = useArtistHistory(artistId);
    const [range, setRange] = useState(90);
    const allSongs = songs.data ?? [];
    const allAudience = audience.data ?? [];
    const end = Math.max(
        0,
        ...allSongs.map((row) => Date.parse(row.timestamp)),
        ...allAudience.map((row) => Date.parse(row.timestamp))
    );
    const start = range === 0 ? 0 : end - range * 86400000;
    const weeks = historyWeeks(
        [...allSongs, ...allAudience]
            .filter((row) => Date.parse(row.timestamp) >= start)
            .map((row) => row.timestamp)
    );
    const latest = allAudience.at(-1);
    const captured = [
        ...allSongs.map((row) => row.capturedAt),
        ...allAudience.map((row) => row.capturedAt ?? row.timestamp),
    ]
        .sort()
        .at(-1);

    const handleRangeClick = (event: React.MouseEvent<HTMLButtonElement>) =>
        setRange(Number(event.currentTarget.value));

    const handleThemeChange = (value: React.SetStateAction<boolean>) =>
        setDarkMode(value);

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
                        <Heading>{formatNumber(latest?.followers)}</Heading>
                    </Box>
                    <Box>
                        <Text color="fg.muted">Monthly listeners</Text>
                        <Heading>
                            {formatNumber(latest?.monthlyListeners)}
                        </Heading>
                    </Box>
                    <Box>
                        <Text color="fg.muted">Popularity / 100</Text>
                        <Heading>{formatNumber(latest?.popularity)}</Heading>
                    </Box>
                </Flex>
                <Text color="fg.muted">
                    Latest capture:{" "}
                    {captured != null
                        ? new Date(captured).toLocaleString()
                        : "No observations yet"}
                    .{" "}
                    {latest != null &&
                        `Artist metrics captured ${formatDate(latest.capturedAt ?? latest.timestamp)}.`}
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
                            ? formatDate(new Date(end).toISOString())
                            : "when observations are available"}
                        . Changes compare the first and last observations inside
                        the range; each row shows its comparison dates.
                    </Text>
                </Box>
                <SongPerformance
                    darkMode={darkMode}
                    error={songs.error}
                    history={allSongs}
                    isLoading={songs.isLoading}
                    start={start}
                    weeks={weeks}
                />
                <Heading size="xl">Artist audience history</Heading>
                <AudienceHistory
                    darkMode={darkMode}
                    error={audience.error}
                    history={allAudience}
                    isLoading={audience.isLoading}
                    start={start}
                    weeks={weeks}
                />
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
