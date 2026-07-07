# 插件生命周期 API 重构

> 删除 `onRuntimeStateChanged`，新增插件侧 `onPluginDetach` 和宿主侧 `onPluginSlotChanged`。

**日期**: 2026-07-07
**状态**: 设计稿
**涉及包**: `@szybko/shared`, `@szybko/host`, `apps/desktop`, `@szybko/sdk`

---

## 1. 动机

当前 `onRuntimeStateChanged` / `PLUGIN_RUNTIME_STATE` 是一个过度泛化的抽象：

- **`state: string` 字段与 `mountState` 完全冗余**，且未收敛为枚举，存在拼写风险。
- **唯一消费者**是 host renderer 的 `usePluginRuntime` hook，用于切换插件的进入/离开 UI 状态——被 `onPluginSlotChanged` 替代。
- **插件侧无人消费**该事件，保留它只是多余的 IPC 流量。
- **`RuntimeStatePublisher`** 整个模块只有一个用途：发送这个没人真正需要的广播。

与此同时，`PLUGIN_OUT` 只在带 reason 时才发送给插件——当插件被**移动**（如 launcher → floating）时，`detachFromHost()` 被调用但不带 reason，插件完全收不到通知。这是一个能力缺口。

---

## 2. 设计

### 2.1 删除

| 构件 | 类型 | 说明 |
|---|---|---|
| `IPC.PLUGIN_RUNTIME_STATE` | channel 常量 | 废弃 |
| `RuntimeStatePayload` | interface | 废弃 |
| `IpcMainToRendererEventContract[IPC.PLUGIN_RUNTIME_STATE]` | 合约映射 | 废弃 |
| `RuntimeStatePublisher` | 整个 class | 唯一职责是发上述事件 |
| `RuntimeManager.publishState()` | 方法 | 唯一调用方 |
| `SzybkoPluginApi.onRuntimeStateChanged` | API 类型 | 无消费方 |
| `SzybkoInternalApi.onRuntimeStateChanged` | API 类型 | 被 `onPluginSlotChanged` 替代 |
| `SzybkoPluginSDK.onRuntimeStateChanged` | API 类型 | 被 `onPluginDetach` 替代 |

### 2.2 新增：宿主侧 `onPluginSlotChanged`

宿主主进程 → host renderer，通知 launcher slot 被占据或腾空。

```typescript
// packages/shared/src/ipc/channels.ts
PLUGIN_SLOT_CHANGED: 'plugin:slot-changed',

// packages/shared/src/ipc/contract.ts — payload 复用 RuntimeSlot
// IpcMainToRendererEventContract[IPC.PLUGIN_SLOT_CHANGED]: RuntimeSlot

// packages/shared/src/api/internal.ts
onPluginSlotChanged: (cb: (slot: RuntimeSlot) => void) => () => void;
```

**Payload** — `RuntimeSlot`（`packages/shared/src/runtime/types.ts`，已有）：

```typescript
interface RuntimeSlot {
  runtimeId: string | null;
  pluginId: string | null;
  featureExplain: string;
  cmdLabel: string;
  loadState: LoadState;
  mountState: MountState;   // 'attached' | 'detached'
  iconUrl?: string;
}
```

**发送时机：**
- `RuntimeManager.attachToHost(host)` → **仅当 `host.type === 'launcher'`** 时，向主窗口发送 `mountState: 'attached'`
- `RuntimeManager.detachFromHost()` → **仅当原来的 host 是 launcher** 时，向主窗口发送 `mountState: 'detached'`（floating slot 的变更走 `FLOATING_SLOT_UPDATE`，不走这里）

**Detached slot 的 payload 约定：**
slot 被腾空时，发送一个全字段为空的 `RuntimeSlot`，表示"无插件":

```typescript
const emptySlot: RuntimeSlot = {
  runtimeId: null,
  pluginId: null,
  featureExplain: '',
  cmdLabel: '',
  loadState: 'loaded',
  mountState: 'detached',
  iconUrl: undefined,
};
```

建议在 `RuntimeManager` 中用一个辅助方法或常量构造此对象。

