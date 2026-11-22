import { afterEach, describe, expect, it, vi } from "vitest";
import { createImportProgressReporter } from "./import-progress";

afterEach(() => vi.useRealTimers());

describe("createImportProgressReporter", () => {
    it("throttles record updates but emits phase transitions and completion immediately", () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const onProgress = vi.fn();
        const report = createImportProgressReporter(onProgress);
        report({ phase: "validating", processed: 0, total: 100 });
        vi.setSystemTime(4000);
        report({ phase: "validating", processed: 40, total: 100 });
        expect(onProgress).toHaveBeenCalledTimes(1);
        vi.setSystemTime(5000);
        report({ phase: "validating", processed: 50, total: 100 });
        expect(onProgress).toHaveBeenLastCalledWith(
            expect.objectContaining({
                elapsedSeconds: 5,
                percent: 50,
                recordsPerSecond: 10,
            })
        );
        report({ phase: "validating", processed: 100, total: 100 }, true);
        report({ phase: "connecting", processed: 0, total: 100 });
        report({ phase: "importing", processed: 0, total: 100 });
        vi.setSystemTime(10000);
        report({
            batch: 2,
            created: 20,
            phase: "importing",
            processed: 50,
            skipped: 30,
            total: 100,
        });
        expect(onProgress).toHaveBeenLastCalledWith(
            expect.objectContaining({
                batch: 2,
                created: 20,
                percent: 50,
                recordsPerSecond: 10,
                skipped: 30,
            })
        );
        report({ phase: "complete", processed: 100, total: 100 });
        expect(onProgress).toHaveBeenLastCalledWith(
            expect.objectContaining({
                percent: 100,
                phase: "complete",
                recordsPerSecond: 20,
            })
        );
        expect(onProgress).toHaveBeenCalledTimes(7);
    });

    it("reports empty imports without NaN or Infinity", () => {
        const onProgress = vi.fn();
        createImportProgressReporter(onProgress)({
            phase: "complete",
            processed: 0,
            total: 0,
        });
        expect(onProgress).toHaveBeenCalledWith(
            expect.objectContaining({ percent: 100, recordsPerSecond: 0 })
        );
        expect(() =>
            createImportProgressReporter()({
                phase: "validating",
                processed: 0,
                total: 1,
            })
        ).not.toThrow();
    });

    it("excludes the resumed prefix from throughput", () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const onProgress = vi.fn();
        const report = createImportProgressReporter(onProgress);
        report({
            phase: "importing",
            processed: 1000,
            resumed: 1000,
            total: 2000,
        });
        vi.setSystemTime(10000);
        report({
            phase: "importing",
            processed: 1100,
            resumed: 1000,
            total: 2000,
        });
        expect(onProgress).toHaveBeenLastCalledWith(
            expect.objectContaining({ percent: 55, recordsPerSecond: 10 })
        );
    });
});
