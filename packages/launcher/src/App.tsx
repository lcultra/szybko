import { useRef } from 'react';
import { ResultList } from './components/ResultList.js';
import { SearchBar } from './components/SearchBar.js';
import { WindowFrame } from './components/WindowFrame.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useSearch } from './hooks/useSearch.js';
import { useWindowHeight } from './hooks/useWindowHeight.js';
import './app.css';

export default function App() {
    const rootRef = useRef<HTMLDivElement>(null);
    const { query, setQuery, results, selectedIndex, setSelectedIndex } = useSearch();

    useWindowHeight(rootRef);

    useKeyboard({
        selectedIndex,
        totalItems: results.length,
        onSelectUp: () => setSelectedIndex(i => Math.max(0, i - 1)),
        onSelectDown: () => setSelectedIndex(i => Math.min(results.length - 1, i + 1)),
        onExecute: () => {
            if (results[selectedIndex]) {
                window.utools?.execute(results[selectedIndex].action);
            }
        },
        onEscape: () => {
            if (query) {
                setQuery('');
                setSelectedIndex(0);
            }
            else {
                window.utools?.hideWindow();
            }
        },
    });

    return (
        <div ref={rootRef}>
            <WindowFrame>
                <SearchBar value={query} onChange={setQuery} />
                <ResultList
                    results={results}
                    selectedIndex={selectedIndex}
                    onSelect={setSelectedIndex}
                    onExecute={(i) => {
                        if (results[i])
                            window.utools?.execute(results[i].action);
                    }}
                />
            </WindowFrame>
        </div>
    );
}
