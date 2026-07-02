import { useCallback, useEffect } from 'react';

interface UseKeyboardOptions {
    selectedIndex: number;
    totalItems: number;
    onSelectUp: () => void;
    onSelectDown: () => void;
    onExecute: () => void;
    onEscape: () => void;
}

export function useKeyboard({
    selectedIndex: _selectedIndex,
    totalItems: _totalItems,
    onSelectUp,
    onSelectDown,
    onExecute,
    onEscape,
}: UseKeyboardOptions) {
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    onSelectUp();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    onSelectDown();
                    break;
                case 'Enter':
                    e.preventDefault();
                    onExecute();
                    break;
                case 'Escape':
                    e.preventDefault();
                    onEscape();
                    break;
            }
        },
        [onSelectUp, onSelectDown, onExecute, onEscape],
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}
