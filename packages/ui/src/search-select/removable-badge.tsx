import { PropsWithChildren } from "react";
import IconButton from "@leafygreen-ui/icon-button";
import Icon from "@leafygreen-ui/icon";
import Badge from "@leafygreen-ui/badge";

interface RemovableBadgeProps extends PropsWithChildren {
    onRemove: () => void;
}

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
