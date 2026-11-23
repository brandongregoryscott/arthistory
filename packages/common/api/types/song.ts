/** Stable song identity and display metadata from a public artist page. */
type Song = {
    name: string;
    spotifyId: string;
};

/** Cumulative listens observed on the artist page; null means unavailable. */
type SongSnapshot = {
    listenCount: null | number;
} & Song;

export type { Song, SongSnapshot };
