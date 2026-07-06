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

const DEFAULT_COLUMNS = 9;
const DEFAULT_ROWS = 2;
const MAX_VISIBLE = DEFAULT_ROWS * DEFAULT_COLUMNS;

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
            count: expandedSectionIds.has(s.id)
                ? s.itemIds.length
                : Math.min(s.itemIds.length, MAX_VISIBLE),
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
        setQuery('');
        window.szybkoInternal?.execute({ sessionId, queryId: currentQueryId, itemId: itemId as any });
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
                const visible = expanded ? section.itemIds.length : Math.min(section.itemIds.length, MAX_VISIBLE);
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

    const onPinToggle = (itemId: string) => {
        const item = itemsById[itemId as any];
        if (!item)
            return;
        window.szybkoInternal?.pinItem({ itemId: itemId as any, pin: !item.state.pinned });
    };

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

    return (
        <div ref={rootRef}>
            <SurfaceFrame>
                <div className="p-px">
                    {state === 'plugin'
                        ? <PluginView />
                        : <SearchBar value={query} onChange={setQuery} />}
                    {state !== 'plugin' && (
                        <div
                            className="max-h-[424px] min-h-0 overflow-y-auto overscroll-contain"
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
                                            onSelect={setSelectedIndex}
                                            onExecute={onExecuteItem}
                                            onPinToggle={onPinToggle}
                                            onToggleExpand={toggleExpand}
                                            onReorder={onReorder}
                                            onContextMenu={onContextMenu}
                                        />
                                    )
                                : status === 'final' && query
                                    ? (
                                            <div className="flex items-center justify-center py-8 text-sm text-text-muted">
                                                没有找到匹配结果
                                            </div>
                                        )
                                    : null}
                        </div>
                    )}
                </div>
            </SurfaceFrame>
        </div>
    );
}
