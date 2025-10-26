import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { getCurrentHourIndex } from "./date-utils";
import { CLIENT_IDS, CLIENT_SECRETS } from "../config";

interface BuildSpotifyClientOptions {
    clientId: string;
    clientSecret: string;
}

const buildSpotifyClient = (options: BuildSpotifyClientOptions) =>
    SpotifyApi.withClientCredentials(options.clientId, options.clientSecret);

const buildSpotifyClientBySecretPair = (index: number) => {
    const clientId = CLIENT_IDS[index];
    const clientSecret = CLIENT_SECRETS[index];
    if (clientId === undefined || clientSecret === undefined) {
        throw new Error("Client id or secret was unexpectedly undefined");
    }

    return buildSpotifyClient({ clientId, clientSecret });
};

/**
 * Returns a Spotify client with the current hour's allocated client id/secret pair
 */
const buildCurrentSpotifyClient = () => {
    const currentHourIndex = getCurrentHourIndex();
    // We have 8 client secrets available to use, so spread them across 24 hours for maximum usage
    const secretIndex = currentHourIndex % 8;
    return buildSpotifyClientBySecretPair(secretIndex);
};

/**
 * Returns a Spotify client with a random client id/secret pair
 */
const buildRandomSpotifyClient = () => {
    const max = CLIENT_IDS.length - 1;
    const index = randomInteger({ min: 0, max });

    return buildSpotifyClientBySecretPair(index);
};

const isRateLimitError = (error: unknown): boolean =>
    error instanceof Error &&
    error.message === "The app has exceeded its rate limits.";

interface RandomIntegerOptions {
    max: number;
    min: number;
}

const randomInteger = (options: RandomIntegerOptions): number => {
    const { min, max } = options;
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

export {
    buildCurrentSpotifyClient,
    buildRandomSpotifyClient,
    buildSpotifyClient,
    isRateLimitError,
};
