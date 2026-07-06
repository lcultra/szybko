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
        <div className="flex h-8 items-center justify-between px-2 pb-1">
            <span className="font-medium text-sm leading-none text-text-muted">{title}</span>
            <div className="flex h-full items-center gap-2">
                {totalCount > shownCount && (
                    <span className="text-xs leading-none text-text-muted/60">
                        {shownCount}
                        /
                        {totalCount}
                    </span>
                )}
                {canExpand && (
                    <button
                        onClick={onToggle}
                        className="h-5 rounded-md px-2 text-xs leading-none text-primary transition-colors hover:bg-surface-hover"
                    >
                        {expanded ? '收起' : '更多'}
                    </button>
                )}
            </div>
        </div>
    );
}
