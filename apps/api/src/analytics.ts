import posthog from "posthog-js";
import { POSTHOG_KEY } from "./config";
import { DEFAULT_ARTIST_IDS } from "@repo/common";

posthog.init(POSTHOG_KEY);

interface ArtistRequestedProperties {
    id: string;
}

const artistRequested = (properties: ArtistRequestedProperties): void => {
    posthog.capture("Artist Requested", properties);
};

interface ArtistSelectedProperties {
    id: string;
}

const artistSelected = (properties: ArtistSelectedProperties): void => {
    const { id } = properties;
    if (DEFAULT_ARTIST_IDS.includes(id)) {
        return;
    }

    posthog.capture("Artist Selected", properties);
};

interface SearchQueryEnteredProperties {
    query: string;
    totalCount: number;
    trackedCount: number;
}

const searchQueryEntered = (properties: SearchQueryEnteredProperties): void => {
    posthog.capture("Search Query Entered", properties);
};

export { artistRequested, artistSelected, searchQueryEntered };
