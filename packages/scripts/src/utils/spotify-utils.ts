import { Artist, SpotifyApi } from "@spotify/web-api-ts-sdk";
import { getCurrentHourIndex } from "./date-utils";
import { CLIENT_IDS, CLIENT_SECRETS } from "../config";

interface BuildSpotifyClientOptions {
    clientId: string;
    clientSecret: string;
}

const buildSpotifyClient = (options: BuildSpotifyClientOptions) =>
    SpotifyApi.withClientCredentials(options.clientId, options.clientSecret);

const buildCurrentSpotifyClient = () => {
    const currentHourIndex = getCurrentHourIndex();
    // We have 8 client secrets available to use, so spread them across 24 hours for maximum usage
    const secretIndex = currentHourIndex % 8;
    const clientId = CLIENT_IDS[secretIndex];
    const clientSecret = CLIENT_SECRETS[secretIndex];

    if (clientId === undefined || clientSecret === undefined) {
        throw new Error("Client id or secret was unexpectedly undefined");
    }

    return buildSpotifyClient({ clientId, clientSecret });
};

export { buildSpotifyClient, buildCurrentSpotifyClient };
