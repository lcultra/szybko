import type { ReactNode } from 'react';
import { SurfaceFrame } from '../../components/SurfaceFrame';

interface WindowFrameProps {
    children: ReactNode;
}

export function WindowFrame({ children }: WindowFrameProps) {
    return (
        <SurfaceFrame className="w-[820px] rounded-[20px] shadow-xl">
            <div className="w-full p-px">{children}</div>
        </SurfaceFrame>
    );
}
