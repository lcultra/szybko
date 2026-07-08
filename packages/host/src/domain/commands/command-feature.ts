import type { PluginFeature } from '@szybko/shared';

export interface NormalizedFeature {
  code: string;
  label: string;
  description?: string;
  icon?: string;
  order: number;
}

/**
 * Normalize a PluginFeature into a domain NormalizedFeature.
 * Uses an intersection type to allow fields not yet on PluginFeature (label, description, order).
 */
export function normalizeFeature(
  feature: PluginFeature & { label?: string; description?: string; order?: number },
  index: number,
): NormalizedFeature {
  return {
    code: feature.code,
    label: feature.label ?? feature.code,
    description: feature.description,
    icon: feature.icon,
    order: feature.order ?? index,
  };
}

export function stableJson(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}
