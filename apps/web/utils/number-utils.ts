const THOUSAND = 1000;
const MILLION = 1_000_000;
const BILLION = 1_000_000_000;

const humanizeNumber = (value: number): string => {
    if (Math.abs(value) < THOUSAND) {
        return value.toString();
    }

    if (Math.abs(value) < MILLION) {
        return `${(value / THOUSAND).toFixed(3 - numberOfDigits(value / THOUSAND))}k`;
    }

    if (Math.abs(value) < BILLION) {
        return `${(value / MILLION).toFixed(3 - numberOfDigits(value / MILLION))}m`;
    }

    return `${(value / BILLION).toFixed(Math.max(3 - numberOfDigits(value / BILLION), 0))}b`;
};

const numberOfDigits = (value: number): number =>
    Math.floor(Math.log10(Math.abs(value))) + 1;

export { humanizeNumber };
