import { isString } from "lodash";

const isPocketBaseRecordId = (value: unknown): value is string =>
    isString(value) && /^[a-z0-9]{15}$/.test(value);

const isSpotifyArtistId = (value: unknown): value is string =>
    isString(value) && /^[A-Za-z0-9]{22}$/.test(value);

export { isPocketBaseRecordId, isSpotifyArtistId };
