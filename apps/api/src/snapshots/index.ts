import { loadPocketBaseConfig, SNAPSHOTS_USE_POCKETBASE } from "../config";
import { PocketBaseClient } from "../storage/pocketbase";
import { ArtistSnapshotStore } from "./artist-snapshot-store";

const artistSnapshotStore = SNAPSHOTS_USE_POCKETBASE
    ? new ArtistSnapshotStore({
          client: new PocketBaseClient(loadPocketBaseConfig()),
      })
    : undefined;

export { artistSnapshotStore, ArtistSnapshotStore };
