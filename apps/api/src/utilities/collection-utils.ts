const arrify = <T>(value: T | T[]): T[] =>
    Array.isArray(value) ? value : [value];

export { arrify };
