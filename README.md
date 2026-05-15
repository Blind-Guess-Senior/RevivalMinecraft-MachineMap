# Revival Minecraft — 机器地图

服务器机器信息总览网站，托管于 [GitHub Pages](https://blind-guess-senior.github.io/RevivalMinecraft-MachineMap/)。

修改 `machines/` 目录下的 yaml 文件后 `git push`，网站自动更新。

---

## 快速开始

```
machines/
├── 东南山/               ← 区域文件夹
│   ├── _region.yaml       ← 区域元数据
│   ├── 农场.yaml           ← 机器数据（可含多台）
│   └── ...
├── 交通/
│   ├── 站点.yaml           ← 交通站点（地狱门/车站/港口...）
│   └── 线路.yaml           ← 交通线路
└── ...
```

### 新增机器

在对应区域文件夹的任意 yaml 文件中加入：

```yaml
machines:
  - name: 新机器
    category: 农场        # 农场 / 工厂 / 功能性 / 家 / 奇观 / 其他
    enabled: true
    products:
      - 产物A
    locations:
      - dimension: 主世界  # 主世界 / 地狱 / 末地
        coords: [x, y, z]
    usage: >
      使用方法。
    travel_method: 地狱交通
    station: 某站点       # 可选，指向 交通/站点.yaml 中的站点名
    notes: 注意点。
```

### 新增区域

新建文件夹，并在其中加入 `_region.yaml`：

```yaml
name: 区域名
center: [x, y, z]
dimension: 主世界
```

### 新增交通站点

编辑 `交通/站点.yaml`，地狱门只需填主世界坐标：

```yaml
stations:
  - name: 新地狱门
    type: 地狱门         # 车站 / 地狱门 / 驿站 / 冰道站 / 港口 / 空港
    region: 东南山        # 所属区域文件夹名
    locations:
      - dimension: 主世界
        coords: [x, y, z]
```

### 新增交通线路

编辑 `交通/线路.yaml`：

```yaml
routes:
  - from: 起点站名
    to: 终点站名
    method: 地狱矿车    # 主世界矿车 / 地狱矿车 / 马道 / 冰道 / 水路 / 空路
    time: ~2分钟
```

### 本地预览

```bash
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

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

---

## 机器字段参考

| 键              | 必填 | 类型       | 说明                                      |
| --------------- | ---- | ---------- | ----------------------------------------- |
| `name`          | ✓    | 字符串     | 机器 / 地点名称                           |
| `category`      | ✓    | 枚举       | `农场` `工厂` `功能性` `家` `奇观` `其他` |
| `enabled`       | ✓    | 布尔       | `true` 正常，`false` 停用                 |
| `locations`     | ✓    | 对象数组   | `dimension` + `coords: [x, y, z]`         |
| `products`      |      | 字符串数组 | 产物。`家` / `奇观` 无需                  |
| `usage`         |      | 字符串     | 使用方法                                  |
| `travel_method` |      | 字符串     | 如 "地狱交通" "主世界矿车"                |
| `station`       |      | 字符串     | 关联站点名                                |
| `contributors`  |      | 字符串     | 建造者                                    |
| `owner`         |      | 字符串     | 所属人（仅 `家`）                         |
| `notes`         |      | 字符串     | 注意事项                                  |
| `video_url`     |      | 字符串     | 相关视频链接                              |

## 区域元数据 `_region.yaml`

| 键          | 必填 | 说明                     |
| ----------- | ---- | ------------------------ |
| `name`      | ✓    | 区域名称                 |
| `center`    | ✓    | 地图标签位置 `[x, y, z]` |
| `dimension` | ✓    | 维度                     |

## 交通站点 `交通/站点.yaml`

| 键          | 必填 | 说明                                          |
| ----------- | ---- | --------------------------------------------- |
| `name`      | ✓    | 站点名                                        |
| `type`      | ✓    | `车站` `地狱门` `驿站` `冰道站` `港口` `空港` |
| `region`    | ✓    | 所属区域文件夹名                               |
| `locations` | ✓    | 地狱门只存主世界坐标，地狱侧自动计算          |

## 交通线路 `交通/线路.yaml`

| 键       | 必填 | 说明                                                |
| -------- | ---- | --------------------------------------------------- |
| `from`   | ✓    | 起点站名                                            |
| `to`     | ✓    | 终点站名                                            |
| `method` | ✓    | `主世界矿车` `地狱矿车` `马道` `冰道` `水路` `空路` |
| `time`   |      | 耗时                                                |
