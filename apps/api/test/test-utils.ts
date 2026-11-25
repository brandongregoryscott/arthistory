import type { Response } from "express";
import { vi } from "vitest";

const createResponse = () => {
    const json = vi.fn();
    const status = vi.fn();
    const value = { json, status };

    json.mockReturnValue(value);
    status.mockReturnValue(value);

    return { json, status, value: value as unknown as Response };
};

export { createResponse };
