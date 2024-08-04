import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
    GET_ARTIST_SNAPSHOTS_ROUTE,
    GetArtistSnapshotsOptions,
    GetArtistSnapshotsResult,
} from "@repo/common";
import { get } from "@/utils/fetch";
import { isEmpty } from "lodash";

const useGetArtistSnapshots = (options: GetArtistSnapshotsOptions) => {
    const { id } = options;
    return useQuery({
        enabled: !isEmpty(id),
        placeholderData: keepPreviousData,
        queryFn: async () => {
            const { data, error } = (await get(
                GET_ARTIST_SNAPSHOTS_ROUTE.replace(":id", id)
            )) as GetArtistSnapshotsResult;
            if (error !== null) {
                throw error;
            }

            return data;
        },
        queryKey: ["get-artist-snapshots", id],
    });
};

export { useGetArtistSnapshots };
