import type { InputHTMLAttributes, Ref } from 'react';
import { Slot } from '@radix-ui/react-slot';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    asChild?: boolean;
    ref?: Ref<HTMLInputElement>;
}

export function Input({ asChild, className = '', ref, ...props }: InputProps) {
    const Comp = asChild ? Slot : 'input';
    return (
        <Comp
            ref={ref}
            className={`w-full border-none bg-transparent text-2xl text-text placeholder-text-muted outline-none focus:ring-0 ${className}`}
            {...props}
        />
    );
}
