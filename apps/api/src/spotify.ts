import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { CLIENT_ID, CLIENT_SECRET } from "./config";

const SpotifyClient = SpotifyApi.withClientCredentials(
    CLIENT_ID,
    CLIENT_SECRET
);

export { SpotifyClient };
