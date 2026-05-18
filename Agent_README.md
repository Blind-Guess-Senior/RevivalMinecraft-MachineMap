# Agent README — Revival Minecraft 机器地图

## 项目概述

一个纯前端静态网站，为 Minecraft 服务器的机器/设施提供可视化地图。数据以 YAML 文件形式存放在 `machines/` 目录，部署在 GitHub Pages，每次 push 自动更新。

**技术栈**：单 HTML 页面 + 原生 JS（无框架） + 客户端 YAML 解析（js-yaml CDN） + Canvas 绘图。

**线上地址**：`https://blind-guess-senior.github.io/RevivalMinecraft-MachineMap/`

---

## 文件结构

```
index.html                   # 入口页面（三视图切换 + 弹窗）
css/style.css                # 全部样式（暗色主题，响应式）
js/app.js                    # 全部应用逻辑（~1050 行）
machines/
  files.json                 # 自动生成：所有 yaml 文件路径列表
  交通/
    站点.yaml                 # 交通站点（地狱门/车站/驿站/冰道站/港口/空港）
    线路.yaml                 # 交通线路（点对点 from/to 或多站 stops 数组）
  <区域文件夹>/               # 如 东南山/ 北二环/
    _region.yaml              # 区域元数据（name, center, dimension）
    *.yaml                    # 机器列表（machines: 数组）
  <散装.yaml>                 # 根目录 yaml = 不归属任何区域的独立设施
.github/workflows/pages.yml  # GitHub Actions 部署（生成 files.json 后上传 Pages）
README.md                    # 用户向格式说明
Agent_README.md              # 本文件
```

---

## 数据模型

### 机器

顶层键 `machines`，值为对象数组：

```yaml
machines:
  - name: 刷铁机
    category: 农场          # 农场|工厂|功能性|家|奇观|其他
    enabled: true           # false = 停用（地图上灰色 + X）
    locations:
      - dimension: 主世界   # 主世界|地狱|末地
        coords: [-1043, 123, 401]
    products:               # 家/奇观 无此字段，改用 owner/notes
      - 铁锭
    usage: >                # 使用方法（> 多行合并为单行）
      打开开关。
    opmode: 全自动          # 运作方式
    station: 东南山东站     # 关联站点名，指向 交通/站点.yaml
    contributors: wusanmaster
    owner:                  # 仅 家 分类使用
    notes: 人走关机。
    video_url:
```

JS 加载时为每台机器附加 `_folder` 字段：子文件夹内的 yaml 填文件夹名，根目录 yaml 填 `null`。

### 区域元数据 `_region.yaml`

```yaml
name: 东南山
center: [-955, 68, 192]   # 地图上区域圆圈的位置
dimension: 主世界
```

每个文件夹下的机器自动归属该区域。根目录的机器无归属（散装）。

### 交通站点 `交通/站点.yaml`

```yaml
stations:
  - name: 东南山地狱门
    type: 地狱门          # 车站|地狱门|驿站|冰道站|港口|空港
    region: 东南山         # 所属文件夹名
    locations:
      - dimension: 主世界
        coords: [-950, 70, 190]
```

地狱门只需写主世界坐标，JS 自动计算地狱侧坐标（`÷8`）。站点按 `region` 绘制在区域圆圈的边缘。

### 交通线路 `交通/线路.yaml`

```yaml
routes:
  # 多站折线
  - name: 南线矿车
    method: 矿车
    stops: [东南山南站, 南河湾, 向阳站, 海南]

  # 点对点
  - from: 东南山地狱门
    to: 北二环地狱门
    method: 地狱矿车
```

`stops` 和 `from`/`to` 二选一。线路的维度由它所连站点的坐标决定——站点在哪维线路就在哪维。

---

## JS 架构

### App 对象

全部逻辑集中在全局 `App` 对象上，通过 `DOMContentLoaded` 启动 `App.init()`。

**状态字段**：

