import type { ReactNode } from 'react';

interface WindowFrameProps {
    children: ReactNode;
}

export function WindowFrame({ children }: WindowFrameProps) {
    return (
        <div
            className="w-[820px] overflow-hidden rounded-[20px] border
                       border-border bg-surface/80 shadow-xl backdrop-blur-xl"
            style={{ padding: '1px' }}
        >
            <div className="w-full">{children}</div>
        </div>
    );
}
