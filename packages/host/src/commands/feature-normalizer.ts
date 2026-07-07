import type { MatchCommand, MatchRange, PluginFeature } from '@szybko/shared';
import { createHash } from 'node:crypto';
import { pinyin } from 'pinyin-pro';

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

interface IndexedPinyinSegment {
    titleStart: number;
    titleEnd: number;
    fullStart: number;
    fullEnd: number;
    initialStart: number;
    initialEnd: number;
    full: string;
    initial: string;
}

export interface CommandSearchTextMatchInput {
    searchText: string;
    sourceText: string | null;
    matchLevel: 1 | 2 | 3;
    query: string;
}

export interface CommandSearchTextRankInput extends CommandSearchTextMatchInput {
    scoreBase: number;
    featureOrder?: number;
    triggerIndex?: number;
}

export type CommandSearchMatchKind
    = | 'direct-exact'
        | 'direct-prefix'
        | 'direct-contains'
        | 'pinyin-exact'
        | 'pinyin-prefix'
        | 'pinyin-syllable'
        | 'initial-exact'
        | 'initial-prefix'
        | 'initial-contains';

export interface CommandSearchTextRank {
    kind: CommandSearchMatchKind;
    matchLevel: 1 | 2 | 3;
    position: number;
    titleLength: number;
    ranges: MatchRange[];
    score: number;
}

type CommandSearchTextMatchInfo = Omit<CommandSearchTextRank, 'score'>;

const MATCH_KIND_WEIGHT: Record<CommandSearchMatchKind, number> = {
    'direct-exact': 9,
    'direct-prefix': 8,
    'direct-contains': 7,
    'pinyin-exact': 6,
    'pinyin-prefix': 5,
    'pinyin-syllable': 4,
    'initial-exact': 3,
    'initial-prefix': 2,
    'initial-contains': 1,
};

function buildIndexedPinyinSegments(title: string): IndexedPinyinSegment[] {
    const titleChars = Array.from(title);
    const pinyinChars = pinyin(title, { toneType: 'none', type: 'array' });
    const segments: IndexedPinyinSegment[] = [];
    let fullPosition = 0;
    let initialPosition = 0;

    titleChars.forEach((char, index) => {
        const full = normalizeTextKey(pinyinChars[index] ?? char) || normalizeTextKey(char);
        if (!full)
            return;

        const initial = full[0] ?? '';
        const fullStart = fullPosition;
        const initialStart = initialPosition;
        fullPosition += full.length;
        initialPosition += initial ? 1 : 0;

        segments.push({
            titleStart: index,
            titleEnd: index + 1,
            fullStart,
            fullEnd: fullPosition,
            initialStart,
            initialEnd: initialPosition,
            full,
            initial,
        });
    });

    return segments;
}

function titleRangeFromIndexedSpan(
    segments: IndexedPinyinSegment[],
    start: number,
    end: number,
    key: 'full' | 'initial',
): MatchRange | undefined {
    const startKey = key === 'full' ? 'fullStart' : 'initialStart';
    const endKey = key === 'full' ? 'fullEnd' : 'initialEnd';
    const matchedSegments = segments.filter(segment => segment[endKey] > start && segment[startKey] < end);

    if (matchedSegments.length === 0)
        return undefined;

    return {
        start: matchedSegments[0]!.titleStart,
        end: matchedSegments[matchedSegments.length - 1]!.titleEnd,
    };
}

function getTitleLength(title: string): number {
    return Array.from(title).length;
}

function findDirectTitleMatchRanges(title: string, query: string): MatchRange[] | undefined {
    const titleChars = Array.from(title);
    const queryChars = Array.from(query.trim());
    if (queryChars.length === 0 || queryChars.length > titleChars.length)
        return undefined;

    const normalizedQuery = normalizeTextKey(queryChars.join(''));
    const ranges: MatchRange[] = [];

    for (let i = 0; i <= titleChars.length - queryChars.length; i++) {
        const candidate = normalizeTextKey(titleChars.slice(i, i + queryChars.length).join(''));
        if (candidate !== normalizedQuery)
            continue;

        ranges.push({ start: i, end: i + queryChars.length });
        i += queryChars.length - 1;
    }

    return ranges.length > 0 ? ranges : undefined;
}

function classifyDirectTitleMatch(title: string, query: string): CommandSearchTextMatchInfo | undefined {
    const normalizedTitle = normalizeTextKey(title);
    const normalizedQuery = normalizeTextKey(query);
    const ranges = findDirectTitleMatchRanges(title, normalizedQuery);

    if (!normalizedQuery || !ranges)
        return undefined;

    let kind: CommandSearchMatchKind;
    if (normalizedTitle === normalizedQuery) {
        kind = 'direct-exact';
    }
    else if (normalizedTitle.startsWith(normalizedQuery)) {
        kind = 'direct-prefix';
    }
    else {
        kind = 'direct-contains';
    }

    return {
        kind,
        matchLevel: 3,
        position: ranges[0]!.start,
        titleLength: getTitleLength(title),
        ranges,
    };
}

