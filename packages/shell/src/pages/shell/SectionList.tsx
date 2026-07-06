import type { LauncherItem, LauncherItemId, ResultSection } from '@szybko/shared';
import { useCallback, useMemo } from 'react';
import { PinnedGrid } from './PinnedGrid';
import { ResultGrid } from './ResultGrid';
import { SectionHeader } from './SectionHeader';

const DEFAULT_ROWS = 2;
const DEFAULT_COLUMNS = 9;

interface SectionListProps {
    sections: ResultSection[];
    itemsById: Record<LauncherItemId, LauncherItem>;
    selectedIndex: number;
    expandedSectionIds: Set<string>;
    onSelect: (globalIndex: number) => void;
    onExecute: (itemId: LauncherItemId) => void;
    onPinToggle: (itemId: LauncherItemId) => void;
    onToggleExpand: (sectionId: string) => void;
    onReorder: (itemId: LauncherItemId, toIndex: number) => void;
    onContextMenu: (itemId: LauncherItemId, e: React.MouseEvent) => void;
}

export function SectionList({
    sections,
    itemsById,
    selectedIndex,
    expandedSectionIds,
    onSelect,
    onExecute,
    onPinToggle,
    onToggleExpand,
    onReorder,
    onContextMenu,
}: SectionListProps) {
    const { sectionOffsets } = useMemo(() => {
        const offsets: Array<{ sectionId: string; start: number; length: number }> = [];
        let total = 0;
        for (const section of sections) {
            const expanded = expandedSectionIds.has(section.id);
            const visible = expanded ? section.itemIds.length : Math.min(section.itemIds.length, DEFAULT_ROWS * DEFAULT_COLUMNS);
            offsets.push({ sectionId: section.id, start: total, length: visible });
            total += visible;
        }
        return { sectionOffsets: offsets, visibleCount: total };
    }, [sections, expandedSectionIds]);

    const handleReorder = useCallback((itemId: LauncherItemId, toIndex: number) => {
        onReorder(itemId, toIndex);
    }, [onReorder]);

    if (sections.length === 0)
        return null;

    return (
        <div className="flex flex-col gap-1 px-2 pb-2">
            {sections.map((section) => {
                const offset = sectionOffsets.find(o => o.sectionId === section.id)!;
                const expanded = expandedSectionIds.has(section.id);
                const visibleIds = expanded
                    ? section.itemIds
                    : section.itemIds.slice(0, DEFAULT_ROWS * DEFAULT_COLUMNS);

                const items = visibleIds
                    .map(id => itemsById[id])
                    .filter((item): item is LauncherItem => item != null);

                const isPinned = section.source === 'pinned';

                return (
                    <div key={section.id}>
                        {section.source !== 'search' && (
                            <SectionHeader
                                title={section.title}
                                shownCount={items.length}
                                totalCount={section.totalCount}
                                expanded={expanded}
                                canExpand={section.hasMore || section.totalCount > DEFAULT_ROWS * DEFAULT_COLUMNS}
                                layout={section.layout}
                                onToggle={() => onToggleExpand(section.id)}
                            />
                        )}
                        {isPinned
                            ? (
                                    <PinnedGrid
                                        items={items}
                                        startIndex={offset.start}
                                        selectedIndex={selectedIndex}
                                        columns={DEFAULT_COLUMNS}
                                        onSelect={onSelect}
                                        onExecute={onExecute}
                                        onPinToggle={onPinToggle}
                                        onReorder={handleReorder}
                                        onContextMenu={onContextMenu}
                                    />
                                )
                            : (
                                    <ResultGrid
                                        items={items}
                                        startIndex={offset.start}
                                        selectedIndex={selectedIndex}
                                        columns={DEFAULT_COLUMNS}
                                        onSelect={onSelect}
                                        onExecute={onExecute}
                                        onPinToggle={onPinToggle}
                                        onContextMenu={onContextMenu}
                                    />
                                )}
                    </div>
                );
            })}
        </div>
    );
}
