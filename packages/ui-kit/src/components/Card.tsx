import type { ReactNode, Ref } from 'react';
import { Slot } from '@radix-ui/react-slot';

interface CardProps {
    asChild?: boolean;
    children: ReactNode;
    className?: string;
    ref?: Ref<HTMLDivElement>;
}

export function Card({ asChild, children, className = '', ref }: CardProps) {
    const Comp = asChild ? Slot : 'div';
    return (
        <Comp ref={ref} className={`rounded-xl border border-border bg-surface-card p-4 ${className}`}>
            {children}
        </Comp>
    );
}
