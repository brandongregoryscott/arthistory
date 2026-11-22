import { describe, expect, it } from "vitest";
import { validateSongSnapshot } from "../../../../pocketbase/hooks/validation.js";

const record = (listenCount: number, weekStart = "2026-11-16T00:00:00Z") => ({
    getFloat: () => listenCount,
    getString: (field: string) =>
        field === "weekStart" ? weekStart : "2026-11-18T12:00:00Z",
});

describe("song snapshot validation", () => {
    it.each([-1, 0, 123, Number.MAX_SAFE_INTEGER])(
        "accepts a valid count %s",
        (count) => {
            expect(() => validateSongSnapshot(record(count))).not.toThrow();
        }
    );
    it.each([-2, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
        "rejects an invalid count %s",
        (count) => {
            expect(() => validateSongSnapshot(record(count))).toThrow(
                "listen count"
            );
        }
    );
    it.each(["2026-11-17T00:00:00Z", "2026-11-09T00:00:00Z", "invalid"])(
        "rejects a week that does not match the capture: %s",
        (week) => {
            expect(() => validateSongSnapshot(record(1, week))).toThrow(
                "Monday"
            );
        }
    );
});
