interface Artist {
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
}

interface ArtistRow {
    id: string;
    name: string;
}

interface ArtistSnapshotRow {
    followers: number;
    id: string;
    popularity: number;
    timestamp: number;
}

interface ArtistSnapshot {
    followers: number;
    id: string;
    popularity: number;
    timestamp: string;
}

interface ArtistWithTrackingStatus extends Artist {
    isTracked: boolean;
}

export type {
    Artist,
    ArtistRow,
    ArtistSnapshot,
    ArtistSnapshotRow,
    ArtistWithTrackingStatus,
};
