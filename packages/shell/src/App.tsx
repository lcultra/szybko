import { useEffect, useRef } from 'react';
import { PluginScene } from './components/PluginScene.js';
import { ResultList } from './components/ResultList.js';
import { SearchBar } from './components/SearchBar.js';
import { WindowFrame } from './components/WindowFrame.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useSearch } from './hooks/useSearch.js';
import { useWindowHeight } from './hooks/useWindowHeight.js';
import { useAppStore } from './stores/app-store.js';
import './app.css';

export default function App() {
    const rootRef = useRef<HTMLDivElement>(null);
    const state = useAppStore(s => s.state);
    const setActivePlugin = useAppStore(s => s.setActivePlugin);
    const { query, setQuery, results, selectedIndex, setSelectedIndex } = useSearch();

    useWindowHeight(rootRef);

    // 监听运行时状态变更 → 切换 plugin / idle 模式
    useEffect(() => {
        const cleanup = window.szybko?.onRuntimeStateChanged?.((payload: any) => {
            if (payload?.state === 'attached') {
                setActivePlugin(payload.pluginId);
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
            <WindowFrame>
                <SearchBar value={query} onChange={setQuery} />
                {state === 'plugin'
                    ? (
                            <PluginScene />
                        )
                    : (
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
            </WindowFrame>
        </div>
    );
}
