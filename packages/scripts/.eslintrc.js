module.exports = {
    root: true,
    extends: ["@repo/eslint-config/library"],
    parserOptions: {
        ecmaFeatures: {
            jsx: true,
        },
        tsconfigRootDir: __dirname,
        project: "tsconfig.json",
    },
    rules: {},
};
