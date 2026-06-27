import type {
    ListArtistSnapshotsOptions,
    ListArtistSnapshotsResult,
} from "@repo/common";
import { LIST_ARTIST_SNAPSHOTS_ROUTE } from "@repo/common";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isEmpty } from "lodash";
import { get } from "@/utils/fetch";

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
