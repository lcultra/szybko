import type { MatchRange } from '@szybko/shared';

interface HighlightedTextProps {
    text: string;
    ranges?: MatchRange[];
}

/**
 * 按 match ranges 拆分文本为普通 + 高亮片段。
 * 使用 Array.from 正确处理多字节字符。
 */
export function HighlightedText({ text, ranges }: HighlightedTextProps) {
    if (!ranges || ranges.length === 0) {
        return <>{text}</>;
    }

    const chars = Array.from(text);
    const isHighlighted: boolean[] = Array.from({ length: chars.length }).fill(false) as boolean[];
    for (const { start, end } of ranges) {
        for (let i = start; i < end && i < chars.length; i++) {
            isHighlighted[i] = true;
        }
    }

    const parts: Array<{ text: string; highlight: boolean }> = [];
    let current: { text: string; highlight: boolean } | null = null;

    for (let i = 0; i < chars.length; i++) {
        const hl = isHighlighted[i];
        if (!current || current.highlight !== hl) {
            current = { text: '', highlight: hl };
            parts.push(current);
        }
        current.text += chars[i];
    }

    return (
        <>
            {parts.map((part, i) =>
                part.highlight
                    ? <span key={i} className="font-semibold text-primary">{part.text}</span>
                    : <span key={i}>{part.text}</span>,
            )}
        </>
    );
}