**窗口销毁保护：**
发送前必须检查窗口是否存在，保持和原 `RuntimeStatePublisher` 一致的防御：

```typescript
const win = this.windowManager.getWindow();
if (!win || win.isDestroyed()) return;
```

### 2.3 新增：插件侧 `onPluginDetach`

宿主主进程 → 插件 webContents，通知插件正在被从宿主分离（无论原因）。

```typescript
// packages/shared/src/ipc/channels.ts
PLUGIN_DETACH: 'plugin:detach',

// packages/shared/src/ipc/contract.ts
export interface PluginDetachPayload {
  runtimeId: string;
  pluginId: string;
  reason: 'move' | 'hide' | 'destroy';
}

// IpcMainToRendererEventContract[IPC.PLUGIN_DETACH]: PluginDetachPayload

// packages/shared/src/api/plugin.ts
onPluginDetach: (cb: (payload: PluginDetachPayload) => void) => () => void;

// packages/sdk/src/types/api.d.ts — 同上
```

**语义：**
- `reason: 'move'` — 从当前 host 移动到另一个 host（无 `PLUGIN_OUT` 跟随）
- `reason: 'hide'` — 隐藏，之后会跟一个 `PLUGIN_OUT`（向后兼容）
- `reason: 'destroy'` — 销毁，之后会跟一个 `PLUGIN_OUT`

**发送时机：** `RuntimeManager.detachFromHost()` **总是发送**，不再只在有 reason 时才通知插件。

### 2.4 保留不动

- **`PLUGIN_ENTER` / `onPluginEnter`** — 不变，仍是插件进入时发往插件 webContents
- **`PLUGIN_OUT` / `onPluginOut`** — 不变，hide/destroy 时仍发送

---

## 3. 时序

```
attachToHost(runtimeId, host)                 // host.type === 'launcher' 时才发
  → plugin.webContents.send(PLUGIN_ENTER, { pluginId, code, type, payload, from, ... })
  → mainWin.webContents.send(PLUGIN_SLOT_CHANGED, { mountState: 'attached', runtimeId, pluginId, ... })

detachFromHost(runtimeId, oldHost?)           // 仅 oldHost.type === 'launcher' 时才发
  → plugin.webContents.send(PLUGIN_DETACH, { reason: 'move' })
  → mainWin.webContents.send(PLUGIN_SLOT_CHANGED, emptySlot)  // runtimeId: null, pluginId: null

detachFromHost(runtimeId, 'hide', oldHost?)   // 仅 oldHost.type === 'launcher' 时才发
  → plugin.webContents.send(PLUGIN_DETACH, { reason: 'hide' })
  → plugin.webContents.send(PLUGIN_OUT, { reason: 'hide' })
  → mainWin.webContents.send(PLUGIN_SLOT_CHANGED, emptySlot)

detachFromHost(runtimeId, 'destroy', oldHost?) // 仅 oldHost.type === 'launcher' 时才发
  → plugin.webContents.send(PLUGIN_DETACH, { reason: 'destroy' })
  → plugin.webContents.send(PLUGIN_OUT, { reason: 'destroy' })
  → mainWin.webContents.send(PLUGIN_SLOT_CHANGED, emptySlot)
```

---

## 4. 消费者变更

### Host renderer: `usePluginRuntime`

`apps/desktop/src/renderer/hooks/usePluginRuntime.ts` —— 从订阅 `onRuntimeStateChanged` 改为订阅 `onPluginSlotChanged`：

```typescript
useEffect(() => {
  const cleanup = window.szybkoInternal?.onPluginSlotChanged?.((slot) => {
    if (slot.mountState === 'attached') {
      setSlot({
        runtimeId: slot.runtimeId ?? '',
        pluginId: slot.pluginId ?? '',
        featureExplain: slot.featureExplain,
        cmdLabel: slot.cmdLabel,
        loadState: slot.loadState,
        mountState: slot.mountState,
        iconUrl: slot.iconUrl ?? '',
      });
      setAppState('plugin');
    } else {
      clearSlot();
      setAppState('idle');
    }
  });
  return () => cleanup?.();
}, []);
```

### Host preload

