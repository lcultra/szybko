export interface SearchRequest {
    queryId: string;
    query: string;
    timestamp: number;
}

export interface SearchBatch {
    queryId: string;
    batchSeq: number;
    source: string;
    results: SearchResult[];
    isFinal: boolean;
}

export interface PluginSearchContext {
    queryId: string;
    keyword: string;
    query: string;
    fullQuery: string;
}

export interface SearchResult {
    id: string;
    title: string;
    subtitle?: string;
    icon?: string;
    group?: string;
    score: number;
    action: ActionDescriptor;
}

export type ActionDescriptor
    = | { type: 'shell.openPath'; payload: { path: string } }
        | { type: 'shell.openUrl'; payload: { url: string } }
        | { type: 'clipboard.writeText'; payload: { text: string } }
        | { type: 'process.launchApp'; payload: { bundleId: string } }
        | { type: 'plugin.open'; payload: { pluginId: string; url: string } }
        | { type: 'plugin.runCommand'; payload: { pluginId: string; command: string; args?: any[] } }
        | { type: 'text.paste'; payload: { text: string } }
        | { type: 'redirect'; payload: { label: string; payload?: any } };
