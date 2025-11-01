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

    return `${pad(hours)}h:${pad(minutes)}h:${pad(seconds)}s`;
};

const pad = (num: number) => num.toString().padStart(2, "0");

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
