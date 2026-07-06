import type { LauncherItem, LauncherItemId, ResultSection } from '@szybko/shared';
import { useMemo } from 'react';
import { Grid } from './Grid';
import { SectionHeader } from './SectionHeader';

const DEFAULT_ROWS = 2;
const DEFAULT_COLUMNS = 9;

function getCollapsedItemLimit(layout: ResultSection['layout']) {
    switch (layout) {
        case 'grid':
            return DEFAULT_ROWS * DEFAULT_COLUMNS;
        case 'list':
        case 'compact':
            return DEFAULT_ROWS;
    }
}

function getVisibleItemCount(section: ResultSection, expanded: boolean) {
    if (expanded)
        return section.itemIds.length;

    return Math.min(section.itemIds.length, getCollapsedItemLimit(section.layout));
}

interface SectionListProps {
    sections: ResultSection[];
    itemsById: Record<LauncherItemId, LauncherItem>;
    selectedIndex: number;
    expandedSectionIds: Set<string>;
    onExecute: (itemId: LauncherItemId) => void;
    onToggleExpand: (sectionId: string) => void;
    onReorder: (itemId: LauncherItemId, toIndex: number) => void;
    onContextMenu: (itemId: LauncherItemId, e: React.MouseEvent) => void;
}

export function SectionList({
    sections,
    itemsById,
    selectedIndex,
    expandedSectionIds,
    onExecute,
    onToggleExpand,
    onReorder,
    onContextMenu,
}: SectionListProps) {
    const { sectionOffsets } = useMemo(() => {
        const offsets: Array<{ sectionId: string; start: number; length: number }> = [];
        let total = 0;
        for (const section of sections) {
            const expanded = expandedSectionIds.has(section.id);
            const visible = getVisibleItemCount(section, expanded);
            offsets.push({ sectionId: section.id, start: total, length: visible });
            total += visible;
        }
        return { sectionOffsets: offsets, visibleCount: total };
    }, [sections, expandedSectionIds]);

    if (sections.length === 0)
        return null;

    return (
        <div className="flex flex-col gap-2.5 pb-2">
            {sections.map((section) => {
                const offset = sectionOffsets.find(o => o.sectionId === section.id)!;
                const expanded = expandedSectionIds.has(section.id);
                const collapsedItemLimit = getCollapsedItemLimit(section.layout);
                const canExpand = section.source === 'search' && section.totalCount > collapsedItemLimit;
                const visibleIds = expanded
                    ? section.itemIds
                    : section.itemIds.slice(0, collapsedItemLimit);

                const items = visibleIds
                    .map(id => itemsById[id])
                    .filter((item): item is LauncherItem => item != null);

                const isPinned = section.source === 'pinned';

                return (
                    <div key={section.id} className="flex flex-col gap-1">
                        <SectionHeader
                            title={section.title}
                            totalCount={section.totalCount}
                            expanded={expanded}
                            canExpand={canExpand}
                            onToggle={() => onToggleExpand(section.id)}
                        />
                        <Grid
                            items={items}
                            startIndex={offset.start}
                            selectedIndex={selectedIndex}
                            columns={DEFAULT_COLUMNS}
                            draggable={isPinned}
                            onReorder={isPinned ? onReorder : undefined}
                            onExecute={onExecute}
                            onContextMenu={onContextMenu}
                        />
                    </div>
                );
            })}
        </div>
    );
}
