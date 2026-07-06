import type { ButtonHTMLAttributes, Ref } from 'react';
import { Slot } from '@radix-ui/react-slot';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    ref?: Ref<HTMLButtonElement>;
    asChild?: boolean;
    variant?: 'primary' | 'ghost';
    size?: 'sm' | 'md';
}

export function Button({ asChild, variant = 'ghost', size = 'md', className = '', ref, ...props }: ButtonProps) {
    const Comp = asChild ? Slot : 'button';
    const base = 'inline-flex items-center justify-center rounded-md transition-colors focus:outline-none';
    const variants = {
        primary: 'bg-primary text-primary-foreground hover:opacity-90',
        ghost: 'bg-transparent hover:bg-surface-hover text-text',
    };
    const sizes = {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-base',
    };
    return (
        <Comp
            ref={ref}
            className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
            {...props}
        />
    );
}
