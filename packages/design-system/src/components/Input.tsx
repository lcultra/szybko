import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className = '', ...props }, ref) => {
        return (
            <input
                ref={ref}
                className={`w-full bg-transparent border-none outline-none text-text text-2xl placeholder-text-muted focus:ring-0 ${className}`}
                {...props}
            />
        )
    },
)
Input.displayName = 'Input'
