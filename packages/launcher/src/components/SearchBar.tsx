import { useRef, useEffect } from 'react'
import { Input } from '@szybko/design-system'

interface SearchBarProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
}

export function SearchBar({ value, onChange, placeholder = '搜索应用、命令、文件、插件...' }: SearchBarProps) {
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => { inputRef.current?.focus() }, [])

    return (
        <div className="flex items-center h-[68px] px-4">
            <Input
                ref={inputRef}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
            />
        </div>
    )
}
