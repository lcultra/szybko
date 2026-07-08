export type LoadState = 'loading' | 'loaded' | 'error';
export type MountState = 'attached' | 'detached' | 'hidden';

/** Runtime metadata — pure domain, no Electron types */
export interface RuntimeInfo {
  id: string;
  pluginId: string;
  created: number;
  loadState: LoadState;
  mountState: MountState;
}

export interface RuntimeSlot {
  runtimeId: string;
  hostId: string | null;
  order: number;
}
