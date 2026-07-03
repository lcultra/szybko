import type { ReactNode } from 'react';

interface SurfaceFrameProps {
    children: ReactNode;
    className?: string;
}

/** 共享的视觉外壳：背景、边框、毛玻璃 */
export function SurfaceFrame({ children, className = '' }: SurfaceFrameProps) {
    return (
        <div className={`w-full overflow-hidden border border-border bg-surface shadow-xl backdrop-blur-xl ${className}`}>
            {children}
        </div>
    );
}
