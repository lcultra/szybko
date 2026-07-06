/**
 * 导航模型——将所有可见项视为一个整体，同时保留 section 之间的视觉空位。
 * useKeyboard 只消费 NavigationMap 中的 up/down/left/right 指针。
 */

export interface VisualCell {
    globalIndex: number;
    sectionId: string;
    row: number;
    col: number;
    colSpan: number;
}

export interface NavigationMap {
    currentCell: VisualCell;
    cells: VisualCell[];
    up: number | null;
    down: number | null;
    left: number | null;
    right: number | null;
}

/**
 * 根据每 section 的可见 items 数量和列数生成 VisualCell 网格。
 * 每个 section 独立占用自己的行块，section 末尾不足一行的空位会保留。
 * 导航方向键在可见项集合上移动：
 *   - left/right: 前一个/后一个（首尾循环）
 *   - up/down: 上一/下一视觉行同列（跨 section，首尾循环）
 */
export function buildNavigationMap(
    sectionItemCounts: Array<{ sectionId: string; count: number }>,
    columns: number,
    selectedIndex: number,
    _sectionOffsets: Array<{ sectionId: string; start: number; length: number }>,
): NavigationMap {
    const cells: VisualCell[] = [];
    let globalIdx = 0;
    let rowOffset = 0;

    for (const { sectionId, count } of sectionItemCounts) {
        for (let i = 0; i < count; i++) {
            cells.push({
                globalIndex: globalIdx,
                sectionId,
                row: rowOffset + Math.floor(i / columns),
                col: i % columns,
                colSpan: 1,
            });
            globalIdx++;
        }

        rowOffset += Math.ceil(count / columns);
    }

    const total = cells.length;
    const currentPosition = cells.findIndex(c => c.globalIndex === selectedIndex);
    const position = currentPosition === -1 ? 0 : currentPosition;
    const current = cells[position];
    if (!current) {
        return { currentCell: cells[0]!, cells, up: null, down: null, left: null, right: null };
    }

    const rows = [...new Set(cells.map(c => c.row))].sort((a, b) => a - b);
    const currentRowPosition = rows.indexOf(current.row);

    function findSameColumnInRow(direction: 1 | -1) {
        if (rows.length <= 1)
            return null;

        for (let step = 1; step < rows.length; step++) {
            const nextRow = rows[(currentRowPosition + direction * step + rows.length) % rows.length];
            const cell = cells.find(c => c.row === nextRow && c.col === current.col);
            if (cell)
                return cell.globalIndex;
        }

        return null;
    }

    const right = cells[(position + 1) % total]?.globalIndex ?? null;
    const left = cells[(position - 1 + total) % total]?.globalIndex ?? null;

    return {
        currentCell: current,
        cells,
        up: findSameColumnInRow(-1),
        down: findSameColumnInRow(1),
        left,
        right,
    };
}
