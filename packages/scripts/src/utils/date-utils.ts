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

    return now.valueOf();
};

/**
 * Returns the current hour as a 0-based index, i.e. 23 == 11 AM, 0 = 1 AM
 */
const getCurrentHourIndex = (): number => new Date().getHours();

export { getRoundedTimestamp, getCurrentHourIndex };
