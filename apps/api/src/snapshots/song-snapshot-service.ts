import { loadPocketBaseConfig } from "../config";
import { PocketBaseClient } from "../storage/pocketbase";
import { SongSnapshotStore } from "./song-snapshot-store";

const songSnapshotStore = new SongSnapshotStore(
    new PocketBaseClient(loadPocketBaseConfig())
);

class SongSnapshotService {
    static async list(id: string) {
        return songSnapshotStore.list(id);
    }
}

export { SongSnapshotService };
