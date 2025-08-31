import { css, cx } from "@leafygreen-ui/emotion";
import Box from "@leafygreen-ui/box";
// eslint-disable-next-line no-redeclare
import { Body, Link } from "@leafygreen-ui/typography";
import { color } from "@leafygreen-ui/tokens";
import { SetStateAction } from "react";
import IconButton from "@leafygreen-ui/icon-button";
import Icon from "@leafygreen-ui/icon";

interface FooterProps {
    lastUpdated?: string;
    darkMode: boolean;
    breakpoint: "mobile" | "desktop";
    onThemeChange: (darkMode: boolean | SetStateAction<boolean>) => void;
}

const Footer: React.FC<FooterProps> = (props) => {
    const { darkMode, breakpoint, onThemeChange } = props;
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
                position: "fixed",
                bottom: 0,
                left: 0,
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: darkMode
                    ? color.dark.background.secondary.default
                    : color.light.background.secondary.default,
                height: 32,
                paddingLeft: 8,
                paddingRight: 8,
                columnGap: 8,
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
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    columnGap: 4,
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
