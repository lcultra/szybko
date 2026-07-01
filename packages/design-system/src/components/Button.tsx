import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Slot } from '@radix-ui/react-slot'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    asChild?: boolean
    variant?: 'primary' | 'ghost'
    size?: 'sm' | 'md'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ asChild, variant = 'ghost', size = 'md', className = '', ...props }, ref) => {
        const Comp = asChild ? Slot : 'button'
        const base = 'inline-flex items-center justify-center rounded-md transition-colors focus:outline-none'
        const variants = {
            primary: 'bg-primary text-primary-foreground hover:opacity-90',
            ghost: 'bg-transparent hover:bg-surface-hover text-text',
        }
        const sizes = {
            sm: 'h-8 px-3 text-sm',
            md: 'h-10 px-4 text-base',
        }
        return (
            <Comp
                ref={ref}
                className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
                {...props}
            />
        )
    },
)
Button.displayName = 'Button'
