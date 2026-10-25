import { Flex, Heading } from "@chakra-ui/react";

const Header: React.FC = () => (
    <Flex as="header" justify="center" py="2">
        <Heading
            as="h1"
            fontSize={{ base: "4xl", md: "5xl" }}
            letterSpacing="tight">
            arthistory
        </Heading>
    </Flex>
);

export { Header };
