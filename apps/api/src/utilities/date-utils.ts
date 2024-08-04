import { isValid, parseISO } from "date-fns";

const parseDate = (value: string | undefined): Date | undefined => {
    if (value === undefined || !isValid(parseISO(value))) {
        return undefined;
    }

    return parseISO(value);
};

export { parseDate };
