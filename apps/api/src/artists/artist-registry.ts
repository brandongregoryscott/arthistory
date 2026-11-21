import type { RecordModel } from "pocketbase";
import { ClientResponseError } from "pocketbase";
import type { PocketBaseClient } from "../storage/pocketbase";
import { importId } from "../migration/prepared-records";
import { ArtistPageClient, parseSpotifyArtistId } from "./artist-page";

type RegistryOptions = {
    client: PocketBaseClient;
    pages?: Pick<ArtistPageClient, "read">;
};
type RegisteredArtist = {
    displayName: string;
    spotifyId: string;
    syncEnabled: boolean;
} & RecordModel;

class ArtistRegistry {
    readonly #client: PocketBaseClient;
    readonly #pages: Pick<ArtistPageClient, "read">;

    constructor({ client, pages = new ArtistPageClient() }: RegistryOptions) {
        this.#client = client;
        this.#pages = pages;
    }

    async add(input: string): Promise<RegisteredArtist> {
        const spotifyId = parseSpotifyArtistId(input);
        const existing = await this.#find(spotifyId);
        if (existing != null) {
            return existing;
        }
        const page = await this.#pages.read(spotifyId);
        try {
            return await this.#client.run((pb) =>
                pb.collection("artists").create<RegisteredArtist>(
                    {
                        aliases: [],
                        displayName: page.displayName,
                        id: importId(`artist:${spotifyId}`),
                        metadataSource: "spotify-public-page",
                        metadataUpdatedAt: new Date().toISOString(),
                        searchNames: [],
                        spotifyId,
                        syncEnabled: false,
                    },
                    { fields: "id,spotifyId,displayName,syncEnabled" }
                )
            );
        } catch (error) {
            if (
                error instanceof ClientResponseError &&
                error.status === 400 &&
                (error.response.data?.spotifyId?.code ===
                    "validation_not_unique" ||
                    error.response.data?.id?.code === "validation_not_unique")
            ) {
                const raced = await this.#find(spotifyId);
                if (raced != null) {
                    return raced;
                }
            }
            throw error;
        }
    }

    async #find(spotifyId: string) {
        const result = await this.#client.run((pb) =>
            pb.collection("artists").getList<RegisteredArtist>(1, 1, {
                fields: "id,spotifyId,displayName,syncEnabled",
                filter: pb.filter("spotifyId = {:spotifyId}", { spotifyId }),
                skipTotal: true,
            })
        );
        return result.items[0];
    }
}

export { ArtistRegistry };
