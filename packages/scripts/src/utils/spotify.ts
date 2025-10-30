import type { Artist } from "@spotify/web-api-ts-sdk";
import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { getCurrentHourIndex } from "./date-utils";
import { CLIENT_IDS, CLIENT_SECRETS } from "../config";
import { serializeError } from "serialize-error";
import { logger } from "./logger";
import { sleep } from "./core-utils";

interface SpotifyClientOptions {
    clientId: string;
    clientSecret: string;
    /**
     * Maximum number of attempts to retry a request before giving up.
     */
    maxRetryAttempts?: number;
}

class SpotifyClient {
    public readonly clientId: string;
    public readonly clientSecret: string;
    public readonly maxRetryAttempts: number;
    private client: SpotifyApi;

    constructor(options: SpotifyClientOptions) {
        const { clientId, clientSecret, maxRetryAttempts = 15 } = options;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.maxRetryAttempts = maxRetryAttempts;
        this.client = SpotifyApi.withClientCredentials(clientId, clientSecret);
    }

    public static buildBySecretPair(index: number): SpotifyClient {
        return new SpotifyClient(getSecretPairByIndex(index));
    }

    /**
     * Returns a Spotify client with the current hour's allocated client id/secret pair
     */
    public static buildByCurrentPair(): SpotifyClient {
        return new SpotifyClient(getCurrentSecretPair());
    }

    /**
     * Returns a Spotify client with a random client id/secret pair
     */
    public static buildByRandomPair(): SpotifyClient {
        const max = CLIENT_IDS.length - 1;
        const index = randomInteger({ min: 0, max });
        return SpotifyClient.buildBySecretPair(index);
    }

    public async getArtists(ids: string[]): Promise<Artist[]> {
        return this._getArtists(ids);
    }

    private async _getArtists(
        ids: string[],
        attempt: number = 1
    ): Promise<Artist[]> {
        try {
            const artists = await this.client.artists.get(ids);
            return artists;
        } catch (error) {
            const isCurrentHourSecretPair =
                getCurrentSecretPair().clientId === this.clientId;

            if (attempt < this.maxRetryAttempts) {
                logger.error(
                    {
                        error: serializeError(error),
                        attempt,
                        clientSecret: this.clientSecret,
                        clientId: this.clientId,
                        isCurrentHourSecretPair,
                        ids,
                    },
                    "Attempting to retrieve artists again"
                );
                const secondsToSleep = Math.pow(2, attempt);
                await sleep(secondsToSleep * 1000);
                return this._getArtists(ids, attempt + 1);
            }

            logger.error(
                {
                    error: serializeError(error),
                    attempt,
                    clientSecret: this.clientSecret,
                    clientId: this.clientId,
                    isCurrentHourSecretPair,
                    ids,
                },
                "Failed to retrieve artist after max attempts, returning empty array"
            );

            return [];
        }
    }
}

const getCurrentSecretPair = () => {
    const currentHourIndex = getCurrentHourIndex();
    // We have 8 client secrets available to use, so spread them across 24 hours for maximum usage
    const secretIndex = currentHourIndex % 8;
    return getSecretPairByIndex(secretIndex);
};

const getSecretPairByIndex = (
    index: number
): Pick<SpotifyClientOptions, "clientId" | "clientSecret"> => {
    const clientId = CLIENT_IDS[index];
    const clientSecret = CLIENT_SECRETS[index];
    if (clientId === undefined || clientSecret === undefined) {
        throw new Error("Client id or secret was unexpectedly undefined");
    }

    return { clientId, clientSecret };
};

interface RandomIntegerOptions {
    max: number;
    min: number;
}

const randomInteger = (options: RandomIntegerOptions): number => {
    const { min, max } = options;
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

export { SpotifyClient };
