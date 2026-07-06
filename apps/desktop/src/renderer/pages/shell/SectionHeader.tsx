interface SectionHeaderProps {
    title: string;
    shownCount: number;
    totalCount: number;
    expanded: boolean;
    canExpand: boolean;
    layout: string;
    onToggle: () => void;
}

/**
 * Section 标题行：名称 + 计数（仅超越可见范围时显示）+ "更多"按钮。
 */
export function SectionHeader({
    title,
    shownCount,
    totalCount,
    expanded,
    canExpand,
    layout: _layout,
    onToggle,
}: SectionHeaderProps) {
    return (
        <div className="flex h-7 items-center justify-between px-2">
            <div className="flex items-baseline gap-1.5">
                <span className="font-medium text-xs leading-none tracking-wide text-text-muted">{title}</span>
                {totalCount > shownCount && (
                    <span className="text-[10px] leading-none text-text-muted/50 tabular-nums">
                        {shownCount}
                        /
                        {totalCount}
                    </span>
                )}
            </div>
            {canExpand && (
                <button
                    onClick={onToggle}
                    className="flex h-5 items-center gap-0.5 rounded-md px-1.5 text-xs leading-none text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
                >
                    {expanded ? '收起' : '更多'}
                    <ChevronDown className={`size-3 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`} />
                </button>
            )}
        </div>
    );
}
