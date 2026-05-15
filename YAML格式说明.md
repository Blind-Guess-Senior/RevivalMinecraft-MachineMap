# YAML 数据格式说明

## 目录结构

```
machines/
├── 东南山/
│   ├── _region.yaml       # 区域元数据（每区域一个）
│   ├── 农场.yaml           # 机器数据（可含多台）
│   └── ...
├── 交通/
│   ├── 站点.yaml           # 交通站点（地狱门/车站/港口...）
│   └── 线路.yaml           # 交通线路
└── ...
```

---

## 一、机器 `*.yaml`

每台机器的顶层 `machines` 数组：

```yaml
machines:
  - name: 刷铁机
    category: 农场
    enabled: true
    products:
      - 铁锭
      - 虞美人
    locations:
      - dimension: 主世界
        coords: [-1043, 123, 401]
    usage: >
      打开花销毁开关和机器开关，人走关机。
    travel_method: 地狱交通
    station: 工业区地狱门
    notes: 人走关机。
    video_url: https://www.bilibili.com/video/xxx
    contributors:
    owner:
```

### 字段一览

| 键 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `name` | ✓ | 字符串 | 机器 / 地点名称 |
| `category` | ✓ | 枚举 | `农场` `工厂` `功能性` `家` `奇观` `其他` |
| `enabled` | ✓ | 布尔 | `true` 正常，`false` 停用（地图显示红色叉号） |
| `products` | | 字符串数组 | 产物列表。`家` / `奇观` 无需此字段 |
| `locations` | ✓ | 对象数组 | 坐标列表，见下方 |
| `usage` | | 字符串 | 使用方法，`>` 后可写多行自动合并 |
| `travel_method` | | 字符串 | 前往方式，如 "地狱交通" "步行" "主世界矿车" |
| `station` | | 字符串 | 关联站点名，指向 `交通/站点.yaml` 中的 `name` |
| `notes` | | 字符串 | 注意事项 / 警告（弹窗中高亮显示） |
| `video_url` | | 字符串 | 教程视频链接 |
| `contributors` | | 字符串 | 建造者 / 维护者 |
| `owner` | | 字符串 | 所属人，**仅 `家` 分类显示** |

### `locations` 子对象

```yaml
locations:
  - dimension: 主世界    # 主世界 / 地狱 / 末地
    coords: [x, y, z]   # 三维整数坐标
```

一台机器可以有多个 location。

### `usage` / `notes` 多行写法

```yaml
usage: >
  第一行。
  第二行，最终会合并成一个段落。
```

`>` 将多行合并为单行，适合长文本。

---

## 二、区域元数据 `_region.yaml`

每个区域文件夹下一个，定义该区域的名称和地图显示位置：

```yaml
name: 东南山
center: [-955, 68, 192]
dimension: 主世界
```

| 键 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `name` | ✓ | 字符串 | 区域名称，地图缩小时显示 |
| `center` | ✓ | `[x, y, z]` | 区域标签在地图上的位置 |
| `dimension` | ✓ | 字符串 | 所属维度 |

---

## 三、交通站点 `交通/站点.yaml`

```yaml
stations:
  - name: 工业区地狱门
    type: 地狱门
    locations:
      - dimension: 主世界
        coords: [-950, 70, 190]
  - name: 工业区车站
    type: 车站
    locations:
      - dimension: 主世界
        coords: [-960, 68, 200]
```

### `type` 枚举

| type | 说明 | 站点图标 |
|---|---|---|
| `车站` | 主世界矿车站 | 🚂 |
| `地狱门` | 地狱交通入口 | ⏥ |
| `驿站` | 马道站点 | 🐴 |
| `冰道站` | 冰道站点 | 🛷 |
| `港口` | 水路站点 | ⚓ |
| `空港` | 空路站点 | 🪶 |

**地狱门**只需填写主世界坐标，地狱侧坐标自动计算（主世界坐标 ÷ 8）。几格误差可接受，确保切换维度时位置不变。

| 键 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `name` | ✓ | 字符串 | 站点名称，供机器的 `station` 字段引用 |
| `type` | ✓ | 字符串 | 站点类型，见上表 |
| `locations` | ✓ | 对象数组 | 与机器 `locations` 格式相同 |

---

## 四、交通线路 `交通/线路.yaml`

```yaml
routes:
  - from: 工业区地狱门
    to: 北二环地狱门
    method: 地狱矿车
    time: ~2分钟
```

### `method` 枚举

| method | 说明 |
|---|---|
| `主世界矿车` | 主世界矿车线路 |
| `地狱矿车` | 地狱（下界）矿车线路 |
| `马道` | 马匹道路 |
| `冰道` | 冰道（船速交通） |
| `水路` | 水路航运 |
| `空路` | 鞘翅飞行 / 空路 |

线路连接任意两个站点。无基础设施连通的站点之间不需要写线路。

| 键 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `from` | ✓ | 字符串 | 起点站点名称 |
| `to` | ✓ | 字符串 | 终点站点名称 |
| `method` | ✓ | 字符串 | 交通方式，见上表 |
| `time` | | 字符串 | 耗时，如 "~2分钟" |

---

## 新增条目流程

1. 在对应区域文件夹新建或编辑 yaml，写入 `machines:` 数组
2. 新增站点：编辑 `交通/站点.yaml`
3. 新增线路：编辑 `交通/线路.yaml`
4. push → GitHub Actions 自动部署

本地预览前需更新 `machines/files.json`：

```bash
cd machines && node -e "
const fs = require('fs'), path = require('path');
function walk(dir, pre) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => {
    const r = pre ? pre + '/' + e.name : e.name;
    return e.isDirectory() ? walk(path.join(dir, e.name), r)
      : /\.ya?ml$/.test(e.name) ? [r] : [];
  });
}
fs.writeFileSync('files.json', JSON.stringify(walk('.').sort(), null, 2));
"
```
