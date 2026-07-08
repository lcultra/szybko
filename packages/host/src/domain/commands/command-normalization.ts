import { createHash } from 'node:crypto';
import { stableJson } from './command-feature';

/** Generate pinyin search keys for Chinese text */
export function generatePinyinKeys(text: string): string[] {
  // Uses pinyin-pro library — this is a placeholder that returns the text as-is
  // Real implementation in command-projection-builder.ts
  return [text];
}

/** Hash a manifest for change detection */
export function hashManifest(manifest: { features?: unknown[] }): string {
  return createHash('sha256').update(stableJson(manifest.features ?? [])).digest('hex');
}

/** Compute override fingerprint */
export function computeOverrideFingerprint(overrides: Array<{ code: string; state?: string }>): string {
  return createHash('sha256')
    .update(stableJson(overrides.map(o => ({ code: o.code, state: o.state ?? 'active' }))))
    .digest('hex');
}

/** Deduplicate search entries — prefer cmd over alias, higher match level wins */
export function dedupSearchEntries(entries: Array<{ pluginId: string; featureCode: string; cmdKey: string; searchText: string; source: string; matchLevel: number; aliasId?: number | null }>): typeof entries {
  const seen = new Map<string, typeof entries[0]>();
  const sourcePrio = (s: string) => s === 'cmd' ? 1 : 2;

  for (const e of entries) {
    const key = `${e.pluginId}:${e.featureCode}:${e.cmdKey}:${e.searchText}`;
    const existing = seen.get(key);
    if (!existing) { seen.set(key, e); continue; }

    const curPrio = sourcePrio(e.source);
    const exPrio = sourcePrio(existing.source);
    if (curPrio < exPrio) { seen.set(key, e); continue; }
    if (curPrio > exPrio) continue;
    if (e.matchLevel > existing.matchLevel) { seen.set(key, e); continue; }
    if (e.matchLevel < existing.matchLevel) continue;
    if ((e.aliasId ?? 0) < (existing.aliasId ?? 0)) { seen.set(key, e); }
  }
  return [...seen.values()];
}
