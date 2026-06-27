import { library } from "@repo/eslint-config";

export default [
    { ignores: ["apps/**", "packages/**"] },
    ...library(import.meta.dirname),
];
