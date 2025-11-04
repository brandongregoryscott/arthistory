import { isEmpty } from "lodash";

/**
 * Returns the current unix timestamp rounded down to the nearest 15 minute interval
 */
const getRoundedTimestamp = (): number => {
    const now = new Date();
    const minutes = now.getMinutes();
    const minutesToSubtract = minutes % 15;

    now.setMinutes(minutes - minutesToSubtract);
    now.setSeconds(0);
    now.setMilliseconds(0);

    return toUnixTimestampInSeconds(now.valueOf());
};

const toUnixTimestampInSeconds = (timestamp: number): number => {
    const timestampInSeconds =
        timestamp.toString().length === 13
            ? Math.round(timestamp / 1000)
            : timestamp;

    return timestampInSeconds;
};

const formatTimeSpanFromMilliseconds = (milliseconds: number) => {
    const date = new Date(milliseconds);
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();

    let timeSpan = hours > 0 ? `${hours}h` : "";
    if (minutes > 0) {
        timeSpan = `${timeSpan}${minutes}m`;
    }

    if (seconds > 0) {
        timeSpan = `${timeSpan}${seconds}s`;
    }

    if (isEmpty(timeSpan)) {
        return "0s";
    }

    return timeSpan;
};

/**
 * Returns the current hour as a 0-based index, i.e. 23 == 11 PM, 0 = 1 AM
 */
const getCurrentHourIndex = (): number => new Date().getHours();

export {
    formatTimeSpanFromMilliseconds,
    getCurrentHourIndex,
    getRoundedTimestamp,
    toUnixTimestampInSeconds,
};
