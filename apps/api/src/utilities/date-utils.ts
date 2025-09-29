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

export { normalizeTimestamp, parseDate };
