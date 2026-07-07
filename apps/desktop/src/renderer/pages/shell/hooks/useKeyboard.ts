import type { NavigationMap } from './navigation';
import type { ShortcutActionDef } from '@szybko/shared';
import { useCallback, useEffect, useState } from 'react';

interface UseKeyboardOptions {
    navigationMap: NavigationMap;
    onSelect: (index: number) => void;
    onExecute: () => void;
    onEscape: () => void;
}

function matchDomEvent(def: ShortcutActionDef, e: KeyboardEvent): boolean {
    for (const binding of def.bindings) {
        if (e.key.toLowerCase() !== binding.key.toLowerCase())
            continue;
        if (e.ctrlKey !== (binding.modifiers.ctrl ?? false))
            continue;
        if (e.metaKey !== (binding.modifiers.meta ?? false))
            continue;
        if (e.altKey !== (binding.modifiers.alt ?? false))
            continue;
        if (e.shiftKey !== (binding.modifiers.shift ?? false))
            continue;
        return true;
    }
    return false;
}

/**
 * 键盘导航 hook——消费 NavigationMap 和从后端获取的 ShortcutDefs。
 * 所有方向键导航由 NavigationMap 的 up/down/left/right 指针决定。
 */
export function useKeyboard({
    navigationMap,
    onSelect,
    onExecute,
    onEscape,
}: UseKeyboardOptions) {
    const [defs, setDefs] = useState<ShortcutActionDef[]>([]);

    useEffect(() => {
        window.szybkoInternal?.getShortcutDefs('renderer-document').then(setDefs);
    }, []);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            const map = navigationMap;

            for (const def of defs) {
                if (!matchDomEvent(def, e))
                    continue;

                // Check preventDefault (default true for renderer-document)
                const preventDefault = def.bindings.some(b => b.preventDefault ?? true);
                if (preventDefault)
                    e.preventDefault();

                switch (def.actionId) {
                    case 'shell:navigate-up':
                        if (map.up !== null)
                            onSelect(map.up);
                        return;
                    case 'shell:navigate-down':
                        if (map.down !== null)
                            onSelect(map.down);
                        return;
                    case 'shell:navigate-left':
                        if (map.left !== null)
                            onSelect(map.left);
                        return;
                    case 'shell:navigate-right':
                        if (map.right !== null)
                            onSelect(map.right);
                        return;
                    case 'shell:execute':
                        onExecute();
                        return;
                    case 'shell:escape':
                        onEscape();
                        return;
                }
            }
        },
        [defs, navigationMap, onSelect, onExecute, onEscape],
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}
