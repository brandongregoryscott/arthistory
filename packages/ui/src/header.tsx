import Box from "@leafygreen-ui/box";
import { css, cx } from "@leafygreen-ui/emotion";
import { SetStateAction } from "react";
import IconButton from "@leafygreen-ui/icon-button";
import Icon from "@leafygreen-ui/icon";
import { H3 } from "@leafygreen-ui/typography";

interface HeaderProps {
    darkMode: boolean;
    breakpoint: "mobile" | "desktop";
    onThemeChange: (darkTheme: boolean | SetStateAction<boolean>) => void;
}

const Header: React.FC<HeaderProps> = (props) => {
    const { darkMode, onThemeChange, breakpoint } = props;
    const headerContainerClassName = cx(
        breakpoint !== "mobile" && css({ marginLeft: "50%" })
    );
    return (
        <Box
            className={css({
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                marginLeft: "auto",
                justifyContent: "space-between",
                columnGap: 16,
                width: "100%",
            })}>
            <Box className={headerContainerClassName}>
                <H3
                    className={css({
                        fontSize: "48px",
                        lineHeight: "64px",
                    })}>
                    arthistory
                </H3>
            </Box>
            <IconButton
                aria-label="Theme switcher"
                onClick={() => onThemeChange((darkTheme) => !darkTheme)}>
                <Icon glyph={darkMode ? "Sun" : "Moon"} />
            </IconButton>
        </Box>
    );
};

export { Header };
