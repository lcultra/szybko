import type { LoadState, MountState } from '@szybko/shared';

export type HostType = 'launcher' | 'floating';

/** 当前激活的插件运行时快照 */
export interface RuntimeSlot {
    runtimeId: string | null;
    pluginId: string | null;
    pluginName: string;
    featureExplain: string;
    loadState: LoadState;
    mountState: MountState;
}
