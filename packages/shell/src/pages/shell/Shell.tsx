import { useEffect, useRef } from 'react';
import { PluginView } from '../../components/PluginView';
import { useAppStore } from '../../stores/app-store';
import { useKeyboard } from './hooks/useKeyboard';
import { useSearch } from './hooks/useSearch';
import { useWindowHeight } from './hooks/useWindowHeight';
import { ResultList } from './ResultList';
import { SearchBar } from './SearchBar';
import { SurfaceFrame } from '../../components/SurfaceFrame';

export default function App() {
    const rootRef = useRef<HTMLDivElement>(null);
    const state = useAppStore(s => s.state);
    const activeRuntimeId = useAppStore(s => s.activeRuntimeId);
    const setActivePlugin = useAppStore(s => s.setActivePlugin);
    const { query, setQuery, results, selectedIndex, setSelectedIndex } = useSearch();

    useWindowHeight(rootRef);

    // 监听运行时状态变更 → 切换 plugin / idle 模式
    useEffect(() => {
        const cleanup = window.szybko?.onRuntimeStateChanged?.((payload: any) => {
            if (payload?.state === 'attached') {
                setActivePlugin(payload.pluginId, payload.runtimeId, payload.pluginName, payload.featureExplain);
            }
            else if (payload?.state === 'detached' || payload?.state === 'destroyed') {
                setActivePlugin(null);
            }
        });
        return () => cleanup?.();
    }, [setActivePlugin]);

    useKeyboard({
        selectedIndex,
        totalItems: results.length,
        onSelectUp: () => setSelectedIndex(i => Math.max(0, i - 1)),
        onSelectDown: () => setSelectedIndex(i => Math.min(results.length - 1, i + 1)),
        onExecute: () => {
            if (results[selectedIndex]) {
                window.szybko?.execute(results[selectedIndex].action);
            }
        },
        onEscape: () => {
            if (state === 'plugin') {
                if (activeRuntimeId) {
                    window.szybkoInternal?.hidePlugin(activeRuntimeId);
                }
                setActivePlugin(null);
            }
            else if (query) {
                setQuery('');
                setSelectedIndex(0);
            }
            else {
                window.szybkoInternal?.hideWindow();
            }
        },
    });

    return (
        <div ref={rootRef}>
            <SurfaceFrame className="w-full rounded-[20px] border border-border shadow-xl">
                <div className="p-px">
                    {state === 'plugin' ? <PluginView /> : <SearchBar value={query} onChange={setQuery} />}
                    {state !== 'plugin' && (
                        <ResultList
                            results={results}
                            selectedIndex={selectedIndex}
                            onSelect={setSelectedIndex}
                            onExecute={(i) => {
                                if (results[i])
                                    window.szybko?.execute(results[i].action);
                            }}
                        />
                    )}
                </div>
            </SurfaceFrame>
        </div>
    );
}
