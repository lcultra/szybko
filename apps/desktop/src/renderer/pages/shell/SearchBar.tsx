import type { SyntheticEvent } from 'react';
import clsx from 'clsx';
import { useEffect, useRef } from 'react';

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

function preventNativeInputEvent(event: SyntheticEvent<HTMLInputElement>) {
    event.preventDefault();
    event.stopPropagation();
}

export function SearchBar({
    value,
    onChange,
    placeholder = '搜索应用、命令、文件、插件...',
    className,
}: SearchBarProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    return (
        <div className={clsx('flex h-header items-center px-2 py-2', className)}>
            <input
                ref={inputRef}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                onContextMenu={preventNativeInputEvent}
                // onCopy={preventNativeInputEvent}
                // onCut={preventNativeInputEvent}
                // onPaste={preventNativeInputEvent}
                // onDragStart={preventNativeInputEvent}
                // onDragEnter={preventNativeInputEvent}
                // onDragOver={preventNativeInputEvent}
                // onDrop={preventNativeInputEvent}
                className="w-full h-full border-none bg-transparent text-2xl text-text
                    placeholder-text-muted outline-none focus:ring-0"
            />
        </div>
    );
}
