const formatDate = (value: string) =>
    new Date(value).toLocaleDateString(undefined, { timeZone: "UTC" });

const formatNumber = (value: null | number | undefined) =>
    value == null ? "Unavailable" : value.toLocaleString();

export { formatDate, formatNumber };
