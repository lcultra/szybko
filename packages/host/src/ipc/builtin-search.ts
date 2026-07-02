import type { SearchResult } from '@szybko/shared';

// ── Built-in search sources ──────────────────────────────────────

interface SearchSource {
    name: string;
    search: (query: string) => SearchResult[];
}

function calculate(query: string): SearchResult[] {
    if (!/^[\d+\-*/.()%\s]+$/.test(query.trim()))
        return [];

    try {
        // eslint-disable-next-line no-new-func
        const result = new Function(`"use strict"; return (${query})`)();
        if (typeof result !== 'number' || !Number.isFinite(result))
            return [];

        return [{
            id: `calc-${Date.now()}`,
            title: String(result),
            subtitle: `${query} =`,
            icon: '🧮',
            group: '计算器',
            score: 100,
            action: { type: 'clipboard.writeText', payload: { text: String(result) } },
        }];
    }
    catch {
        return [];
    }
}

const STATIC_APPS: SearchResult[] = [
    {
        id: 'app-vscode',
        title: 'Visual Studio Code',
        subtitle: '代码编辑器',
        icon: '💻',
        group: '应用',
        score: 90,
        action: { type: 'process.launchApp', payload: { bundleId: 'com.microsoft.VSCode' } },
    },
    {
        id: 'app-terminal',
        title: '终端',
        subtitle: 'Terminal.app',
        icon: '🖥️',
        group: '应用',
        score: 80,
        action: { type: 'process.launchApp', payload: { bundleId: 'com.apple.Terminal' } },
    },
    {
        id: 'app-finder',
        title: '访达',
        subtitle: 'Finder',
        icon: '📁',
        group: '应用',
        score: 70,
        action: { type: 'shell.openPath', payload: { path: '/' } },
    },
    {
        id: 'app-safari',
        title: 'Safari',
        subtitle: '浏览器',
        icon: '🌐',
        group: '应用',
        score: 65,
        action: { type: 'process.launchApp', payload: { bundleId: 'com.apple.Safari' } },
    },
    {
        id: 'app-calendar',
        title: '日历',
        subtitle: 'Calendar',
        icon: '📅',
        group: '应用',
        score: 60,
        action: { type: 'process.launchApp', payload: { bundleId: 'com.apple.iCal' } },
    },
];

const SOURCES: SearchSource[] = [
    { name: 'calculator', search: calculate },
    {
        name: 'apps',
        search: (query: string) => {
            const lower = query.toLowerCase();
            return STATIC_APPS.filter(
                app => app.title.toLowerCase().includes(lower) || app.subtitle?.toLowerCase().includes(lower),
            ).map((app, i) => ({ ...app, score: app.score - i * 5 }));
        },
    },
];

export function runBuiltinSearch(query: string): SearchResult[] {
    if (!query.trim())
        return [];

    const results: SearchResult[] = [];
    for (const source of SOURCES) {
        results.push(...source.search(query));
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 10);
}
