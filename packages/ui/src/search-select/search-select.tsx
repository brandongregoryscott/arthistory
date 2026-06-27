import type { SearchResultProps } from "@leafygreen-ui/search-input";
import Box from "@leafygreen-ui/box";
import { css } from "@leafygreen-ui/emotion";
import { SearchInput, SearchResult } from "@leafygreen-ui/search-input";
import type { RemovableBadgeProps } from "./removable-badge";
import { RemovableBadge } from "./removable-badge";

type SearchSelectProps<TSearchResult extends { id: string }, TValue> = {
    getRemovableBadgeProps: (value: TValue) => RemovableBadgeProps;
    getSearchResultProps: (result: TSearchResult) => SearchResultProps;
    onChange: (value: string) => void;
    results: TSearchResult[] | undefined;
    selectedIds: string[];
    /**
     * Key-value map where the key is the id of a selected value to render a removable badge
     */
    selectedValueMap: Record<string, TValue>;
    value: string;
};

const SearchSelect = <TSearchResult extends { id: string }, TValue>(
    props: SearchSelectProps<TSearchResult, TValue>
) => {
    const {
        getRemovableBadgeProps,
        getSearchResultProps,
        onChange,
        results,
        selectedIds,
        selectedValueMap,
        value,
    } = props;
    return (
        <>
            <SearchInput
                aria-label="Search"
                onChange={(event) => onChange(event.target.value)}
                value={value}>
                {results?.map((result) => {
                    const props = getSearchResultProps(result);
                    return <SearchResult key={result.id} {...props} />;
                })}
            </SearchInput>
            <Box
                className={css({
                    columnGap: 8,
                    display: "flex",
                    flexDirection: "row",
                    flexWrap: "wrap",
                    rowGap: 8,
                })}>
                {selectedIds.map((id) => {
                    const value = selectedValueMap[id];
                    if (value === undefined) {
                        return;
                    }

                    const props = getRemovableBadgeProps(value);
                    return <RemovableBadge key={id} {...props} />;
                })}
            </Box>
        </>
    );
};

export type { SearchResultProps, SearchSelectProps };
export { SearchSelect };
