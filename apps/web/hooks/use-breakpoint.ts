import { createBreakpoint } from "react-use";

const BREAKPOINTS = {
    mobile: 576,
    desktop: 577,
};

type BreakpointName = keyof typeof BREAKPOINTS;

const useBreakpoint = createBreakpoint(BREAKPOINTS) as () => BreakpointName;

export type { BreakpointName };
export { useBreakpoint };
