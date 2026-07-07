# Floating Host Pool — 浮动窗口池化设计

## 背景

每次分离插件到浮动窗口时，`FloatingRuntimeHost` 都新建一个 `BrowserWindow` 并加载 `floating.html`（完整 React 应用初始化），产生肉眼可见的延迟。用户反复分离/合并不同插件时，每次都要等窗口创建。

本设计通过**池化复用**已有浮动窗口，消除重复创建开销。

## 目标

- 非首次分离零延迟（无 `new BrowserWindow`、无 `loadFile`）
- 支持同时存在多个浮动窗口
- 池大小可控，不泄漏资源
- 与现有 RuntimeHost 架构兼容，改动最小

## 设计

### 1. 池结构

池由 `RuntimeHostRegistry` 管理，维护一个空闲 `FloatingRuntimeHost[]` 列表：

```
RuntimeHostRegistry
├── hosts: Map<string, RuntimeHost>          ← 所有活跃 host
├── floatingPool: FloatingRuntimeHost[]      ← 空闲池（max 3）
│
├── acquireFloatingHost(): FloatingRuntimeHost
├── releaseFloatingHost(host): void
└── scheduleReplenish(): void              ← 后台补充
```

| 参数 | 值 | 理由 |
|------|----|------|
| 池目标大小 | 2 | 覆盖偶发并发分离前 2 次 |
| 池上限 (maxSize) | 3 | 限制空闲窗口数，释放资源 |

### 2. 生命周期

```
                         acquire()
                  ┌──────────────────┐
  idle pool       │  [Host-A]        │ (预创建了 BrowserWindow，隐藏)
  (max 3)         │  [Host-B]        │
                  └─────────┬────────┘
                            │ 取出
                            ▼
  ┌──────────────────────────────────┐
  │  正在使用（显示某个插件）          │
  │  Host-C: show(), view attached   │
  └──────────────────────────────────┘
                            │
               release() ←──┤ 合并回 launcher
                            │
                  ┌────────┴────────┐
                  │ 池 < 2?         │
                  ├── yes → 存入池  │
                  └── no  → close() │
```

- **acquire()** — 池中有空闲 → 取出复用；池空 → `new FloatingRuntimeHost()`（回退到当前行为）
- **release()** — 池未满 → `host.detach()`（remove view + hide window），推入 idle；池满 → `host.close()` 销毁
- **补充** — `acquire()` 取出后池 < 目标值 2，`setImmediate` 异步创建一个补上，补的 host 预创建 `BrowserWindow` + 加载 `floating.html`

### 3. 预创建窗口

补充时调用 `FloatingRuntimeHost.preloadWindow()`：

```ts
class FloatingRuntimeHost {
    preloadWindow(): void {
        // 用一个空 meta 创建 BrowserWindow，加载 floating.html
        // 窗口保持隐藏，不 attach 任何插件视图
        const placeholderMeta: HostMeta = { runtimeId: '', pluginId: '', featureExplain: '', cmdLabel: '' };
        this.createWindow(placeholderMeta);
    }
}
```

`floating.html` 加载时拿到一个空 slot（`runtimeId: null`），渲染空标题栏。窗口隐藏，用户无感知。

### 4. Slot 更新机制

从池取出复用时，浮动窗口的 `BrowserWindow` 已存在且加载了占位 slot。需要把真实 slot 推过去。

做法：IPC main → floating renderer，新增通道 `floating:slot-update`。

```ts
// packages/shared/src/ipc/channels.ts
FLOATING_SLOT_UPDATE = 'floating:slot-update'

// packages/shared/src/ipc/contract.ts → IpcMainToRendererEventContract
[IPC.FLOATING_SLOT_UPDATE]: RuntimeSlot
```

在 `FloatingRuntimeHost.attach()` 中，如果 `this.window` 已存在（池场景），跳过 `createWindow()`，改为发 IPC：

```ts
attach(view, meta): void {
    this.currentMeta = meta;
    if (!this.window) {
        this.createWindow(meta);       // 首次创建
    } else {
        this.pushSlotUpdate(meta);     // 池复用 → IPC 更新
    }
    if (view) {
        this.view = view;
        this.window!.contentView.addChildView(view);
        this.relayout();
    }
    this.window!.show();
}

private pushSlotUpdate(meta: HostMeta): void {
    const slot = {
        runtimeId: meta.runtimeId,
        pluginId: meta.pluginId,
        featureExplain: meta.featureExplain,
        cmdLabel: meta.cmdLabel ?? '',
        loadState: 'loaded',
        mountState: 'attached',
    };
    this.window?.webContents.send(IPC.FLOATING_SLOT_UPDATE, slot);
}
```

