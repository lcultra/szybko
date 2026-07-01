import type { SearchResult } from '@szybko/shared'

interface ResultItemProps {
    item: SearchResult
    selected: boolean
    onExecute: () => void
}

export function ResultItem({ item, selected, onExecute }: ResultItemProps) {
    return (
        <button
            onClick={onExecute}
            className={`flex items-center gap-3 w-full px-4 py-2 rounded-lg text-left transition-colors ${
                selected
                    ? 'bg-surface-hover border border-ring/40'
                    : 'bg-transparent border border-transparent hover:bg-surface-hover/60'
            }`}
        >
            <div className="w-10 h-10 rounded-lg bg-surface-card flex items-center justify-center text-sm">
                {item.icon ? <img src={item.icon} alt="" className="w-6 h-6" /> : '📄'}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text truncate">{item.title}</div>
                {item.subtitle && <div className="text-xs text-text-muted truncate">{item.subtitle}</div>}
            </div>
        </button>
    )
}
