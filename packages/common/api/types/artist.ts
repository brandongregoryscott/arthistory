/**
 * Structure returned for an artist from the Spotify API
 */
type Artist = {
    external_urls: Record<string, string>;
    followers: {
        href: null;
        total: number;
    };
    genres: string[];
    id: string;
    images: Array<{ height: number; url: string; width: number }>;
    name: string;
    popularity: number;
    uri: string;
};

/**
 * Structure for the data captured on each sync for an individual artist
 */
type ArtistSnapshotRow = {
    followers: number;
    id: string;
    popularity: number;
    timestamp: number;
};

/**
 * Transfer object for returning data to the frontend
 */
type ArtistSnapshot = {
    followers: number;
    id: string;
    popularity: number;
    timestamp: string;
};

/**
 * Structure that includes a flag for whether the artist is currently being tracked/synced
 */
type ArtistWithTrackingStatus = {
    isTracked: boolean;
} & Artist;

export type {
    Artist,
    ArtistSnapshot,
    ArtistSnapshotRow,
    ArtistWithTrackingStatus,
};
