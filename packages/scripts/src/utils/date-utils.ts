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

/**
 * Returns the current hour as a 0-based index, i.e. 23 == 11 PM, 0 = 1 AM
 */
const getCurrentHourIndex = (): number => new Date().getHours();

export { getCurrentHourIndex, getRoundedTimestamp, toUnixTimestampInSeconds };
