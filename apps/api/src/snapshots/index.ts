import { loadPocketBaseConfig } from "../config";
import { PocketBaseClient } from "../storage/pocketbase";
import { ArtistSnapshotStore } from "./artist-snapshot-store";

const artistSnapshotStore = new ArtistSnapshotStore({
    client: new PocketBaseClient(loadPocketBaseConfig()),
});

export { artistSnapshotStore, ArtistSnapshotStore };
