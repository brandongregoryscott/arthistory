import type { RequestArtistOptions, RequestArtistResult } from "@repo/common";
import { REQUEST_ARTIST_ROUTE } from "@repo/common";
import { useMutation } from "@tanstack/react-query";
import { post } from "@/utils/fetch";

const useRequestArtist = () => {
    return useMutation({
        mutationFn: async (options: RequestArtistOptions) => {
            const { id } = options;
            const { error } = (await post(
                REQUEST_ARTIST_ROUTE.replace(":id", id),
                {}
            )) as RequestArtistResult;
            if (error !== null) {
                throw error;
            }

            return true;
        },
    });
};

export { useRequestArtist };
