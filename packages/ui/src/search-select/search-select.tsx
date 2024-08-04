import {
    SearchInput,
    SearchResult,
    SearchResultProps,
} from "@leafygreen-ui/search-input";
import { css } from "@leafygreen-ui/emotion";
import Box from "@leafygreen-ui/box";
import { RemovableBadge, RemovableBadgeProps } from "./removable-badge";

interface SearchSelectProps<TSearchResult extends { id: string }, TValue> {
    /**
     * Key-value map where the key is the id of a selected value to render a removable badge
     */
    selectedValueMap: Record<string, TValue>;
    selectedIds: string[];
    value: string;
    onChange: (value: string) => void;
    results: TSearchResult[] | undefined;
    getSearchResultProps: (result: TSearchResult) => SearchResultProps;
    getRemovableBadgeProps: (value: TValue) => RemovableBadgeProps;
}

const SearchSelect = <TSearchResult extends { id: string }, TValue>(
    props: SearchSelectProps<TSearchResult, TValue>
) => {
    const {
        value,
        onChange,
        results,
        getSearchResultProps,
        getRemovableBadgeProps,
        selectedIds,
        selectedValueMap,
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
                    display: "flex",
                    flexDirection: "row",
                    flexWrap: "wrap",
                    columnGap: 8,
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

export type { SearchSelectProps, SearchResultProps };
export { SearchSelect };
