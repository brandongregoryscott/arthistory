import { buildCurrentSpotifyClient } from "../utils/spotify-utils";

const sync = async () => {
    const spotify = buildCurrentSpotifyClient();
    const artists = await spotify.artists.get([
        "6lcwlkAjBPSKnFBZjjZFJs",
        "5AyEXCtu3xnnsTGCo4RVZh",
    ]);
};

export { sync };
