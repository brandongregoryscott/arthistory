import { createBreakpoint } from "react-use";

const BREAKPOINTS = {
    desktop: 577,
    mobile: 576,
};

type BreakpointName = keyof typeof BREAKPOINTS;

const useBreakpoint = createBreakpoint(BREAKPOINTS) as () => BreakpointName;

export type { BreakpointName };
export { useBreakpoint };
