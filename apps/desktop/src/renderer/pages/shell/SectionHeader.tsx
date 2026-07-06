interface SectionHeaderProps {
    title: string;
    totalCount: number;
    expanded: boolean;
    canExpand: boolean;
    onToggle: () => void;
}

/**
 * Section 标题行：名称 + 右侧展开按钮。
 */
export function SectionHeader({
    title,
    totalCount,
    expanded,
    canExpand,
    onToggle,
}: SectionHeaderProps) {
    return (
        <div
            className={`flex h-7 items-center justify-between px-2 hover:bg-surface-hover/60 ${canExpand ? 'cursor-pointer' : ''}`}
            onClick={canExpand ? onToggle : undefined}
        >
            <div className="flex items-baseline">
                <span className="font-bold text-md leading-none tracking-wide text-text-muted">{title}</span>
            </div>
            {canExpand && (
                <div className="flex items-center gap-2">
                    <span
                        className="flex h-5 items-center gap-0.5 rounded-md px-1.5 text-base leading-none text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
                    >
                        {expanded ? '收起' : `展开（${totalCount}）`}
                    </span>
                </div>
            )}
        </div>
    );
}
