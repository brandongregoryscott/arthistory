import type { PreparedSnapshot } from "./prepared-records";

type ImportCursor = {
    anchor?: PreparedSnapshot;
    artists: number;
    artistsOffset: number;
    previousArtist: string;
    snapshots: number;
    snapshotsOffset: number;
};

const initialImportCursor = (): ImportCursor => ({
    artists: 0,
    artistsOffset: 0,
    previousArtist: "",
    snapshots: 0,
    snapshotsOffset: 0,
});

export { initialImportCursor };
export type { ImportCursor };
