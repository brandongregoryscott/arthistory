/**
 * Returns the current unix timestamp rounded down to the nearest 15 minute interval
 */
const roundedCurrentTimestamp = (): number => {
    const now = new Date();
    const minutes = now.getMinutes();
    const minutesToSubtract = minutes % 15;

    now.setMinutes(minutes - minutesToSubtract);
    now.setSeconds(0);
    now.setMilliseconds(0);

    return now.valueOf();
};

export { roundedCurrentTimestamp };
