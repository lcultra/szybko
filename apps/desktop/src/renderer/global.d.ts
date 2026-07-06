declare global {
    interface Window {
        szybkoInternal?: import('@szybko/shared').SzybkoInternalApi;
    }
}

export {};
