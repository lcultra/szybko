import type { ResultSection } from '@szybko/shared';
import clsx from 'clsx';
import { useMemo, useRef } from 'react';
import { PluginView } from '../../components/plugin/PluginView';
import { SurfaceFrame } from '../../components/SurfaceFrame';
import { usePluginRuntime } from '../../hooks/usePluginRuntime';
import { useSearch } from '../../hooks/useSearch';
import { PluginRuntimeService } from '../../services/plugin-runtime';
import { useAppStore } from '../../stores/app-store';
import { useRuntimeStore } from '../../stores/runtime-store';
import { buildNavigationMap } from './hooks/navigation';
import { useKeyboard } from './hooks/useKeyboard';
import { useWindowHeight } from './hooks/useWindowHeight';
import { SearchBar } from './SearchBar';
import { SectionList } from './SectionList';

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

export default function App() {
    const rootRef = useRef<HTMLDivElement>(null);
    const state = useAppStore(s => s.state);
    const setState = useAppStore(s => s.setState);
    const runtimeId = useRuntimeStore(s => s.slot.runtimeId);
    const clearSlot = useRuntimeStore(s => s.clearSlot);

    const {
        query,
        setQuery,
        sections,
        itemsById,
        status,
        sessionId,
        currentQueryId,
        selectedIndex,
        setSelectedIndex,
        expandedSectionIds,
        toggleExpand,
    } = useSearch();

    useWindowHeight(rootRef);
    usePluginRuntime();

    // 构建 NavigationMap
    const navigationMap = useMemo(() => {
        const counts = sections.map(s => ({
            sectionId: s.id,
            count: getVisibleItemCount(s, expandedSectionIds.has(s.id)),
        }));
        let total = 0;
        const offsets = counts.map((c) => {
            const start = total;
            total += c.count;
            return { sectionId: c.sectionId, start, length: c.count };
        });
        return buildNavigationMap(counts, DEFAULT_COLUMNS, selectedIndex, offsets);
    }, [sections, expandedSectionIds, selectedIndex]);

    const onExecuteItem = (itemId: string) => {
        if (!sessionId || !currentQueryId)
            return;
        if (status === 'loading') // Guard: don't execute while loading
            return;
        // 先发 execute IPC，再清搜索（避免 setQuery('') 触发的新搜索 IPC 抢先替换掉 currentSession）
        window.szybkoInternal?.execute({ sessionId, queryId: currentQueryId, itemId: itemId as any });
        setQuery('');
    };

    const onEscape = () => {
        if (state === 'plugin') {
            if (runtimeId) {
                PluginRuntimeService.hide(runtimeId);
            }
            clearSlot();
            setState('idle');
            setQuery('');
        }
        else if (query) {
            setQuery('');
        }
        else {
            window.szybkoInternal?.hideWindow();
        }
    };

    useKeyboard({
        navigationMap,
        onSelect: setSelectedIndex,
        onExecute: () => {
            let idx = 0;
            for (const section of sections) {
                const expanded = expandedSectionIds.has(section.id);
                const visible = getVisibleItemCount(section, expanded);
                if (selectedIndex < idx + visible) {
                    const itemId = section.itemIds[selectedIndex - idx];
                    if (itemId)
                        onExecuteItem(itemId);
                    return;
                }
                idx += visible;
            }
        },
        onEscape,
    });

    const onReorder = (itemId: string, toIndex: number) => {
        window.szybkoInternal?.reorderItem({ itemId: itemId as any, toIndex });
    };

    const onContextMenu = (itemId: string, e: React.MouseEvent) => {
        e.preventDefault();
        window.szybkoInternal?.openContextMenu({ itemId: itemId as any, screenX: e.clientX, screenY: e.clientY });
    };

    // 焦点锁定：阻止点击结果项让搜索框失焦
    function handleMouseDown(event: React.MouseEvent) {
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
            return;
        event.preventDefault();
    }

    function handleFocusCapture(event: React.FocusEvent) {
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
            return;
        event.preventDefault();
    }

    const hasSections = sections.length > 0;

    const shell = (
        <>
            <SearchBar
                className={clsx({
                    '-mb-2': hasSections,
                })}
                value={query}
                onChange={setQuery}
            />
            <div
                className="max-h-shell-content min-h-0 overflow-y-auto overscroll-contain"
                onMouseDown={handleMouseDown}
                onFocusCapture={handleFocusCapture}
            >
                {sections.length > 0
                    ? (
                            <SectionList
                                sections={sections}
                                itemsById={itemsById}
                                selectedIndex={selectedIndex}
                                expandedSectionIds={expandedSectionIds}
                                onExecute={onExecuteItem}
                                onToggleExpand={toggleExpand}
                                onReorder={onReorder}
                                onContextMenu={onContextMenu}
                            />
                        )
                    : null}
            </div>
        </>
    );

    return (
        <section ref={rootRef}>
            <SurfaceFrame>
                { state === 'plugin' ? <PluginView /> : shell }
            </SurfaceFrame>
        </section>
    );
}
