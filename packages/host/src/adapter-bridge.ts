import type { FileInfo } from '@szybko/core-rust';

// Type assertion: the native Rust module is loaded at runtime.
// eslint-disable-next-line ts/no-require-imports
const native: typeof import('@szybko/core-rust') | null = require('@szybko/core-rust');

export function loadNative() {
    // Module is loaded at import time, nothing to do.
    console.warn('[adapter-bridge] Rust core loaded');
}

export function getCore() {
    return {
        ping: (message: string): string => native?.ping(message) ?? `(fallback) pong: ${message}`,
        searchFiles: (query: string): FileInfo[] => native?.searchFiles(query) ?? [],
    };
}
