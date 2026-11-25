import type { GetArtistSongHistoryResult } from "@repo/common";
import { GET_ARTIST_SONG_HISTORY_ROUTE } from "@repo/common";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/utils/fetch";
import { useGetArtistSnapshots } from "./use-get-artist-snapshots";

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
    const audience = useGetArtistSnapshots({ id, resolution: "weekly" });

    return { audience, songs };
};

export { useArtistHistory };
