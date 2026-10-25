import type { ReactNode } from "react";
import {
    Box,
    Combobox,
    createListCollection,
    Flex,
    Text,
} from "@chakra-ui/react";
import type { RemovableBadgeProps } from "./removable-badge";
import { RemovableBadge } from "./removable-badge";

type SearchResultProps = {
    children: string;
    description?: ReactNode;
    disabled?: boolean;
    onClick: () => void;
    selected?: boolean;
};

type SearchSelectProps<TSearchResult extends { id: string }, TValue> = {
    getRemovableBadgeProps: (value: TValue) => RemovableBadgeProps;
    getSearchResultProps: (result: TSearchResult) => SearchResultProps;
    onChange: (value: string) => void;
    results: TSearchResult[] | undefined;
    selectedIds: string[];
    selectedValueMap: Record<string, TValue>;
    value: string;
};

const SearchSelect = <TSearchResult extends { id: string }, TValue>({
    getRemovableBadgeProps,
    getSearchResultProps,
    onChange,
    results,
    selectedIds,
    selectedValueMap,
    value,
}: SearchSelectProps<TSearchResult, TValue>) => {
    const items = (results ?? []).map((result) => ({
        id: result.id,
        ...getSearchResultProps(result),
    }));
    const collection = createListCollection({
        isItemDisabled: (item) =>
            item.disabled === true ||
            item.selected === true ||
            selectedIds.length >= 10,
        items,
        itemToString: (item) => item.children,
        itemToValue: (item) => item.id,
    });

    return (
        <>
            <Combobox.Root
                collection={collection}
                inputValue={value}
                onInputValueChange={({ inputValue }) => onChange(inputValue)}
                onSelect={({ itemValue }) =>
                    items.find((item) => item.id === itemValue)?.onClick()
                }
                openOnClick={true}
                selectionBehavior="preserve"
                value={[]}>
                <Combobox.Label>Search artists</Combobox.Label>
                <Combobox.Control>
                    <Combobox.Input placeholder="Search Spotify artists…" />
                    <Combobox.IndicatorGroup>
                        <Combobox.ClearTrigger aria-label="Clear search" />
                    </Combobox.IndicatorGroup>
                </Combobox.Control>
                <Combobox.Positioner>
                    <Combobox.Content maxH="80" zIndex="dropdown">
                        {items.length === 0 && (
                            <Text color="fg.muted" p="3">
                                No artists found
                            </Text>
                        )}
                        {items.map((item) =>
                            item.disabled === true ? (
                                <Box
                                    borderBottomWidth="1px"
                                    key={item.id}
                                    px="3"
                                    py="2">
                                    <Text fontWeight="medium">
                                        {item.children}
                                    </Text>
                                    <Box color="fg.muted" fontSize="sm">
                                        {item.description}
                                    </Box>
                                </Box>
                            ) : (
                                <Combobox.Item item={item} key={item.id}>
                                    <Box>
                                        <Combobox.ItemText>
                                            {item.children}
                                            {item.selected === true
                                                ? " (selected)"
                                                : ""}
                                        </Combobox.ItemText>
                                        <Text color="fg.muted" fontSize="sm">
                                            {item.description}
                                        </Text>
                                    </Box>
                                </Combobox.Item>
                            )
                        )}
                    </Combobox.Content>
                </Combobox.Positioner>
            </Combobox.Root>
            <Flex aria-label="Selected artists" flexWrap="wrap" gap="2">
                {selectedIds.map((id) => {
                    const selected = selectedValueMap[id];
                    return selected === undefined ? null : (
                        <RemovableBadge
                            key={id}
                            {...getRemovableBadgeProps(selected)}
                        />
                    );
                })}
            </Flex>
            {selectedIds.length >= 10 && (
                <Text color="fg.muted" fontSize="sm">
                    You can compare up to 10 artists. Remove an artist to add
                    another.
                </Text>
            )}
        </>
    );
};

export type { SearchResultProps, SearchSelectProps };
export { SearchSelect };
