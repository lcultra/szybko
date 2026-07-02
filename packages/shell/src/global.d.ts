declare global {
    interface Window {
        szybkoInternal?: import('@szybko/shared').SzybkoInternalApi;
        szybko?: import('@szybko/shared').SzybkoPluginApi;
    }
}

export {};