| 字段 | 说明 |
|---|---|
| `machines` | 所有机器（原始数据 + `_folder`） |
| `filtered` | 筛选/排序后的机器 |
| `activeView` | `'map'` / `'cards'` / `'table'` |
| `activeDim` | `'主世界'` / `'地狱'` / `'末地'` |
| `searchQuery` | 搜索关键词 |
| `activeCats` | `Set` — 选中的分类筛选 |
| `sortField` | 当前排序字段：`'name'` / `'category'` / `'enabled'` / `'dimension'` |
| `sortDir` | 排序方向：`1` 升序，`-1` 降序 |
| `stations` | 交通站点数组 |
| `routes` | 交通线路数组 |
| `regions` | `{ folder → { name, center, dimension } }` |
| `_mapRects` | 地图命中检测矩形数组（机器/区域/站点），`renderMap()` 填充 |
| `_panX / _panZ` | 地图拖拽平移偏移（像素） |
| `_dragging` | 是否正在拖拽 |
| `_dragMoved` | 拖拽过程中是否移动超过 2px（用于区分拖拽和点击） |

**配置常量**：

| 常量 | 说明 |
|---|---|
| `CATEGORIES` / `CAT_KEYS` / `CAT_COLORS` / `CAT_ICONS` | 六种分类的元数据 |
| `LANDMARK_CATEGORIES` | `['家', '奇观']` — 无产品字段的分类 |
| `STATION_TYPES` / `STATION_COLORS` / `STATION_ICONS` | 六种站点类型 |
| `ROUTE_METHODS` / `ROUTE_STYLES` / `ROUTE_CROSS_SHOW` | 六种线路方法；`ROUTE_CROSS_SHOW` 配置跨维显示：`{ '地狱矿车': ['主世界'] }` |
| `REGION_THRESHOLD` | `1.2` — 缩放阈值，低于此值为区域模式，高于为机器模式 |
| `DIM_SCALE` | `{ '主世界': 1, '地狱': 8, '末地': 1 }` — 地狱坐标 ×8 绘制，切换维度时地狱门落在同一像素位置 |
| `MAP_CENTER_X/Z` / `MAP_SCALE` | 地图初始中心点和缩放，初始在 192熔炉组 |

### 核心流程

1. `init()` → fetch `machines/files.json` → 遍历加载每个 yaml → 填 `_folder` → 加载 `_region.yaml` → `loadTransitData()` → `filter()` → `renderAll()` → `bindEvents()`
2. 用户交互（搜索/筛选/缩放/拖拽）触发 `filter()` + 对应 `render*()` 函数
3. 地图用 Canvas 绘制，卡片和表格用 innerHTML 字符串拼接
4. 详情弹窗通过 `showDetail(machine)` / `hideDetail()` 控制 `.open` class

### 地图渲染 `renderMap()`

使用 `worldToCanvas(wx, wz, w, h)` 做坐标变换（Minecraft 坐标 → Canvas 像素），`canvasToWorld()` 做逆变换。

- **网格**：根据可见范围自动选间距（100/200/500/1000），画出坐标线
- **区域模式**（缩放 < `REGION_THRESHOLD`）：画区域圆圈 + 散装机器 emoji + 交通站点（在区域圆圈边缘）+ 交通线路
- **机器模式**（缩放 ≥ `REGION_THRESHOLD`）：画每个机器的 emoji 图标 + 名称标签

站点位置算法：用地狱站点实际坐标和区域圆心的方向角，把站点图标画在圆圈边缘。

### 地图交互

- **拖拽**：mousedown 记录起点，mousemove 更新 `_panX/_panZ`，>2px 阈值视为拖拽
- **缩放**：滚轮以鼠标位置为中心缩放 `MAP_SCALE`（范围 0.15~12）
- **悬停**：`findMapMachine()` 遍历 `_mapRects`，优先站点 > 机器 > 区域
- **点击**：仅在非拖拽时触发，机器 → 弹详情窗；区域/站点点击无特殊效果

### 关键方法

**数据加载：**

| 方法 | 说明 |
|---|---|
| `init()` | 入口：加载 files.json → 遍历 yaml → 加载区域 → `loadTransitData()` → `filter()` → `renderAll()` → `bindEvents()` |
| `loadTransitData()` | 加载站点和线路；地狱门自动补全地狱侧坐标（`÷8`）；空 name 或空 locations 的站点跳过 |

