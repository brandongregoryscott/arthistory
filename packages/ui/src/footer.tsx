import type { SetStateAction } from "react";
import Box from "@leafygreen-ui/box";
import { css, cx } from "@leafygreen-ui/emotion";
import Icon from "@leafygreen-ui/icon";
import IconButton from "@leafygreen-ui/icon-button";
import { color } from "@leafygreen-ui/tokens";
import { Body, Link } from "@leafygreen-ui/typography";

type FooterProps = {
    breakpoint: "desktop" | "mobile";
    darkMode: boolean;
    lastUpdated?: string;
    onThemeChange: (darkMode: boolean | SetStateAction<boolean>) => void;
};

const Footer: React.FC<FooterProps> = (props) => {
    const { breakpoint, darkMode, onThemeChange } = props;
    const flexClassName = cx(
        breakpoint === "mobile" && css({ display: "flex" })
    );

    const timestampPrefix =
        breakpoint === "mobile" ? "Updated " : "Last updated ";
    const lastUpdated =
        props.lastUpdated !== undefined
            ? new Date(props.lastUpdated).toLocaleDateString(undefined, {
                  dateStyle: breakpoint === "mobile" ? "short" : undefined,
              })
            : undefined;

    return (
        <Box
            className={css({
                alignItems: "center",
                backgroundColor: darkMode
                    ? color.dark.background.secondary.default
                    : color.light.background.secondary.default,
                bottom: 0,
                columnGap: 8,
                display: "flex",
                flexDirection: "row",
                height: 32,
                justifyContent: "space-between",
                left: 0,
                paddingLeft: 8,
                paddingRight: 8,
                position: "fixed",
                width: "100%",
            })}>
            <IconButton
                aria-label="Theme switcher"
                onClick={() => onThemeChange((darkMode) => !darkMode)}
                size="default">
                <Icon glyph={darkMode ? "Sun" : "Moon"} />
            </IconButton>
            {lastUpdated !== undefined && (
                <Body
                    className={
                        flexClassName
                    }>{`${timestampPrefix}${lastUpdated}`}</Body>
            )}
            <Box
                className={css({
                    alignItems: "center",
                    columnGap: 4,
                    display: "flex",
                    flexDirection: "row",
                })}>
                <Link
                    className={flexClassName}
                    href="https://github.com/brandongregoryscott/arthistory">
                    GitHub
                </Link>
                <Link className={flexClassName} href="https://ko-fi.com/bscott">
                    Buy me a coffee
                </Link>
                <Link href="mailto:contact@brandonscott.me">Contact</Link>
            </Box>
        </Box>
    );
};

export { Footer };
