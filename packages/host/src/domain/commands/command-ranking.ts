export interface RankedEntry {
    itemId: string;
    score: number;
    pluginId: string;
    featureCode: string;
    label: string;
}

/** Sort by score descending, then by label ascending */
export function rankEntries(entries: RankedEntry[]): RankedEntry[] {
    return [...entries].sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        return a.label.localeCompare(b.label);
    });
}
