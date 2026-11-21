/**
 * Artist display metadata. Unavailable current audience metrics remain null.
 */
type Artist = {
    external_urls: Record<string, string>;
    followers: {
        href: null | string;
        total: null | number;
    };
    genres: string[];
    id: string;
    images: Array<{ height: number; url: string; width: number }>;
    name: string;
    popularity: null | number;
    uri: string;
};

/**
 * Structure for the data captured on each sync for an individual artist
 */
type ArtistSnapshotRow = {
    followers: null | number;
    id: string;
    popularity: null | number;
    timestamp: number;
};

/**
 * Transfer object for returning data to the frontend
 */
type ArtistSnapshot = {
    capturedAt?: string;
    followers: null | number;
    id: string;
    monthlyListeners?: null | number;
    popularity: null | number;
    timestamp: string;
};

/**
 * Historical availability (legacy isTracked) and optional owner-controlled collection state
 */
type ArtistWithTrackingStatus = {
    hasHistory?: boolean;
    isTracked: boolean;
    syncEnabled?: boolean;
} & Artist;

export type {
    Artist,
    ArtistSnapshot,
    ArtistSnapshotRow,
    ArtistWithTrackingStatus,
};
