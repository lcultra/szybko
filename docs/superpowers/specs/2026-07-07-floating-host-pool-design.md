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
├── hosts: Map<string, RuntimeHost>          ← 所有已知 host（leased + idle）
├── floatingPool: FloatingRuntimeHost[]      ← 空闲池（最多 2）
├── poolCounter = 0                          ← 递增 ID 生成
│
├── acquireFloatingHost(): FloatingRuntimeHost
├── releaseFloatingHost(host): void
└── scheduleReplenish(): void              ← 后台补充
```

**池大小 = 2**，无 target/max 二元概念：

| 动作 | 条件 | 行为 |
|------|------|------|
| acquire | 池非空 | pop 并返回，池 -1 |
| acquire | 池空 | `new FloatingRuntimeHost()`（有延迟） |
| release | 池 < 2 | push 并 hide，池 +1 |
| release | 池 ≥ 2 | `host.dispose()` 销毁 |
| replenish | 池 < 2 | 补到 2 |

### 2. 生命周期

```
                         acquire()
                  ┌──────────────────┐
  idle pool       │  [Host-A]        │ (预创建 BrowserWindow，show: false)
  (max 2)         │  [Host-B]        │
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
                  ├── yes → push，hide
                  └── no  → dispose()  ← 不触发 beforeunload
```

#### acquire() 时序

1. 池非空 → pop 取出，直接使用（零延迟）
2. 池空 → `new FloatingRuntimeHost("floating-pool-${counter++}", preloadPath)`（有延迟）
3. 取出后池 < 2 → `setImmediate` 调用 `scheduleReplenish()`

#### release() 时序

1. 池 < 2 → `host.detach()`（remove view + hide window + 重置状态），push 存入池
2. 池 ≥ 2 → `host.dispose()`（`window.destroy()`，不触发 beforeunload + 从 registry 注销）

#### scheduleReplenish() 时序

```ts
private replenishing = false;

scheduleReplenish(): void {
    if (this.replenishing) return;
    this.replenishing = true;
    setImmediate(() => {
        this.replenishing = false;
        while (this.floatingPool.length < 2) {
            const host = this.createFloatingHost();
            host.preloadWindow();  // show: false，floating.html 加载完成后再存池
            this.floatingPool.push(host);
        }
    });
}
```

`replenishing` 守卫防止并发多次 setImmediate 导致补充超量。

### 3. 预创建窗口

补充时调用 `FloatingRuntimeHost.preloadWindow()`：

```ts
class FloatingRuntimeHost {
    preloadWindow(): void {
        const placeholderMeta: HostMeta = {
            runtimeId: '', pluginId: '', featureExplain: '', cmdLabel: '',
        };
        this.createWindow(placeholderMeta);  // 含 show: false
        // 窗口已创建、floating.html 加载中，保持隐藏
    }
}
```

`createWindow()` 的 `BrowserWindow` 参数加 `show: false`，只在 `attach()` 最后调用 `show()`。

### 4. Slot 更新机制

从池取出复用时，浮动窗口的 `BrowserWindow` 已存在且加载了占位 slot。需要把真实 slot 推过去。

做法：IPC main → floating renderer，新增通道 `floating:slot-update`。

```ts
// packages/shared/src/ipc/channels.ts → FLOATING_SLOT_UPDATE
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
    this.window!.show();              // show: false 创建的窗口在此才显示
}
```

#### 防丢事件：Pending Slot 缓存

如果 `floating.html` 的 React 初始化还没完成（IPC listener 未注册），`webContents.send()` 会静默丢弃。修复：始终缓存最新 slot，配合 `did-finish-load` 补发。

```ts
class FloatingRuntimeHost {
    private pendingSlot: RuntimeSlot | null = null;

    preloadWindow(): void {
        // ... create window with show:false ...
        this.window!.webContents.on('did-finish-load', () => {
            if (this.pendingSlot) {
                this.window!.webContents.send(IPC.FLOATING_SLOT_UPDATE, this.pendingSlot);
            }
        });
    }

    attach(view, meta): void {
        this.currentMeta = meta;
        if (!this.window) {
            this.createWindow(meta);
        } else {
            this.pushSlotUpdate(meta);
        }
        // ... attach view + show ...
    }

    private pushSlotUpdate(meta: HostMeta): void {
        const slot: RuntimeSlot = { ... };
        this.pendingSlot = slot;
        if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send(IPC.FLOATING_SLOT_UPDATE, slot);
        }
    }
}
```

浮动渲染器侧监听：

```ts
// FloatingApp.tsx
useEffect(() => {
    return window.szybkoInternal.onFloatingSlotUpdate((slot) => {
        setSlot(slot);
        // runtimeId 变化 → PluginHeader 的 pin state 自动重置
    });
}, []);
```

API 命名为 `window.szybkoInternal.onFloatingSlotUpdate`（在 `SzybkoInternalApi` 接口中声明）。

### 5. dispose() — 静默销毁（不触发 beforeunload）

池 eviction 时销毁窗口**不应**触发 `beforeunload`，否则 `FloatingApp` 的 handler 会误 destroy runtime。

```ts
class FloatingRuntimeHost {
    /** 池 eviction 用：强制销毁，不触发 beforeunload */
    dispose(): void {
        if (this.window) {
            this.window.removeAllListeners();
            this.window.destroy();   // ← 不触发 beforeunload/close 事件
        }
        this.window = null;
        this.view = null;
        this.currentMeta = null;
        this.pendingSlot = null;
    }

