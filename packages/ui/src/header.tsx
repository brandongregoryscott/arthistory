import Box from "@leafygreen-ui/box";
import { css } from "@leafygreen-ui/emotion";
import { H3 } from "@leafygreen-ui/typography";

const Header: React.FC = () => {
    return (
        <Box
            className={css({
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                columnGap: 16,
                width: "100%",
            })}>
            <H3
                className={css({
                    fontSize: "48px",
                    lineHeight: "64px",
                })}>
                arthistory
            </H3>
        </Box>
    );
};

export { Header };
