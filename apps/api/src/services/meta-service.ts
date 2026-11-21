import { artistSnapshotStore } from "../snapshots";

const MetaService = { latest: () => artistSnapshotStore.latest() };

export { MetaService };
