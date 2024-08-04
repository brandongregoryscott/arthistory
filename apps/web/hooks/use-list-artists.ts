import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
    LIST_ARTISTS_ROUTE,
    ListArtistsOptions,
    ListArtistsResult,
} from "@repo/common";
import { get } from "@/utils/fetch";
import { isEmpty } from "lodash";

const useListArtists = (options: ListArtistsOptions) => {
    const { ids } = options;
    return useQuery({
        enabled: !isEmpty(ids),
        placeholderData: keepPreviousData,
        queryFn: async () => {
            const { data, error } = (await get(
                `${LIST_ARTISTS_ROUTE}?ids=${ids.join(",")}`
            )) as ListArtistsResult;
            if (error !== null) {
                throw error;
            }

            return data;
        },
        queryKey: ["list-artists", ...ids],
    });
};

export { useListArtists };
