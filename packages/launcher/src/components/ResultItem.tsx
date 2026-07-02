import type { SearchResult } from '@szybko/shared';

interface ResultItemProps {
    item: SearchResult;
    selected: boolean;
    onSelect: () => void;
    onExecute: () => void;
}

export function ResultItem({ item, selected, onSelect, onExecute }: ResultItemProps) {
    return (
        <button
            onClick={onExecute}
            onMouseEnter={onSelect}
            className={`flex w-full items-center gap-3 rounded-lg px-4 py-2 text-left transition-colors ${
                selected
                    ? 'border border-ring/40 bg-surface-hover'
                    : 'border border-transparent bg-transparent hover:bg-surface-hover/60'
            }`}
        >
            <div className="flex size-10 items-center justify-center rounded-lg bg-surface-card text-sm">
                {item.icon ? <img src={item.icon} alt="" className="size-6" /> : '📄'}
            </div>
            <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm text-text">{item.title}</div>
                {item.subtitle && <div className="truncate text-xs text-text-muted">{item.subtitle}</div>}
            </div>
        </button>
    );
}
