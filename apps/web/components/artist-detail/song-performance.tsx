import type { SongHistoryObservation } from "@repo/common";
import { Box, Flex, Heading, Input, Spinner, Text } from "@chakra-ui/react";
import { isEmpty, sortBy } from "lodash";
import { useState } from "react";
import { summarizeSongs } from "@/utils/song-history";
import { SongHistoryChart } from "./song-history-chart";
import { SongTable } from "./song-table";

type SongPerformanceProps = {
    darkMode: boolean;
    error: Error | null;
    history: SongHistoryObservation[];
    isLoading: boolean;
    start: number;
    weeks: string[];
};

const SongPerformance = (props: SongPerformanceProps) => {
    const { darkMode, error, history, isLoading, start, weeks } = props;
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState("listens");
    const [selected, setSelected] = useState<null | string[]>(null);
    const summaries = summarizeSongs(history, start);
    const ranked = sortBy(summaries, [
        (song) => -(song.latest.listenCount ?? -1),
        (song) => song.name.toLocaleLowerCase(),
    ]);
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

    if (isLoading) {
        return <Spinner aria-label="Loading song history" />;
    }

    if (error != null) {
        return (
            <Text role="alert">
                Unable to load song history. {error.message}
            </Text>
        );
    }

    if (isEmpty(summaries)) {
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
            <SongTable
                chosen={chosen}
                onSongChange={handleSongChange}
                onSongClick={handleSongClick}
                ranked={ranked}
                rows={rows}
            />
            {isEmpty(rows) && <Text>No songs match your search.</Text>}
            <Heading size="lg">Lifetime listens over time</Heading>
            <Text color="fg.muted">
                Select songs to compare, or click a title to focus. A single
                observation appears as a point; no trend is inferred.
            </Text>
            <SongHistoryChart
                chosen={chosen}
                darkMode={darkMode}
                summaries={summaries}
                weeks={weeks}
            />
        </>
    );
};

export { SongPerformance };
