import type {
    GetArtistSnapshotsResult,
    GetArtistSongHistoryResult,
} from "@repo/common";
import {
    GET_ARTIST_SNAPSHOTS_ROUTE,
    GET_ARTIST_SONG_HISTORY_ROUTE,
} from "@repo/common";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/utils/fetch";

const useArtistHistory = (id: string) => {
    const songs = useQuery({
        queryFn: async () => {
            const result = (await get(
                GET_ARTIST_SONG_HISTORY_ROUTE.replace(":id", id)
            )) as GetArtistSongHistoryResult;

            if (result.error !== null) {
                throw result.error;
            }

            return result.data;
        },
        queryKey: ["artist-song-history", id],
    });
    const audience = useQuery({
        queryFn: async () => {
            const result = (await get(
                `${GET_ARTIST_SNAPSHOTS_ROUTE.replace(":id", id)}?resolution=weekly`
            )) as GetArtistSnapshotsResult;

            if (result.error !== null) {
                throw result.error;
            }

            return result.data;
        },
        queryKey: ["artist-weekly-history", id],
    });

    return { audience, songs };
};

export { useArtistHistory };
