import type { ReactNode } from 'react'

interface WindowFrameProps {
    children: ReactNode
}

export function WindowFrame({ children }: WindowFrameProps) {
    return (
        <div
            className="w-[820px] rounded-[20px] border border-border
                       bg-surface/80 backdrop-blur-xl overflow-hidden shadow-xl"
            style={{ padding: '1px' }}
        >
            <div className="w-full">{children}</div>
        </div>
    )
}