**数据处理：**

| 方法 | 说明 |
|---|---|
| `filter()` | 分类筛选 + 关键词搜索 → 调用 `sort()`。筛选优先级：先过滤 `activeCats`，再过滤 `searchQuery`。搜索范围：name / products / owner / usage / notes / opmode / station / locations |
| `sort()` | 按 `sortField` 和 `sortDir` 对 `this.filtered` 原地排序。支持字段：name、category、enabled、dimension |

**全量渲染：**

| 方法 | 说明 |
|---|---|
| `renderAll()` | 依次调用 `renderCategoryChips()` / `renderDimensionTabs()` / `renderMap()` / `renderCards()` / `renderTable()` / `renderMapLegend()` / `updateCount()` |
| `renderCards()` | 用 innerHTML 渲染卡片网格。分类左侧色带 + emoji 徽章。`isLandmark` 分类显示 owner/notes 代替 products。station 存在时显示站点名 |
| `renderTable()` | 用 innerHTML 渲染 `<tbody>`。7 列：名称 / 分类 / 维度 / 坐标 / 产物 / 站点 / 状态。表头点击触发排序，当前排序列显示 ▲▼ |

**地图：**

| 方法 | 说明 |
|---|---|
| `renderMap()` | Canvas 绘制全图。缩放 < `REGION_THRESHOLD` → 区域模式，否则 → 机器模式 |
| `worldToCanvas(wx, wz, w, h)` | 世界坐标 → Canvas 像素 |
| `canvasToWorld(cx, cy, cw, ch)` | Canvas 像素 → 世界坐标 |
| `_groupLayout(group, w, h)` | 返回区域的 `{ cx, cz, r, name }`，画圆圈和站点定位共用 |
| `findMapMachine(ex, ey)` | 命中检测，遍历 `_mapRects`。优先级：站点 > 机器 > 区域（区域圆圈半径大，优先级最低） |

**交互和工具：**

| 方法 | 说明 |
|---|---|
| `bindEvents()` | 绑定全部 DOM 事件（视图切换、搜索、筛选、地图拖拽/缩放/悬停/点击、卡片/表格点击、排序、弹窗开关、错误关闭、窗口 resize） |
| `showDetail(machine)` / `hideDetail()` | 弹窗开关。`showDetail` 根据 `isLandmark` 决定显示产物还是 owner/notes |
| `showError(msg)` | 传入 null 隐藏 #error-banner，传入字符串显示并填充 #error-msg |
| `escapeHtml(s)` | 通过 `textContent` 赋值实现转义，防 XSS |

---

## DOM 结构（JS 引用的关键 ID）

| ID | 用途 | 所属视图 |
|---|---|---|
| `search-input` / `search-clear` | 搜索框和清除按钮 | 全局工具栏 |
| `category-filters` | 分类筛选芯片容器 | 全局工具栏 |
| `machine-count` | 结果显示计数 | 全局工具栏 |
| `dimension-tabs` | 维度切换标签（主世界/地狱/末地） | 地图视图 |
| `map-canvas` | Canvas 地图画布 | 地图视图 |
| `map-tooltip` | 地图悬停提示（position:absolute） | 地图视图 |
| `map-legend` | 图例（分类 + 站点类型 + 线路方法） | 地图视图 |
| `card-grid` / `cards-empty` | 卡片容器和空状态 | 卡片视图 |
| `machine-table` / `table-body` / `table-empty` | 表格容器/表身/空状态 | 表格视图 |
| `detail-overlay` / `modal-backdrop` / `modal-content` / `modal-close` | 弹窗（背景层 / 关闭按钮 / 内容） | 全局 |
| `error-banner` / `error-msg` / `error-dismiss` | 错误提示横幅 | 全局 |

视图切换通过 `<button class="view-tab" data-view="map|cards|table">` 驱动，JS 中读取 `btn.dataset.view` 并激活 `#view-<name>` section。

---

## CSS 变量体系

`style.css` 的 `:root` 定义了全局设计令牌，JS 中的分类颜色常量与之一一对应：