    /** 用户关闭用：正常关闭，触发 beforeunload */
    close(): void {
        if (this.window) {
            this.window.removeAllListeners();
            this.window.close();     // ← 触发 beforeunload
        }
        this.window = null;
        this.view = null;
        this.currentMeta = null;
        this.pendingSlot = null;
    }
}

// FloatingRuntimeHost.dispose() 中同时从 registry 注销：
//   registry.unregisterHost(this.id);
```

`close()` 与 `dispose()` 的语义差异：

| 方法 | Electron API | 触发 beforeunload | 使用场景 |
|------|-------------|------------------|---------|
| `close()` | `window.close()` | **是** | 用户点击关闭按钮 → `destroyRuntime` |
| `dispose()` | `window.destroy()` | **否** | 池 eviction、静默回收 |

### 6. 状态重置

Host 侧 release 时重置：

```ts
// FloatingRuntimeHost.detach() 中补充：
detach(): void {
    // ... existing: removeChildView + hide ...
    this.setAlwaysOnTop(false);           // 重置置顶
    this.pendingSlot = null;
}
```

Renderer 侧，PluginHeader 的 pin state 随 `runtimeId` 变化自动重置：

```tsx
// PluginHeader.tsx
export function PluginHeader({ hostType }: PluginHeaderProps) {
    const activeRuntimeId = useRuntimeStore(s => s.slot.runtimeId);
    const [pinned, setPinned] = useState(false);

    // runtimeId 变化时重置 pin 状态
    useEffect(() => {
        setPinned(false);
    }, [activeRuntimeId]);
}
```

### 7. Registry — Host ID 与所有权

```ts
class RuntimeHostRegistry {
    private static nextId = 0;

    createFloatingHost(): FloatingRuntimeHost {
        const id = `floating-pool-${RuntimeHostRegistry.nextId++}`;
        const host = new FloatingRuntimeHost(id, this.hostPreloadPath);
        this.hosts.set(host.id, host);
        return host;
    }

    // dispose() 中自动注销:
    //   this.hosts.delete(host.id);
    //   this.floatingPool = this.floatingPool.filter(h => h !== host);
}
```

递增计数器替代 `Date.now()`，避免同毫秒创建冲突。`dispose()` 时从 `hosts` Map 中删除。

### 8. Coordinator 对接

```ts
// RuntimeCoordinator
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
        : this.hostRegistry.acquireFloatingHost();

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
| `hosts/floating-runtime-host.ts` | 加 `preloadWindow()`、`dispose()`、`pushSlotUpdate()` + `pendingSlot` 缓存；`createWindow()` 参数加 `show: false`；`detach()` 加 `setAlwaysOnTop(false)` 重置 |
| `runtime-host-registry.ts` | 加池：`acquireFloatingHost()`、`releaseFloatingHost()`、`scheduleReplenish()`；ID 改递增计数器；`release` 池满时调 `host.dispose()` |

### Host 侧 — `packages/host/src/runtime/`

| 文件 | 改动 |
|------|------|
| `runtime-coordinator.ts` | `moveToHost()`: `createFloatingHost()` → `acquireFloatingHost()`；加 release 逻辑 |

### 渲染器侧 — `apps/desktop/src/`

| 文件 | 改动 |
|------|------|
| `preload/host.ts` | 暴露 `onFloatingSlotUpdate`（`on(IPC.FLOATING_SLOT_UPDATE)`） |
| `renderer/components/plugin/PluginHeader.tsx` | `useEffect` 监听 `activeRuntimeId` 变化重置 `pinned` state |
| `renderer/pages/floating/FloatingApp.tsx` | 加 `onFloatingSlotUpdate` 监听；IPC slot 覆盖 URL param 初始值 |

### 类型侧

| 文件 | 改动 |
|------|------|
| `packages/shared/src/api/internal.ts` | `SzybkoInternalApi` 加 `onFloatingSlotUpdate` 声明 |
| `apps/desktop/src/renderer/global.d.ts` | 同步更新类型声明 |

## 使用场景推演

### 场景 1：顺序分离不同插件

```
操作                                 池状态
───                                  ──
Cmd+D 分离 A                         [] → acquire 池空，新建（有延迟）
→ 后台补充                           [H1(preloaded)]
合并 A → launcher                    [H1, A] → release，池 < 2 存入
Cmd+D 分离 B                         [A] → acquire H1，零延迟！
→ 后台补充                           [H1(preloaded), H2(preloaded)]
合并 B → launcher                    [H1, H2] → release，池 = 2 存入
```

### 场景 2：并发浮动多个插件

```
Cmd+D 分离 A                         [] → 新建（有延迟）
Cmd+D 分离 B（从 launcher）           [] → 池仍未补充，新建（有延迟）
→ 后台补充                           [H1(preloaded), H2(preloaded)]
```

并发时前两次分离仍有延迟。但后续分离/合并循环进入稳态后全部零延迟。

### 场景 3：池满 eviction

```
池态: [H1, H2]（idle）
release Host-C → 池 ≥ 2 → Host-C.dispose()   ← 不触发 beforeunload
池态: [H1, H2]（不变）
```

## 风险与边界

- **IPC 时序**：`pendingSlot` + `did-finish-load` 双重保证，消息不会丢
- **空闲窗口资源**：最多保留 2 个隐藏 `BrowserWindow`（`show: false`），每个加载了 React 应用。约等价于多开了 2 个空白标签页的开销
- **close/dispose 分离**：`close()` 触发 `beforeunload`（用户关窗），`dispose()` 调用 `window.destroy()`（池 eviction），语义明确不互扰
- **Renderer 状态**：`runtimeId` 变化时 `pinned` state 自动重置；`alwaysOnTop` 在 `detach()` 中归零
