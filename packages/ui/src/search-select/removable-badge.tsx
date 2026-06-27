import type { PropsWithChildren } from "react";
import Badge from "@leafygreen-ui/badge";
import Icon from "@leafygreen-ui/icon";
import IconButton from "@leafygreen-ui/icon-button";

type RemovableBadgeProps = {
    onRemove: () => void;
} & PropsWithChildren;

const RemovableBadge: React.FC<RemovableBadgeProps> = (props) => {
    const { children, onRemove } = props;
    return (
        <Badge>
            {children}
            <IconButton aria-label="Remove" onClick={onRemove}>
                <Icon glyph="X" />
            </IconButton>
        </Badge>
    );
};

export type { RemovableBadgeProps };
export { RemovableBadge };
