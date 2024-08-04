module.exports = {
    root: true,
    extends: [
        "@brandongregoryscott/eslint-config",
        "@brandongregoryscott/eslint-config/typescript",
    ],
    parserOptions: {
        tsconfigRootDir: __dirname,
        project: "tsconfig.json",
    },
};
