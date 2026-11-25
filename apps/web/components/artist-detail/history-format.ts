const date = (value: string) =>
    new Date(value).toLocaleDateString(undefined, { timeZone: "UTC" });

const number = (value: null | number | undefined) =>
    value == null ? "Unavailable" : value.toLocaleString();

export { date, number };