function classifyFullPinyinTitleMatch(title: string, query: string): CommandSearchTextMatchInfo | undefined {
    const normalizedQuery = normalizeTextKey(query);
    if (!normalizedQuery)
        return undefined;

    const segments = buildIndexedPinyinSegments(title);
    const fullText = segments.map(segment => segment.full).join('');
    if (!fullText)
        return undefined;

    let matchedStart: number | undefined;
    let matchedTitlePosition = 0;
    for (const segment of segments) {
        if (!fullText.startsWith(normalizedQuery, segment.fullStart))
            continue;

        matchedStart = segment.fullStart;
        matchedTitlePosition = segment.titleStart;
        break;
    }

    if (matchedStart === undefined)
        return undefined;

    const range = titleRangeFromIndexedSpan(segments, matchedStart, matchedStart + normalizedQuery.length, 'full');
    if (!range)
        return undefined;

    let kind: CommandSearchMatchKind;
    if (fullText === normalizedQuery) {
        kind = 'pinyin-exact';
    }
    else if (matchedStart === 0) {
        kind = 'pinyin-prefix';
    }
    else {
        kind = 'pinyin-syllable';
    }

    return {
        kind,
        matchLevel: 2,
        position: matchedTitlePosition,
        titleLength: getTitleLength(title),
        ranges: [range],
    };
}

function classifyInitialTitleMatch(title: string, query: string): CommandSearchTextMatchInfo | undefined {
    const normalizedQuery = normalizeTextKey(query);
    if (!normalizedQuery)
        return undefined;

    const segments = buildIndexedPinyinSegments(title);
    const initials = segments.map(segment => segment.initial).join('');
    const index = initials.indexOf(normalizedQuery);

    if (index < 0)
        return undefined;

    const range = titleRangeFromIndexedSpan(segments, index, index + normalizedQuery.length, 'initial');
    if (!range)
        return undefined;

    let kind: CommandSearchMatchKind;
    if (initials === normalizedQuery) {
        kind = 'initial-exact';
    }
    else if (index === 0) {
        kind = 'initial-prefix';
    }
    else {
        kind = 'initial-contains';
    }

    return {
        kind,
        matchLevel: 1,
        position: range.start,
        titleLength: getTitleLength(title),
        ranges: [range],
    };
}

function classifyTitleMatch(title: string, query: string): CommandSearchTextMatchInfo | undefined {
    return classifyDirectTitleMatch(title, query)
        ?? classifyFullPinyinTitleMatch(title, query)
        ?? classifyInitialTitleMatch(title, query);
}

function calculateCommandSearchScore(
    match: CommandSearchTextMatchInfo,
    input: CommandSearchTextRankInput,
): number {
    const kindWeight = MATCH_KIND_WEIGHT[match.kind];
    const positionScore = Math.max(0, 999 - Math.min(match.position, 999));
    const lengthScore = Math.max(0, 999 - Math.min(match.titleLength, 999));
    const scoreBase = Math.max(0, Math.min(input.scoreBase, 999));
    const featureOrder = Math.max(0, Math.min(input.featureOrder ?? 0, 999));
    const triggerIndex = Math.max(0, Math.min(input.triggerIndex ?? 0, 999));

    return kindWeight * 1_000_000_000_000
        + positionScore * 1_000_000_000
        + lengthScore * 1_000_000
        + scoreBase * 1_000
        - featureOrder * 10
        - triggerIndex;
}

export function findTitleMatchRanges(title: string, query: string): MatchRange[] | undefined {
    return classifyTitleMatch(title, query)?.ranges;
}

function classifyCommandSearchTextMatch(input: CommandSearchTextMatchInput): CommandSearchTextMatchInfo | undefined {
    const normalizedQuery = normalizeTextKey(input.query);
    const normalizedSearchText = normalizeTextKey(input.searchText);
    if (!normalizedQuery || !normalizedSearchText.includes(normalizedQuery))
        return undefined;

    const sourceText = input.sourceText?.trim();

    if (input.matchLevel === 3)
        return classifyDirectTitleMatch(sourceText || input.searchText, normalizedQuery);

    if (!sourceText)
        return undefined;

    if (input.matchLevel === 2)
        return classifyFullPinyinTitleMatch(sourceText, normalizedQuery);

    return classifyInitialTitleMatch(sourceText, normalizedQuery);
}

export function rankCommandSearchTextMatch(input: CommandSearchTextRankInput): CommandSearchTextRank | undefined {
    const match = classifyCommandSearchTextMatch(input);
    if (!match)
        return undefined;

    return {
        ...match,
        score: calculateCommandSearchScore(match, input),
    };
}

export function doesCommandSearchTextMatch(input: CommandSearchTextMatchInput): boolean {
    return classifyCommandSearchTextMatch(input) !== undefined;
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
            label: cmd.trim(),
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
