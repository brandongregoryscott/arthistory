import { fromUnixTime, isValid, parseISO, startOfDay } from "date-fns";

const parseDate = (value: string | undefined): Date | undefined => {
    if (value === undefined || !isValid(parseISO(value))) {
        return undefined;
    }

    return parseISO(value);
};

const normalizeTimestamp = (unixTimestampInSeconds: number): string => {
    return startOfDay(fromUnixTime(unixTimestampInSeconds)).toISOString();
};

const formatTimeSpanFromMilliseconds = (milliseconds: number) => {
    const date = new Date(milliseconds);
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

const pad = (num: number) => num.toString().padStart(2, "0");

export { formatTimeSpanFromMilliseconds, normalizeTimestamp, parseDate };
