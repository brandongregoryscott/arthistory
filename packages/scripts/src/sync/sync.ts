import { ARTIST_ID_ALEX_G, ARTIST_ID_DUSTER } from "../constants/spotify";
import { createArtistSnapshotsTable, openSnapshotDb } from "../utils/db-utils";
import { buildCurrentSpotifyClient } from "../utils/spotify-utils";

const sync = async () => {
    const spotify = buildCurrentSpotifyClient();
    const db = await openSnapshotDb();
    await createArtistSnapshotsTable(db);

    const artists = await spotify.artists.get([
        ARTIST_ID_ALEX_G,
        ARTIST_ID_DUSTER,
    ]);
};

export { sync };
