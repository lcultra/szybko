import type { ReactNode } from 'react'

interface CardProps {
    children: ReactNode
    className?: string
}

export function Card({ children, className = '' }: CardProps) {
    return (
        <div className={`rounded-xl border border-border bg-surface-card p-4 ${className}`}>
            {children}
        </div>
    )
}
