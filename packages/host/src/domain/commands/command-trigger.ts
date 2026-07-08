import { stableJson } from './command-feature';

// ── Local types (not yet in @szybko/shared) ──────────────────────────────────

export type MatchType = string;

export interface CommandTrigger {
    type?: string;
    label?: string;
    score?: number;
    matcher?: unknown;
}

// ── Normalized domain type ────────────────────────────────────────────────────

export interface NormalizedTrigger {
    pluginId: string;
    featureCode: string;
    cmdKey: string;
    type: MatchType;
    label: string;
    scoreBase: number;
    matcherJson: string | null;
}

export function normalizeTrigger(
    pluginId: string,
    featureCode: string,
    cmdKey: string,
    trigger: CommandTrigger,
    index: number,
): NormalizedTrigger {
    return {
        pluginId,
        featureCode,
        cmdKey,
        type: trigger.type ?? 'text',
        label: trigger.label ?? cmdKey,
        scoreBase: trigger.score ?? index,
        matcherJson: trigger.matcher ? stableJson(trigger.matcher) : null,
    };
}

export type { stableJson } from './command-feature';
