import type { SnapshotResolution } from "@repo/common";
import { artistSnapshotStore } from "./index";

type ListArtistSnapshotsOptions = {
    ids: string[];
    resolution?: SnapshotResolution;
};

class ArtistSnapshotService {
    static async list(options: ListArtistSnapshotsOptions) {
        return artistSnapshotStore.list(options);
    }
}

export { ArtistSnapshotService };
