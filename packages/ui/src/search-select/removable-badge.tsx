import type { PropsWithChildren } from "react";
import { Tag } from "@chakra-ui/react";
import { isString } from "lodash";

type RemovableBadgeProps = {
    onRemove: () => void;
} & PropsWithChildren;

const RemovableBadge: React.FC<RemovableBadgeProps> = (props) => {
    const { children, onRemove } = props;
    return (
        <Tag.Root colorPalette="teal" size="lg">
            <Tag.Label>{children}</Tag.Label>
            <Tag.EndElement>
                <Tag.CloseTrigger
                    aria-label={
                        isString(children)
                            ? `Remove ${children}`
                            : "Remove artist"
                    }
                    onClick={onRemove}
                />
            </Tag.EndElement>
        </Tag.Root>
    );
};

export type { RemovableBadgeProps };
export { RemovableBadge };
