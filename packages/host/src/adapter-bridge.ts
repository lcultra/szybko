let native: any = null;

export function loadNative() {
    try {
        // eslint-disable-next-line ts/no-require-imports
        native = require('@szybko/core-rust');
        console.warn('[adapter-bridge] Rust core loaded');
    }
    catch (err) {
        console.warn('[adapter-bridge] Rust core not available, using fallback:', err);
    }
}

export interface CoreAPI {
    ping: (message: string) => string;
    searchFiles: (query: string) => any[];
}

export function getCore(): CoreAPI {
    if (!native)
        loadNative();
    return {
        ping: (message: string) => native?.ping(message) ?? `(fallback) pong: ${message}`,
        searchFiles: (query: string) => native?.searchFiles(query) ?? [],
    };
}
