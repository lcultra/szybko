import { protocol } from 'electron';

export type AssetResolver = (pathname: string) => Promise<Response | null>;

const resolvers = new Map<string, AssetResolver>();

export function registerAssetHandler(hostname: string, resolver: AssetResolver): void {
    resolvers.set(hostname, resolver);
}

export function initAssetProtocol(): void {
    protocol.handle('asset', async (request) => {
        const url = new URL(request.url);
        const resolver = resolvers.get(url.hostname);
        if (!resolver) {
            return new Response(`Unknown asset source: ${url.hostname}`, { status: 404 });
        }
        const response = await resolver(url.pathname);
        if (!response) {
            return new Response('Not found', { status: 404 });
        }
        return response;
    });
}