浮动渲染器侧通过 `window.szybkoFloating.onSlotUpdate()` 监听并更新 `RuntimeStore`：

```ts
// FloatingApp.tsx
useEffect(() => {
    return window.szybkoFloating.onSlotUpdate((slot) => {
        setSlot(slot);
    });
}, []);
```

### 5. Coordinator 对接

`RuntimeCoordinator.moveToHost()` 改为使用池的 acquire/release：

```ts
moveToHost(runtimeId, targetType) {
    const currentHost = this.runtimeManager.getHostFor(runtimeId);

    if (currentHost) {
        this.runtimeManager.detachFromHost(runtimeId);

        // 从浮动移走 → 归还到池
        if (currentHost.type === 'floating') {
            this.hostRegistry.releaseFloatingHost(currentHost as FloatingRuntimeHost);
        }
    }

    const host = targetType === 'launcher'
        ? this.hostRegistry.getOrCreateLauncherHost()
        : this.hostRegistry.acquireFloatingHost();  // ← 从池取

    this.runtimeManager.attachToHost(runtimeId, host);
}
```

## 改动清单

### 基础设施 — `packages/shared/src/ipc/`

| 文件 | 改动 |
|------|------|
| `channels.ts` | 加 `FLOATING_SLOT_UPDATE = 'floating:slot-update'` |
| `contract.ts` | 在 `IpcMainToRendererEventContract` 中声明 `[IPC.FLOATING_SLOT_UPDATE]: RuntimeSlot` |

### Host 侧 — `packages/host/src/window/`

| 文件 | 改动 |
|------|------|
| `hosts/floating-runtime-host.ts` | 加 `preloadWindow()`、改造 `attach()` 的池复用路径、加 `pushSlotUpdate()` |
| `runtime-host-registry.ts` | 加 `pool` 相关方法：`acquireFloatingHost()`、`releaseFloatingHost()`、`scheduleReplenish()` |

### Host 侧 — `packages/host/src/runtime/`

| 文件 | 改动 |
|------|------|
| `runtime-coordinator.ts` | `moveToHost()` 中的 `createFloatingHost()` 改为 `acquireFloatingHost()`；加 release 逻辑 |

### 渲染器侧 — `apps/desktop/src/`

| 文件 | 改动 |
|------|------|
| `preload/host.ts` | 暴露 `onFloatingSlotUpdate`（用现有 `on()` helper） |
| `renderer/pages/floating/FloatingApp.tsx` | 加 `onFloatingSlotUpdate` 监听，IPC slot 覆盖 URL param 初始值 |

## 使用场景推演

### 场景 1：顺序分离不同插件

```
操作                                 池状态
───                                  ──
Cmd+D 分离 A                         [] → 新建池空，有延迟
→ 后台补充                           [H1(preloaded)]
合并 A → launcher                    [H1] ← release
Cmd+D 分离 B                         [] → acquire H1，零延迟！  
→ 后台补充                           [H2(preloaded)]
```

### 场景 2：并发浮动多个插件

```
Cmd+D 分离 A                         [] → 新建，有延迟
Cmd+D 分离 B（从 launcher）           [] → 新建，有延迟
→ 后台补充 H1, H2                    [H1, H2]
```

并发时池只覆盖到第二次。第三次起步仍有延迟，但可以通过补充的池覆盖后续操作。

### 场景 3：持续分离/合并

```
A→浮动 → A合并 → B→浮动             ← 从第二次起每次零延迟
→ B合并 → C→浮动 → C合并 → D→浮动   ← 池稳定在 H1 ↔ 使用中循环
```

## 风险与边界

- **IPC 时序**：`pushSlotUpdate()` 在 `show()` 前发送，浮动渲染器可能在下一 tick 才处理。空 slot 闪现时间极短（<1 frame），可接受
- **空闲窗口资源**：最多保留 3 个隐藏 `BrowserWindow`，每个加载了 React 应用。约等价于多开了 3 个空白标签页的开销
- **close 路径不变化**：用户主动关闭浮动窗口（`destroyRuntime`）仍然 `host.close()` 销毁，不进池
