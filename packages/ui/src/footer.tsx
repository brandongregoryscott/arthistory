import type { SetStateAction } from "react";
import { Flex, IconButton, Link, Text } from "@chakra-ui/react";
import { Moon, Sun } from "lucide-react";

type FooterProps = {
    breakpoint: "desktop" | "mobile";
    darkMode: boolean;
    lastUpdated?: string;
    onThemeChange: (darkMode: boolean | SetStateAction<boolean>) => void;
};

const Footer: React.FC<FooterProps> = ({
    breakpoint,
    darkMode,
    lastUpdated,
    onThemeChange,
}) => (
    <Flex
        align="center"
        as="footer"
        bg="bg.subtle"
        borderTopWidth="1px"
        flexWrap="wrap"
        gap="3"
        justify="space-between"
        px={{ base: "3", md: "6" }}
        py="3">
        <IconButton
            aria-label={
                darkMode ? "Switch to light theme" : "Switch to dark theme"
            }
            onClick={() => onThemeChange((value) => !value)}
            size="sm"
            variant="ghost">
            {darkMode ? <Sun /> : <Moon />}
        </IconButton>
        {lastUpdated !== undefined && (
            <Text color="fg.muted" fontSize="sm">
                {breakpoint === "mobile" ? "Updated " : "Last updated "}
                {new Date(lastUpdated).toLocaleDateString(undefined, {
                    dateStyle: breakpoint === "mobile" ? "short" : undefined,
                })}
            </Text>
        )}
        <Flex flexWrap="wrap" fontSize="sm" gap="3">
            <Link href="https://github.com/brandongregoryscott/arthistory">
                GitHub
            </Link>
            <Link href="https://ko-fi.com/bscott">Buy me a coffee</Link>
            <Link href="mailto:contact@brandonscott.me">Contact</Link>
        </Flex>
    </Flex>
);

export { Footer };
