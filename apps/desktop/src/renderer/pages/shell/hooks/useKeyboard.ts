import type { NavigationMap } from './navigation';
import { useCallback, useEffect } from 'react';

interface UseKeyboardOptions {
    navigationMap: NavigationMap;
    onSelect: (index: number) => void;
    onExecute: () => void;
    onEscape: () => void;
}

/**
 * 键盘导航 hook——消费 NavigationMap，不做索引算术。
 * 所有方向键导航由 NavigationMap 的 up/down/left/right 指针决定。
 */
export function useKeyboard({
    navigationMap,
    onSelect,
    onExecute,
    onEscape,
}: UseKeyboardOptions) {
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            const map = navigationMap;

            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    if (map.up !== null)
                        onSelect(map.up);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    if (map.down !== null)
                        onSelect(map.down);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (map.left !== null)
                        onSelect(map.left);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (map.right !== null)
                        onSelect(map.right);
                    break;
                case 'Enter':
                    e.preventDefault();
                    onExecute();
                    break;
                case 'Tab':
                    e.preventDefault();
                    if (e.shiftKey) {
                        if (map.left !== null)
                            onSelect(map.left);
                    }
                    else {
                        if (map.right !== null)
                            onSelect(map.right);
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    onEscape();
                    break;
            }
        },
        [navigationMap, onSelect, onExecute, onEscape],
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}
