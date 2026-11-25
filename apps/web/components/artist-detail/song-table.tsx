import { Box, Text } from "@chakra-ui/react";
import type { summarizeSongs } from "@/utils/song-history";
import { formatDate, formatNumber } from "@/utils/format";

type SongTableProps = {
    chosen: string[];
    onSongChange: React.ChangeEventHandler<HTMLInputElement>;
    onSongClick: React.MouseEventHandler<HTMLButtonElement>;
    ranked: ReturnType<typeof summarizeSongs>;
    rows: ReturnType<typeof summarizeSongs>;
};

const SongTable = (props: SongTableProps) => {
    const { chosen, ranked, rows } = props;

    return (
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
                                    onChange={props.onSongChange}
                                    type="checkbox"
                                    value={song.id}
                                />
                            </td>
                            <td>
                                <button
                                    onClick={props.onSongClick}
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
                            <td>{formatNumber(song.latest.listenCount)}</td>
                            <td>
                                {formatChange(song.change, song.decreased)}
                                <Text color="fg.muted" fontSize="xs">
                                    {song.change != null &&
                                    song.first != null &&
                                    song.last != null
                                        ? `${formatDate(song.first.capturedAt)} – ${formatDate(song.last.capturedAt)}`
                                        : ""}
                                </Text>
                            </td>
                            <td>{formatDate(song.latest.capturedAt)}</td>
                        </tr>
                    ))}
                </tbody>
            </Box>
        </Box>
    );
};

const formatChange = (change: null | number, decreased: boolean) => {
    if (decreased) {
        return "Count decreased; unavailable";
    }

    if (change == null) {
        return "Insufficient comparable data";
    }

    return "+" + formatNumber(change);
};

export { SongTable };