`apps/desktop/src/preload/host.ts` —— 从 `onRuntimeStateChanged` 换为 `onPluginSlotChanged`，添加在 `szybkoInternal` 上。

### Plugin preload

`apps/desktop/src/preload/api/plugin-lifecycle.ts` —— 替换 `onRuntimeStateChanged` 为 `onPluginDetach`。插件的 `szybko` API 获得：

```typescript
{
  onPluginEnter,
  onPluginDetach,    // 新增
  onPluginOut,
}
```

---

## 5. RuntimeManager 改造

### 删除

- `RuntimeStatePublisher` 依赖（constructor 参数）
- `statePublisher` 字段
- `publishState()` 方法
- `RuntimeManager` 不再 import `RuntimeStatePublisher`

### slot 通知（替代 publishState）

在 `attachToHost()` 和 `detachFromHost()` 中，**仅当涉及 launcher host 时**发送 `PLUGIN_SLOT_CHANGED` 到主窗口：

```typescript
// 在 attachToHost() 中：
if (host.type === 'launcher') {
  const win = this.windowManager.getWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(IPC.PLUGIN_SLOT_CHANGED, {
    runtimeId: entry.runtime.info.id,
    pluginId: entry.runtime.info.pluginId,
    featureExplain,
    cmdLabel,
    loadState: entry.runtime.info.loadState,
    mountState: 'attached',
    iconUrl,
  });
}

// 在 detachFromHost() 中：
const currentHost = this.hostAttacher.getHostFor(runtimeId);
// ...现有 detach 逻辑...
if (currentHost?.type === 'launcher') {
  const win = this.windowManager.getWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(IPC.PLUGIN_SLOT_CHANGED, EMPTY_SLOT);
}
```

其中 `EMPTY_SLOT` 是一个预定义的 `RuntimeSlot` 常量：

```typescript
private readonly EMPTY_SLOT: RuntimeSlot = {
  runtimeId: null,
  pluginId: null,
  featureExplain: '',
  cmdLabel: '',
  loadState: 'loaded',
  mountState: 'detached',
};
```

### 新增 detach 通知

在 `detachFromHost()` 中，总是发送 `PLUGIN_DETACH`：

```typescript
// 总是发送
entry.runtime.webContents.send(IPC.PLUGIN_DETACH, {
  runtimeId: entry.runtime.info.id,
  pluginId: entry.runtime.info.pluginId,
  reason: reason ?? 'move',        // 无 reason → move
});

// 有 reason 时，仍向后兼容发 PLUGIN_OUT
if (reason) {
  entry.runtime.webContents.send(IPC.PLUGIN_OUT, {
    runtimeId: entry.runtime.info.id,
    pluginId: entry.runtime.info.pluginId,
    reason,
  });
}
```

---

## 6. 边界情况

| 场景 | 行为 |
|---|---|
| 插件从不响应 `onPluginDetach` | 无影响，事件丢失不阻塞后续流程 |
| `moveToHost()` 调用 `detachFromHost` 无 reason | 插件收到 `PLUGIN_DETACH { reason: 'move' }`，无 `PLUGIN_OUT`，然后收到新的 `PLUGIN_ENTER` |
| `hideRuntime()` / `destroyRuntime()` | 插件收到 `PLUGIN_DETACH` + `PLUGIN_OUT`，兼容老监听方 |
| 主窗口关闭后收到 slot 通知 | `!win || win.isDestroyed()` 守卫会跳过发送 |

---

## 7. 涉及文件清单

```
M  packages/shared/src/ipc/channels.ts
M  packages/shared/src/ipc/contract.ts
M  packages/shared/src/api/internal.ts
M  packages/shared/src/api/plugin.ts
M  packages/sdk/src/types/api.d.ts
M  apps/desktop/src/preload/api/plugin-lifecycle.ts
M  apps/desktop/src/preload/host.ts
M  apps/desktop/src/renderer/hooks/usePluginRuntime.ts
D  packages/host/src/runtime/runtime-state-publisher.ts
M  packages/host/src/runtime/runtime-manager.ts
M  packages/host/src/index.ts                  # 删 RuntimeStatePublisher 导出
```