```css
:root {
  --bg: #101018;
  --surface: #1a1a2a;
  --surface-2: #242438;
  --border: #333350;
  --text: #e4e4f0;
  --text-secondary: #9999b0;
  --text-muted: #666680;

  --farm: #4caf50;     /* ≈ CAT_COLORS['农场'] */
  --factory: #ff9800;  /* ≈ CAT_COLORS['工厂'] */
  --utility: #42a5f5;  /* ≈ CAT_COLORS['功能性'] */
  --home: #ec407a;     /* ≈ CAT_COLORS['家'] */
  --wonder: #f4b400;   /* ≈ CAT_COLORS['奇观'] */
  --other: #9e9e9e;    /* ≈ CAT_COLORS['其他'] */

  --danger: #ef5350;    /* 禁用/错误色 */
  --warn: #ffb74d;      /* 警告色 */

  --radius: 10px;
  --radius-sm: 6px;
  --font: ...;          /* 字体栈 */
  --font-mono: ...;     /* 等宽字体栈 */
}
```

**注意**：Canvas 内绘图不读 CSS 变量，颜色直接用 `CAT_COLORS` / `STATION_COLORS` 等 JS 常量。修改颜色时两边要同步。

---

## 视图切换机制

三个视图 `<section id="view-map|view-cards|view-table">` 通过 CSS class `.view.active` 控制显隐。初始 `activeView = 'map'`。

切换流程：点击 `.view-tab` → `bindEvents()` 中读取 `data-view` → 设 `this.activeView` → 切换所有 `.view` 的 `active` class → 如果切到地图则调 `renderMap()`。

搜索和分类筛选对所有视图生效（触发 `renderAll()` 全刷）。

---

## filter() / sort() 优先级

1. **分类筛选**：`activeCats` 为空 Set 时不限制；非空时只保留 `m.category ∈ activeCats` 的机器
2. **关键词搜索**：对每台机器的 `[name, ...products, owner, usage, notes, opmode, station, ...坐标文本]` 做 `toLowerCase().includes(q)`
3. **排序**：在筛选结果上原地排序。`sortField` 和 `sortDir` 由表头点击设置，默认按 name 升序

---

## ROUTE_CROSS_SHOW 语义

```
线路在它所连站点的坐标所在维度自动绘制。
ROUTE_CROSS_SHOW 让线路**额外**显示在指定维度。

当前配置：{ '地狱矿车': ['主世界'] }
含义：地狱矿车线路除了在站点维度绘制外，还会额外在主世界地图上绘制（半透明）。
```

---

## 错误处理

`init()` 的 try/catch 捕获所有加载阶段错误，调用 `showError(msg)` 在页面底部显示 `#error-banner`。加载失败后仍渲染空状态，事件绑定不受影响。

单个文件加载失败（HTTP 错误 / YAML 解析失败）只 `console.warn` 并跳过，不影响其他文件。

---

## 部署

1. 编辑 `machines/` 下 yaml → `git push origin main`
2. GitHub Actions 触发：`find` 扫描 `machines/` 下所有 yaml → 生成 `files.json` → 上传 Pages artifact → 部署
3. `files.json` 在 `.gitignore` 中（构建时生成，不提交）

本地预览：
```bash
cd machines && node -e "..."   # 更新 files.json
python -m http.server 8080    # 启服务器
```

---

## 注意事项

1. **YAML 空格**：站点和线路名中的空格是普通字符，`东南山 地狱门` 带空格不等于 `东南山地狱门`
2. **地狱门坐标**：只存主世界，地狱侧自动算。几格误差可接受
3. **维度切换重置平移**：`_panX/_panZ` 归零，因为各维坐标系不同
4. **Canvas 字体**：必须用 `this._font` 别直接写死字体名，否则不匹配 CSS 字体栈
5. **散装机器**：`machines/` 根目录的 yaml，`_folder = null`，缩放时始终显示为独立 emoji，不归入任何区域圆圈
6. **线路维度**：由站点坐标驱动，不硬编码。地狱矿车的跨维显示通过 `ROUTE_CROSS_SHOW` 配置
