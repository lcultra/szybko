import type { IconDescriptor } from '@szybko/shared';
import { useState } from 'react';

interface ResultIconProps {
    icon?: IconDescriptor;
    title: string;
}

function firstChar(title: string): string {
    return Array.from(title)[0] ?? '?';
}

export function ResultIcon({ icon, title }: ResultIconProps) {
    const [failed, setFailed] = useState(false);

    if (!icon) {
        return <span className="grid size-10 place-items-center overflow-hidden font-semibold text-sm text-text-muted">{firstChar(title)}</span>;
    }

    if (failed) {
        return <span className="grid size-10 place-items-center overflow-hidden font-semibold text-sm text-text-muted">{firstChar(title)}</span>;
    }

    return (
        <span className="grid size-10 place-items-center overflow-hidden font-semibold text-sm text-text-muted">
            <img
                alt=""
                className="size-10 object-contain"
                draggable={false}
                onError={() => setFailed(true)}
                src={icon.value}
            />
        </span>
    );
}
