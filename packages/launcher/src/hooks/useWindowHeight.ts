import { useEffect, useRef } from 'react'
import { MIN_WINDOW_HEIGHT, MAX_WINDOW_HEIGHT } from '@szybko/shared'

export function useWindowHeight(rootRef: React.RefObject<HTMLDivElement | null>) {
    const rafRef = useRef(0)

    useEffect(() => {
        const el = rootRef.current
        if (!el) return

        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = requestAnimationFrame(() => {
                const height = el.getBoundingClientRect().height
                const clamped = Math.min(Math.max(Math.ceil(height), MIN_WINDOW_HEIGHT), MAX_WINDOW_HEIGHT)
                window.utools?.resizeWindow(clamped)
            })
        })

        observer.observe(el)
        return () => {
            observer.disconnect()
            cancelAnimationFrame(rafRef.current)
        }
    }, [rootRef])
}
