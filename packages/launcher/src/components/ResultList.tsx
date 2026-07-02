import type { SearchResult } from '@szybko/shared';
import { ResultItem } from './ResultItem.js';

interface ResultListProps {
    results: SearchResult[];
    selectedIndex: number;
    onSelect: (index: number) => void;
    onExecute: (index: number) => void;
}

export function ResultList({
    results,
    selectedIndex,
    _onSelect,
    onExecute,
}: ResultListProps) {
    if (results.length === 0)
        return null;

    return (
        <div className="border-t border-border px-2 pb-2">
            <div className="flex flex-col gap-1">
                {results.map((item, i) => (
                    <ResultItem
                        key={item.id}
                        item={item}
                        selected={i === selectedIndex}
                        onExecute={() => onExecute(i)}
                    />
                ))}
            </div>
        </div>
    );
}
