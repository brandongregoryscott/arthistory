import type {
    SearchArtistByNameResult,
    SearchArtistsByNameOptions,
} from "@repo/common";
import { SEARCH_ARTISTS_BY_NAME_ROUTE } from "@repo/common";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isEmpty } from "lodash";
import { get } from "@/utils/fetch";

const useSearchArtistsByName = (options: SearchArtistsByNameOptions) => {
    const { name } = options;
    return useQuery({
        enabled: !isEmpty(name),
        placeholderData: keepPreviousData,
        queryFn: async () => {
            const { data, error } = (await get(
                `${SEARCH_ARTISTS_BY_NAME_ROUTE}?name=${name}`
            )) as SearchArtistByNameResult;

            if (error !== null) {
                throw error;
            }

            return data;
        },
        queryKey: ["search-artists-by-name", name],
    });
};

export { useSearchArtistsByName };
