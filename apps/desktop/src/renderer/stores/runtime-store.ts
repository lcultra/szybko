import type { RuntimeSlot } from '../types';
import { create } from 'zustand';

interface RuntimeStore {
    slot: RuntimeSlot;
    setSlot: (partial: Partial<RuntimeSlot>) => void;
    clearSlot: () => void;
}

const INITIAL_SLOT: RuntimeSlot = {
    runtimeId: null,
    pluginId: null,
    featureExplain: '',
    cmdLabel: '',
    loadState: 'loading',
    mountState: 'detached',
    iconUrl: '',
};

export const useRuntimeStore = create<RuntimeStore>(set => ({
    slot: INITIAL_SLOT,
    setSlot: partial => set(s => ({ slot: { ...s.slot, ...partial } })),
    clearSlot: () => set({ slot: INITIAL_SLOT }),
}));
