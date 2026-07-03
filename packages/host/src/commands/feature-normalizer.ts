import type { MatchCommand, PluginFeature } from '@szybko/shared';
import { pinyin } from 'pinyin-pro';
import { createHash } from 'node:crypto';

export type CommandType = 'text' | 'regex' | 'over' | 'img' | 'files' | 'window';

export interface NormalizedCommand {
    cmdKey: string;
    triggerIndex: number;
    type: CommandType;
    label?: string;
    matcher: Record<string, unknown>;
    matcherJson: string;
    normalizedKey: string | null;
}

export interface NormalizedFeature {
    code: string;
    feature: PluginFeature;
    featureJson: string;
    featureHash: string;
    commands: NormalizedCommand[];
}

export function normalizeTextKey(value: string): string {
    return value.trim().normalize('NFKC').toLocaleLowerCase();
}

export interface PinyinResult {
    /** 全拼，不含声调，空格分隔多音字首选项。例："suoping" */
    full: string;
    /** 首字母。例："sp" */
    initials: string;
}

export function computePinyin(text: string): PinyinResult {
    // pinyin-pro 的 pinyin() 默认返回带声调拼音，用 toneType: 'none' 去掉声调
    // type: 'array' 返回数组，按字分割
    const chars = pinyin(text, { toneType: 'none', type: 'array' });
    const full = chars.map(c => c.trim()).filter(Boolean).join('').toLocaleLowerCase();
    const initials = chars.map(c => (c.trim() ? c.trim()[0]! : '')).filter(Boolean).join('').toLocaleLowerCase();
    return { full, initials };
}

export function normalizeFeatureCode(value: string): string {
    return value.trim();
}

export function stableJson(value: unknown): string {
    if (Array.isArray(value))
        return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b));
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export function hashStable(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function parseRegexLiteral(match: string): { pattern: string; flags: string } {
    if (!match.startsWith('/'))
        return { pattern: match, flags: '' };

    let escaped = false;
    for (let i = match.length - 1; i > 0; i--) {
        const ch = match[i];
        if (ch !== '/' || escaped) {
            escaped = ch === '\\' && !escaped;
            continue;
        }
        return {
            pattern: match.slice(1, i),
            flags: match.slice(i + 1),
        };
    }
    return { pattern: match, flags: '' };
}

function normalizeObjectCommand(cmd: MatchCommand): { type: CommandType; label?: string; matcher: Record<string, unknown>; normalizedKey: string | null } {
    if (cmd.type === 'regex') {
        const parsed = parseRegexLiteral(cmd.match);
        return {
            type: 'regex',
            label: cmd.label,
            matcher: {
                type: 'regex',
                match: parsed,
                minLength: cmd.minLength,
                maxLength: cmd.maxLength,
            },
            normalizedKey: null,
        };
    }

    if (cmd.type === 'over') {
        return {
            type: 'over',
            label: cmd.label,
            matcher: {
                type: 'over',
                exclude: cmd.exclude ? parseRegexLiteral(cmd.exclude) : undefined,
                minLength: cmd.minLength,
                maxLength: cmd.maxLength,
            },
            normalizedKey: null,
        };
    }

    if (cmd.type === 'files') {
        return {
            type: 'files',
            label: cmd.label,
            matcher: {
                type: 'files',
                fileType: cmd.fileType,
                extensions: cmd.extensions?.map(e => e.toLocaleLowerCase()).sort(),
                match: cmd.match ? parseRegexLiteral(cmd.match) : undefined,
                minLength: cmd.minLength,
                maxLength: cmd.maxLength,
            },
            normalizedKey: null,
        };
    }

    if (cmd.type === 'img') {
        return { type: 'img', label: cmd.label, matcher: { type: 'img' }, normalizedKey: null };
    }

    return {
        type: 'window',
        label: cmd.label,
        matcher: {
            type: 'window',
            match: {
                app: [...cmd.match.app].sort(),
                title: cmd.match.title ? parseRegexLiteral(cmd.match.title) : undefined,
                class: cmd.match.class ? [...cmd.match.class].sort() : undefined,
            },
        },
        normalizedKey: null,
    };
}

export function normalizeCommand(cmd: string | MatchCommand, triggerIndex = 0): NormalizedCommand | null {
    if (typeof cmd === 'string') {
        const normalizedKey = normalizeTextKey(cmd);
        if (!normalizedKey)
            return null;
        const matcher = { type: 'text', text: cmd.trim() };
        const matcherJson = stableJson(matcher);
        return {
            cmdKey: hashStable(`text:${normalizedKey}`),
            triggerIndex,
            type: 'text',
            matcher,
            matcherJson,
            normalizedKey,
        };
    }

    const normalized = normalizeObjectCommand(cmd);
    const matcherJson = stableJson(normalized.matcher);
    return {
        cmdKey: hashStable(`${normalized.type}:${matcherJson}`),
        triggerIndex,
        type: normalized.type,
        label: normalized.label,
        matcher: normalized.matcher,
        matcherJson,
        normalizedKey: normalized.normalizedKey,
    };
}

export function normalizeFeature(feature: PluginFeature): NormalizedFeature {
    const seen = new Set<string>();
    const commands: NormalizedCommand[] = [];
    feature.cmds.forEach((cmd, index) => {
        const normalized = normalizeCommand(cmd, index);
        if (!normalized || seen.has(normalized.cmdKey))
            return;
        seen.add(normalized.cmdKey);
        commands.push(normalized);
    });
    const normalizedFeature: PluginFeature = {
        ...feature,
        code: normalizeFeatureCode(feature.code),
        cmds: feature.cmds,
    };
    const featureJson = stableJson(normalizedFeature);
    return {
        code: normalizedFeature.code,
        feature: normalizedFeature,
        featureJson,
        featureHash: hashStable(featureJson),
        commands,
    };
}
