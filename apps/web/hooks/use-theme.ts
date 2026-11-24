import { useEffect, useState } from "react";

const useTheme = () => {
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window === "undefined") {
            return false;
        }

        try {
            const saved = localStorage.getItem("arthistory-theme");

            if (saved !== null) {
                return saved === "dark";
            }
        } catch {
            /* Browser storage may be disabled. */
        }

        return window.matchMedia("(prefers-color-scheme: dark)").matches;
    });

    useEffect(() => {
        try {
            localStorage.setItem(
                "arthistory-theme",
                darkMode ? "dark" : "light"
            );
        } catch {
            /* Theme still works without persistent storage. */
        }
    }, [darkMode]);

    return [darkMode, setDarkMode] as const;
};

export { useTheme };
