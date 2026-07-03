import { useRef } from 'react';
import { PluginView } from '../../components/plugin/PluginView';
import { SurfaceFrame } from '../../components/SurfaceFrame';
import { usePluginRuntime } from '../../hooks/usePluginRuntime';
import { useSearch } from '../../hooks/useSearch';
import { PluginRuntimeService } from '../../services/plugin-runtime';
import { useAppStore } from '../../stores/app-store';
import { useRuntimeStore } from '../../stores/runtime-store';
import { useKeyboard } from './hooks/useKeyboard';
import { useWindowHeight } from './hooks/useWindowHeight';
import { ResultList } from './ResultList';
import { SearchBar } from './SearchBar';

export default function App() {
    const rootRef = useRef<HTMLDivElement>(null);
    const state = useAppStore(s => s.state);
    const setState = useAppStore(s => s.setState);
    const runtimeId = useRuntimeStore(s => s.slot.runtimeId);
    const clearSlot = useRuntimeStore(s => s.clearSlot);
    const { query, setQuery, results, selectedIndex, setSelectedIndex } = useSearch();

    useWindowHeight(rootRef);
    usePluginRuntime();

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
                if (runtimeId) {
                    PluginRuntimeService.hide(runtimeId);
                }
                clearSlot();
                setState('idle');
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
            <SurfaceFrame>
                <div className="p-px">
                    {state === 'plugin'
                        ? <PluginView />
                        : <SearchBar value={query} onChange={setQuery} />}
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
