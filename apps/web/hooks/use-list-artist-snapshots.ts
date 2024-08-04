import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
    LIST_ARTIST_SNAPSHOTS_ROUTE,
    ListArtistSnapshotsOptions,
    ListArtistSnapshotsResult,
} from "@repo/common";
import { get } from "@/utils/fetch";
import { isEmpty } from "lodash";

const useListArtistSnapshots = (options: ListArtistSnapshotsOptions) => {
    const { ids } = options;
    return useQuery({
        enabled: !isEmpty(ids),
        placeholderData: keepPreviousData,
        queryFn: async () => {
            const { data, error } = (await get(
                `${LIST_ARTIST_SNAPSHOTS_ROUTE}?ids=${ids.join(",")}`
            )) as ListArtistSnapshotsResult;
            if (error !== null) {
                throw error;
            }

            return data;
        },
        queryKey: ["list-artist-snapshots", ...ids],
    });
};

export { useListArtistSnapshots };
