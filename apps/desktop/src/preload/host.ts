import type { SzybkoInternalApi } from '@szybko/shared';
import { contextBridge } from 'electron';
import { createExecuteApi } from './api/execute';
import { createPluginLifecycleApi } from './api/plugin-lifecycle';
import { createSearchApi } from './api/search';
import { createThemeApi } from './api/theme';
import { createWindowApi } from './api/window';

const { onRuntimeStateChanged } = createPluginLifecycleApi();

const internalApi = {
    ...createSearchApi(),
    ...createWindowApi(),
    ...createThemeApi(),
    ...createExecuteApi(),
    onRuntimeStateChanged,
} satisfies SzybkoInternalApi;

contextBridge.exposeInMainWorld('szybkoInternal', internalApi);
