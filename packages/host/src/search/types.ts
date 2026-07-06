import type { LauncherItem, ResultSection } from '@szybko/shared';

export interface SearchProviderResult {
    items: LauncherItem[];
    section: Pick<ResultSection, 'id' | 'title' | 'source' | 'layout'>;
}

export interface ExecuteContext {
    queryId: string;
    sessionId: string;
}

export interface ExecuteResult {
    ok: boolean;
    error?: string;
}
