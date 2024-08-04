import { GET_LATEST_META_ROUTE, GetLatestMetaResult } from "@repo/common";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/utils/fetch";

const useGetLatestMeta = () => {
    return useQuery({
        queryFn: async () => {
            const { data, error } = (await get(
                GET_LATEST_META_ROUTE
            )) as GetLatestMetaResult;
            if (error !== null) {
                throw error;
            }

            return data;
        },
        queryKey: ["get-latest-meta"],
    });
};

export { useGetLatestMeta };
