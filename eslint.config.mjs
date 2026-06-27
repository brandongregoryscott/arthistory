import { defineConfig } from "eslint/config";
import tsEslint from "typescript-eslint";
import collationPlugin from "eslint-plugin-collation";
import importPlugin from "eslint-plugin-import";
import stylisticPlugin from "@stylistic/eslint-plugin";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import perfectionistPlugin from "eslint-plugin-perfectionist";
import packageJsonPlugin from "eslint-plugin-package-json";
import * as parserJsonc from "jsonc-eslint-parser";

const TYPESCRIPT_FILES = ["**/*.{ts,tsx}"];

const baseTypeScriptConfig = defineConfig([
    {
        rules: {
            curly: ["error", "all"],
            eqeqeq: [
                "error",
                "always",
                {
                    null: "ignore",
                },
            ],
            "no-console": "error",
            "no-useless-rename": "error",
            "no-var": "error",
            "prefer-destructuring": [
                "error",
                {
                    array: true,
                    object: true,
                },
            ],
        },
    },
    {
        files: TYPESCRIPT_FILES,
        plugins: {
            "@typescript-eslint": tsEslint.plugin,
        },
        languageOptions: {
            parser: tsEslint.parser,
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
                projectService: true,
            },
        },
        rules: {
            "@typescript-eslint/consistent-type-definitions": ["error", "type"],
            "@typescript-eslint/consistent-type-exports": "error",
            "@typescript-eslint/consistent-type-imports": "error",
            "@typescript-eslint/explicit-member-accessibility": [
                "error",
                {
                    accessibility: "no-public",
                },
            ],
            "@typescript-eslint/no-non-null-assertion": "error",
            "@typescript-eslint/strict-boolean-expressions": [
                "error",
                {
                    allowNullableObject: false,
                    allowNumber: false,
                    allowString: false,
                },
            ],
        },
    },
    {
        files: TYPESCRIPT_FILES,
        plugins: {
            collation: collationPlugin,
        },
        rules: {
            "collation/group-exports": "error",
            "collation/no-default-export": "error",
            "collation/no-inline-export": "error",
            "collation/no-inline-object-type": "error",
            "collation/prefer-native-private-syntax": "error",
            "collation/sort-dependency-list": "error",
            "collation/sort-exports": "error",
        },
    },
    {
        files: TYPESCRIPT_FILES,
        plugins: {
            "@stylistic": stylisticPlugin,
        },
        rules: {
            "@stylistic/padding-line-between-statements": [
                "error",
                {
                    blankLine: "always",
                    next: "export",
                    prev: "*",
                },
                {
                    blankLine: "never",
                    next: "export",
                    prev: "export",
                },
                {
                    blankLine: "always",
                    next: "*",
                    prev: "import",
                },
                {
                    blankLine: "never",
                    next: "import",
                    prev: "import",
                },
            ],
        },
    },
    {
        files: TYPESCRIPT_FILES,
        plugins: {
            perfectionist: perfectionistPlugin,
        },
        rules: {
            "perfectionist/sort-classes": [
                "error",
                {
                    fallbackSort: { type: "unsorted" },
                    groups: [
                        "readonly-property",
                        "property",
                        "private-property",
                        "constructor",
                        "abstract-method",
                        "static-method",
                        ["get-method", "set-method"],
                        "method",
                        "private-static-method",
                        "private-method",
                    ],
                    ignoreCase: true,
                    newlinesBetween: "ignore",
                    newlinesInside: "ignore",
                    order: "asc",
                    partitionByComment: false,
                    partitionByNewLine: false,
                    specialCharacters: "keep",
                    type: "alphabetical",
                },
            ],
            "perfectionist/sort-exports": "error",
            "perfectionist/sort-imports": ["error", { newlinesBetween: 0 }],
            "perfectionist/sort-interfaces": "error",
            "perfectionist/sort-intersection-types": "error",
            "perfectionist/sort-object-types": "error",
            "perfectionist/sort-objects": "error",
            "perfectionist/sort-switch-case": "error",
            "perfectionist/sort-union-types": "error",
        },
    },
    {
        files: TYPESCRIPT_FILES,
        plugins: {
            import: importPlugin,
        },
        rules: {
            "import/consistent-type-specifier-style": [
                "error",
                "prefer-top-level",
            ],
            "import/no-duplicates": "error",
        },
    },
    {
        files: ["**/package.json"],
        plugins: {
            "package-json": packageJsonPlugin,
        },
        languageOptions: {
            parser: parserJsonc,
        },
        extends: [packageJsonPlugin.configs.recommended],
    },
]);

const reactConfig = defineConfig([
    {
        files: ["apps/web/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
        plugins: {
            react: reactPlugin,
            "react-hooks": reactHooksPlugin,
        },
        settings: {
            react: {
                version: "detect",
            },
        },
        extends: [
            reactPlugin.configs.flat.recommended,
            reactHooksPlugin.configs.flat.recommended,
        ],
        rules: {
            "react-hooks/exhaustive-deps": "error",
            "react-hooks/rules-of-hooks": "error",
            "react/display-name": "error",
            "react/hook-use-state": "error",
            "react/jsx-boolean-value": ["error", "always"],
            "react/jsx-handler-names": "error",
            "react/jsx-no-constructed-context-values": "error",
            "react/jsx-sort-props": "error",
            "react/self-closing-comp": "error",
            "react/react-in-jsx-scope": "off",
            "react/prop-types": "off",
            "react/no-unescaped-entities": "off",
        },
    },
]);

const ignores = defineConfig([
    { ignores: ["**/dist/**", "eslint.config.mjs", "**/.next/**", "**/build/**", "**/node_modules/**", "**/out/**"] },
]);

export default [
    ...ignores,
    ...baseTypeScriptConfig,
    // CLI scripts use console for output
    {
        files: ["packages/scripts/**/*.ts"],
        rules: {
            "no-console": "off",
        },
    },
    ...reactConfig,
];
