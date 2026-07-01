let native: any = null

export function loadNative() {
    try {
        native = require('@szybko/core-rust')
        console.log('[adapter-bridge] Rust core loaded')
    } catch (err) {
        console.warn('[adapter-bridge] Rust core not available, using fallback:', err)
    }
}

export interface CoreAPI {
    ping(message: string): string
    searchFiles(query: string): any[]
}

export function getCore(): CoreAPI {
    if (!native) loadNative()
    return {
        ping: (message: string) => native?.ping(message) ?? `(fallback) pong: ${message}`,
        searchFiles: (query: string) => native?.searchFiles(query) ?? [],
    }
}
