/* ============================================================
   Revival Minecraft — 机器地图 应用逻辑
   ============================================================ */

const App = {
  // 状态
  machines: [],
  filtered: [],
  activeView: 'map',
  activeDim: '主世界',
  searchQuery: '',
  activeCats: new Set(),
  sortField: 'name',
  sortDir: 1,

  // 交通数据
  stations: [],
  routes: [],
  regions: {},   // folder → { name, center, dimension }

  // 站点类型样式
  STATION_TYPES: ['车站', '地狱门', '驿站', '冰道站', '港口', '空港'],
  STATION_COLORS: { '车站': '#ff9800', '地狱门': '#e040fb', '驿站': '#8d6e63', '冰道站': '#4fc3f7', '港口': '#1e88e5', '空港': '#e0e0e0' },
  STATION_ICONS: { '车站': '🚂', '地狱门': '⏥', '驿站': '🐴', '冰道站': '🛷', '港口': '⚓', '空港': '🪶' },

  // 线路方法样式
  ROUTE_METHODS: ['矿车', '地狱矿车', '马道', '冰道', '水路', '空路'],
  ROUTE_STYLES: {
    '矿车':       { color: '#ffb432', dash: [10, 5] },
    '地狱矿车':   { color: '#e040fb', dash: [8, 4] },
    '马道':       { color: '#8d6e63', dash: [] },
    '冰道':       { color: '#4fc3f7', dash: [3, 3] },
    '水路':       { color: '#1e88e5', dash: [2, 6] },
    '空路':       { color: '#e0e0e0', dash: [1, 8] }
  },

  // 路线跨维度显示：method → 额外显示的维度列表
  ROUTE_CROSS_SHOW: { '地狱矿车': ['主世界'] },

  // 地图状态
  _mapRects: [],
  _panX: 0,
  _panZ: 0,
  _dragStartX: 0,
  _dragStartY: 0,
  _dragPanX: 0,
  _dragPanZ: 0,
  _dragging: false,
  _dragMoved: false,

  // 地图常量
  MAP_CENTER_X: -955,
  MAP_CENTER_Z: 192,
  MAP_SCALE: 0.6,

  // 分类定义
  CATEGORIES: ['农场', '工厂', '功能性', '家', '奇观', '其他'],
  CAT_KEYS: { '农场': 'farm', '工厂': 'factory', '功能性': 'utility', '家': 'home', '奇观': 'wonder', '其他': 'other' },
  CAT_COLORS: { '农场': '#4caf50', '工厂': '#ff9800', '功能性': '#42a5f5', '家': '#ec407a', '奇观': '#f4b400', '其他': '#9e9e9e' },
  CAT_ICONS: { '农场': '🌾', '工厂': '🏭', '功能性': '🔧', '家': '🏠', '奇观': '🏛️', '其他': '📌' },

  // 无需产品字段的分类（用 owner/notes 代替）
  LANDMARK_CATEGORIES: ['家', '奇观'],

  // 地图缩放阈值：低于此值为区域模式，高于为机器模式
  REGION_THRESHOLD: 1.2,

  // 维度缩放：地狱坐标 ×8 后与主世界对齐，切换维度时同一地狱门位置不变
  DIM_SCALE: { '主世界': 1, '地狱': 8, '末地': 1 },

  // 缓存字体，避免渲染时重复 getComputedStyle
  _font: '',

  // === 初始化 ===
  async init() {
    this._font = getComputedStyle(document.body).fontFamily;
    try {
      // 加载构建时自动生成的文件清单
      const manifestResp = await fetch('machines/files.json');
      if (!manifestResp.ok) throw new Error(`files.json: HTTP ${manifestResp.status}`);
      const files = await manifestResp.json();
      if (!Array.isArray(files) || files.length === 0) {
        throw new Error('machines/files.json 为空');
      }

      // 加载机器文件，同时记录每个机器所属的文件夹
      const allMachines = [];
      for (const file of files) {
        // 跳过交通数据文件（单独加载）和区域元数据
        if (file.startsWith('交通/') || file.endsWith('/_region.yaml')) continue;

        try {
          const resp = await fetch('machines/' + file);
          if (!resp.ok) { console.warn('跳过 ' + file + ': HTTP ' + resp.status); continue; }
          const text = await resp.text();
          const data = jsyaml.load(text);
          if (data && Array.isArray(data.machines)) {
            // 根目录下的 yaml 不属于任何区域，_folder 为空
            const folder = file.includes('/') ? file.split('/')[0] : null;
            for (const m of data.machines) {
              m._folder = folder;
            }
            allMachines.push(...data.machines);
          }
        } catch (e) { console.warn('跳过 ' + file + ': ' + e.message); }
      }

      // 加载区域元数据
      const folders = [...new Set(allMachines.map(m => m._folder).filter(Boolean))];
      const regions = {};
      for (const folder of folders) {
        try {
          const resp = await fetch(`machines/${folder}/_region.yaml`);
          if (!resp.ok) continue;
          const text = await resp.text();
          const data = jsyaml.load(text);
          if (data && data.name) {
            regions[folder] = {
              name: data.name,
              center: data.center || [0, 64, 0],
              dimension: data.dimension || '主世界'
            };
          }
        } catch (e) { /* 忽略 */ }
      }
      this.regions = regions;

      // 加载交通数据
      await this.loadTransitData();

      if (allMachines.length === 0) throw new Error('没有加载到任何机器数据');
      this.machines = allMachines;
      this.filter();
      this.renderAll();
      this.bindEvents();
      this.showError(null);
    } catch (err) {
      console.error(err);
      this.showError('加载失败：' + err.message);
      this.machines = [];
      this.filtered = [];
      this.renderAll();
      this.bindEvents();
    }
  },

  async loadTransitData() {
    // 加载站点
    try {
      const sResp = await fetch('machines/交通/站点.yaml');
      if (sResp.ok) {
        const sData = jsyaml.load(await sResp.text());
        if (sData && Array.isArray(sData.stations)) {
          // 地狱门自动补全地狱侧坐标
          for (const s of sData.stations) {
            if (!s.name || !s.locations) continue;
            if (s.type === '地狱门') {
              const ow = s.locations.find(l => l.dimension === '主世界');
              if (ow && ow.coords) {
                const exists = s.locations.some(l => l.dimension === '地狱');
                if (!exists) {
                  s.locations.push({
                    dimension: '地狱',
                    coords: [Math.round(ow.coords[0] / 8), ow.coords[1], Math.round(ow.coords[2] / 8)]
                  });
                }
              }
            }
          }
          this.stations = sData.stations;
        }
      }
    } catch (e) { console.warn('加载站点失败:', e.message); }

    // 加载线路
    try {
      const rResp = await fetch('machines/交通/线路.yaml');
      if (rResp.ok) {
        const rData = jsyaml.load(await rResp.text());
        if (rData && Array.isArray(rData.routes)) this.routes = rData.routes;
      }
    } catch (e) { console.warn('加载线路失败:', e.message); }
  },

  // === 筛选 ===
  filter() {
    const q = this.searchQuery.toLowerCase();
    this.filtered = this.machines.filter(m => {
      if (this.activeCats.size > 0 && !this.activeCats.has(m.category)) return false;
      if (!q) return true;
      const hay = [
        m.name,
        ...(m.products || []),
        m.owner || '',
        m.usage || '',
        m.notes || '',
        m.opmode || '',
        m.station || '',
        ...(m.locations || []).map(l => l.dimension + ' ' + (l.coords || []).join(' '))
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
    this.sort();
  },

  sort() {
    const dir = this.sortDir;
    const field = this.sortField;
    this.filtered.sort((a, b) => {
      let va, vb;
      switch (field) {
        case 'name': va = a.name; vb = b.name; break;
        case 'category': va = a.category; vb = b.category; break;
        case 'enabled': va = a.enabled !== false ? 1 : 0; vb = b.enabled !== false ? 1 : 0; break;
        case 'dimension': va = (a.locations || [{}])[0].dimension || ''; vb = (b.locations || [{}])[0].dimension || ''; break;
        default: va = a.name; vb = b.name;
      }
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  },

  // === 全量渲染 ===
  renderAll() {
    this.renderCategoryChips();
    this.renderDimensionTabs();
    this.renderMap();
    this.renderCards();
    this.renderTable();
    this.renderMapLegend();
    this.updateCount();
  },

  // === 分类筛选芯片 ===
  renderCategoryChips() {
    const el = document.getElementById('category-filters');
    const counts = {};
    for (const cat of this.CATEGORIES) counts[cat] = this.machines.filter(m => m.category === cat).length;

    el.innerHTML = this.CATEGORIES.map(cat => {
      const active = this.activeCats.has(cat) ? ' active' : '';
      const cls = this.CAT_KEYS[cat] || '';
      return `<button class="cat-chip ${cls}${active}" data-cat="${cat}">${this.CAT_ICONS[cat] || ''} ${cat} (${counts[cat]})</button>`;
    }).join('');
  },

  // === 维度标签 ===
  renderDimensionTabs() {
    const dims = [...new Set(this.machines.flatMap(m => (m.locations || []).map(l => l.dimension)))];
    const order = ['主世界', '地狱', '末地'];
    dims.sort((a, b) => order.indexOf(a) - order.indexOf(b));

    if (!this.activeDim || !dims.includes(this.activeDim)) {
      this.activeDim = dims[0] || '主世界';
    }

    const el = document.getElementById('dimension-tabs');
    el.innerHTML = dims.map(d => {
      const active = d === this.activeDim ? ' active' : '';
      return `<button class="dim-tab${active}" data-dim="${d}">${d}</button>`;
    }).join('');
  },

  // === 图例 ===
  renderMapLegend() {
    const el = document.getElementById('map-legend');
    let html = this.CATEGORIES.map(cat => {
      const cls = this.CAT_KEYS[cat] || '';
      return `<span class="legend-item"><span class="legend-dot ${cls}"></span>${this.CAT_ICONS[cat] || ''} ${cat}</span>`;
    }).join('');

    // 有站点数据时追加站点类型和线路
    if (this.stations.length > 0) {
      html += '<span class="legend-item" style="margin-left:8px;opacity:0.5">|</span>';
      html += this.STATION_TYPES.filter(t => this.stations.some(s => s.type === t)).map(t =>
        `<span class="legend-item"><span class="legend-dot" style="background:${this.STATION_COLORS[t]}"></span>${t}</span>`
      ).join('');
    }
    if (this.routes.length > 0) {
      html += this.ROUTE_METHODS.filter(rm => this.routes.some(r => r.method === rm)).map(rm => {
        const s = this.ROUTE_STYLES[rm];
        return `<span class="legend-item" style="color:${s.color}">${s.dash.length ? '--' : '—'} ${rm}</span>`;
      }).join('');
    }

    el.innerHTML = html;
  },

  // === 计数 ===
  updateCount() {
    document.getElementById('machine-count').textContent =
      `共 ${this.filtered.length} / ${this.machines.length} 项`;
  },

  // ========================
  //  地图视图
  // ========================
  worldToCanvas(wx, wz, cw, ch) {
    const ds = this.DIM_SCALE[this.activeDim] || 1;
    const cx = (wx * ds - this.MAP_CENTER_X) * this.MAP_SCALE + cw / 2 + this._panX;
    const cy = ch / 2 - (wz * ds - this.MAP_CENTER_Z) * this.MAP_SCALE + this._panZ;
    return [cx, cy];
  },

  renderMap() {
    const canvas = document.getElementById('map-canvas');
    const container = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;

    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 筛选当前维度的机器
    const pts = [];
    for (const m of this.filtered) {
      for (const loc of (m.locations || [])) {
        if (loc.dimension === this.activeDim && loc.coords && loc.coords.length >= 3) {
          pts.push({ machine: m, x: loc.coords[0], z: loc.coords[2] });
        }
      }
    }

    // 绘制背景
    ctx.fillStyle = '#12121e';
    ctx.fillRect(0, 0, w, h);

    // 空状态
    if (pts.length === 0) {
      ctx.fillStyle = '#666680';
      ctx.font = '16px ' + this._font;
      ctx.textAlign = 'center';
      ctx.fillText('该维度暂无数据', w / 2, h / 2);
      this._mapRects = [];
      return;
    }

    // --- 网格 ---
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;

    // 计算可见范围的世界坐标
    const [visMinX] = this.canvasToWorld(0, 0, w, h);
    const [visMaxX] = this.canvasToWorld(w, 0, w, h);
    const [, visMinZ] = this.canvasToWorld(0, h, w, h);
    const [, visMaxZ] = this.canvasToWorld(0, 0, w, h);

    const worldMinX = Math.min(visMinX, visMaxX);
    const worldMaxX = Math.max(visMinX, visMaxX);
    const worldMinZ = Math.min(visMinZ, visMaxZ);
    const worldMaxZ = Math.max(visMinZ, visMaxZ);

    // 计算网格间隔（按显示空间，地狱 ×8 后还原真实间距）
    const dispRange = Math.max(worldMaxX - worldMinX, worldMaxZ - worldMinZ) * (this.DIM_SCALE[this.activeDim] || 1);
    let gs = 100;
    if (dispRange > 8000) gs = 1000;
    else if (dispRange > 3000) gs = 500;
    else if (dispRange > 1500) gs = 200;

    const gx0 = Math.floor(worldMinX / gs) * gs;
    const gz0 = Math.floor(worldMinZ / gs) * gs;

    ctx.fillStyle = '#555';
    ctx.font = '10px ' + this._font;

    for (let gx = gx0; gx <= worldMaxX; gx += gs) {
      const [sx] = this.worldToCanvas(gx, 0, w, h);
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(gx, sx, h - 4);
    }
    for (let gz = gz0; gz <= worldMaxZ; gz += gs) {
      const [, sz] = this.worldToCanvas(0, gz, w, h);
      ctx.beginPath(); ctx.moveTo(0, sz); ctx.lineTo(w, sz); ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillText(gz, 4, sz - 3);
    }

    // --- 坐标轴 (X=0 / Z=0) ---
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    if (worldMinX <= 0 && worldMaxX >= 0) {
      const [sx] = this.worldToCanvas(0, 0, w, h);
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
      ctx.fillStyle = '#888';
      ctx.textAlign = 'center';
      ctx.fillText('X=0', sx, 12);
    }
    if (worldMinZ <= 0 && worldMaxZ >= 0) {
      const [, sz] = this.worldToCanvas(0, 0, w, h);
      ctx.beginPath(); ctx.moveTo(0, sz); ctx.lineTo(w, sz); ctx.stroke();
      ctx.fillStyle = '#888';
      ctx.textAlign = 'left';
      ctx.fillText('Z=0', w - 28, sz - 4);
    }

    const rects = [];

    if (this.MAP_SCALE < this.REGION_THRESHOLD) {
      // --- 区域模式：有归属的画区域圆圈，散装机器画独立点 ---
      const grouped = [];   // 有 _folder 的
      const loose = [];     // 无 _folder 的
      for (const p of pts) {
        if (p.machine._folder) grouped.push(p);
        else loose.push(p);
      }

      // 区域圆圈
      const groups = {};
      for (const p of grouped) {
        const folder = p.machine._folder;
        if (!groups[folder]) groups[folder] = { pts: [], region: this.regions[folder] };
        groups[folder].pts.push(p);
      }

      for (const [folder, group] of Object.entries(groups)) {
        const { cx, cz, r, name } = this._groupLayout(group, w, h);

        ctx.beginPath();
        ctx.arc(cx, cz, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px ' + this._font;
        ctx.textAlign = 'center';
        ctx.fillText(name, cx, cz - 4);

        ctx.fillStyle = '#aaa';
        ctx.font = '12px ' + this._font;
        ctx.fillText(group.pts.length + '个设施', cx, cz + 16);

        // 缓存布局信息供站点定位使用
        group._layout = { cx, cz, r };
        rects.push({ sx: cx, sz: cz, r, isRegion: true, folder, machines: group.pts.map(p => p.machine) });
      }

      // 散装机器：emoji 小图标
      for (const p of loose) {
        const [sx, sz] = this.worldToCanvas(p.x, p.z, w, h);
        const icon = this.CAT_ICONS[p.machine.category] || '📍';
        const dotR = 6;
        ctx.fillStyle = '#fff';
        ctx.font = '13px ' + this._font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, sx, sz);
        ctx.fillStyle = '#e4e4f0';
        ctx.font = 'bold 10px ' + this._font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.machine.name, sx + dotR + 1, sz);
        rects.push({ sx, sz, r: dotR + 2, machine: p.machine, x: p.x, z: p.z });
      }

      // --- 交通覆盖层：站点 + 线路 ---
      if (this.stations.length > 0) {
        const stationPositions = {};
        for (const s of this.stations) {
          if (!s.name || !s.locations || s.locations.length === 0) continue;
          const loc = s.locations.find(l => l.dimension === this.activeDim);
          if (!loc || !loc.coords) continue;
          const [swx, swz] = [loc.coords[0], loc.coords[2]];

          const regKey = s.region;
          if (regKey && groups[regKey] && groups[regKey]._layout) {
            // 有归属区域：画在区域圆圈边缘
            const { cx: rcx, cz: rcz, r: rr } = groups[regKey]._layout;
            const [ssx, ssz] = this.worldToCanvas(swx, swz, w, h);
            const angle = Math.atan2(rcx - ssx, rcz - ssz);
            const esx = rcx - rr * Math.sin(angle);
            const esz = rcz - rr * Math.cos(angle);
            stationPositions[s.name] = { sx: esx, sz: esz, station: s, r: rr };
          } else {
            // 无归属（散装站点）：画在实际坐标位置
            const [sx, sz] = this.worldToCanvas(swx, swz, w, h);
            stationPositions[s.name] = { sx, sz, station: s, r: 9 };
          }
        }

        // 画线路（维度由站点坐标决定，crossShow 方法在额外维度降透明度）
        for (const route of this.routes) {
          const style = this.ROUTE_STYLES[route.method] || { color: '#888', dash: [] };
          const extraDims = this.ROUTE_CROSS_SHOW[route.method];
          const crossFade = extraDims && extraDims.includes(this.activeDim);
          ctx.globalAlpha = crossFade ? 0.25 : 0.55;
          ctx.strokeStyle = style.color;
          ctx.lineWidth = 1.0;
          ctx.setLineDash(style.dash);

          // stops 数组 → 多站折线；from/to → 单线段
          const pts = [];
          if (route.stops && route.stops.length >= 2) {
            for (const name of route.stops) {
              const sp = stationPositions[name];
              if (!sp) { pts.length = 0; break; }
              pts.push(sp);
            }
          } else {
            const fp = stationPositions[route.from];
            const tp = stationPositions[route.to];
            if (fp && tp) pts.push(fp, tp);
          }

          if (pts.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(pts[0].sx, pts[0].sz);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sz);
            ctx.stroke();

            // 线路名标注在每段中点
            if (route.name) {
              ctx.globalAlpha = 1;
              ctx.fillStyle = '#999';
              ctx.font = '10px ' + this._font;
              ctx.textAlign = 'center';
              for (let i = 0; i < pts.length - 1; i++) {
                const mx = (pts[i].sx + pts[i + 1].sx) / 2;
                const mz = (pts[i].sz + pts[i + 1].sz) / 2;
                ctx.fillText(route.name, mx, mz - 6);
              }
            }
          }

          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }

        // 画站点图标在圆圈边缘
        for (const [name, sp] of Object.entries(stationPositions)) {
          const color = this.STATION_COLORS[sp.station.type] || '#888';
          const icon = this.STATION_ICONS[sp.station.type] || '●';
          const dotR = 5;
          ctx.beginPath();
          ctx.arc(sp.sx, sp.sz, dotR + 2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(sp.sx, sp.sz, dotR, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 7px ' + this._font;
          ctx.textAlign = 'center';
          ctx.fillText(icon, sp.sx, sp.sz + 2.5);
          // 存储站点命中的 rect
          rects.push({ sx: sp.sx, sz: sp.sz, r: dotR + 3, isStation: true, station: sp.station });
        }
      }
    } else {
      // --- 机器模式：emoji 标点 ---
      const dotR = 8;

      for (const p of pts) {
        const [sx, sz] = this.worldToCanvas(p.x, p.z, w, h);
        const icon = this.CAT_ICONS[p.machine.category] || '📍';
        const isOff = p.machine.enabled === false;

        // emoji 图标
        ctx.fillStyle = isOff ? 'rgba(255,255,255,0.3)' : '#fff';
        ctx.font = '16px ' + this._font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, sx, sz);

        // 禁用标记
        if (isOff) {
          ctx.strokeStyle = '#ef5350';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx, sz, dotR + 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(sx - 4, sz - 4); ctx.lineTo(sx + 4, sz + 4);
          ctx.moveTo(sx + 4, sz - 4); ctx.lineTo(sx - 4, sz + 4);
          ctx.stroke();
        }

        // 名称标签
        ctx.fillStyle = '#e4e4f0';
        ctx.font = 'bold 11px ' + this._font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.machine.name, sx + dotR + 2, sz);

        rects.push({ sx, sz, r: dotR + 2, machine: p.machine, x: p.x, z: p.z });
      }
    }

    // 中心十字标记
    const [cx, cz] = this.worldToCanvas(this.MAP_CENTER_X, this.MAP_CENTER_Z, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx - 14, cz); ctx.lineTo(cx + 14, cz);
    ctx.moveTo(cx, cz - 14); ctx.lineTo(cx, cz + 14);
    ctx.stroke();
    ctx.setLineDash([]);

    this._mapRects = rects;
  },

  canvasToWorld(cx, cy, cw, ch) {
    const ds = this.DIM_SCALE[this.activeDim] || 1;
    const wx = ((cx - cw / 2 - this._panX) / this.MAP_SCALE + this.MAP_CENTER_X) / ds;
    const wz = (this.MAP_CENTER_Z - (cy - ch / 2 - this._panZ) / this.MAP_SCALE) / ds;
    return [wx, wz];
  },

  // 计算区域圆圈圆心和半径（跨维度自动换算中心坐标）
  _groupLayout(group, w, h) {
    const info = group.region;
    let cx, cz;
    if (info && info.center) {
      const nativeDs = this.DIM_SCALE[info.dimension] || 1;
      const curDs = this.DIM_SCALE[this.activeDim] || 1;
      [cx, cz] = this.worldToCanvas(
        Math.round(info.center[0] * curDs / nativeDs),
        Math.round(info.center[2] * curDs / nativeDs), w, h);
    } else {
      let sx = 0, sz = 0;
      for (const p of group.pts) { sx += p.x; sz += p.z; }
      [cx, cz] = this.worldToCanvas(sx / group.pts.length, sz / group.pts.length, w, h);
    }
    const r = Math.max(18, 10 + group.pts.length * 3);
    return { cx, cz, r, name: info ? info.name : group.pts[0].machine._folder };
  },

  findMapMachine(ex, ey) {
    const canvas = document.getElementById('map-canvas');
    const rect = canvas.getBoundingClientRect();
    const mx = ex / (rect.width / canvas.clientWidth);
    const my = ey / (rect.height / canvas.clientHeight);

    let best = null;
    for (const r of this._mapRects) {
      const dx = mx - r.sx;
      const dy = my - r.sz;
      if (dx * dx + dy * dy <= r.r * r.r) {
        // 优先站点 > 机器 > 区域（区域半径大，优先级最低）
        if (r.isStation) return r;
        if (r.isRegion) { best = r; }
        else if (!best || best.isRegion) best = r;
      }
    }
    return best;
  },

  // ========================
  //  卡片视图
  // ========================
  renderCards() {
    const grid = document.getElementById('card-grid');
    const empty = document.getElementById('cards-empty');

    if (this.filtered.length === 0) {
      grid.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    grid.innerHTML = this.filtered.map((m, i) => {
      const catKey = this.CAT_KEYS[m.category] || 'other';
      const disabled = m.enabled === false ? ' disabled' : '';
      const isLandmark = this.LANDMARK_CATEGORIES.includes(m.category);

      const locs = (m.locations || []).map(l =>
        `<div><span class="card-loc-dim">${l.dimension}</span> <span class="card-loc-coords">${(l.coords || []).join(', ')}</span></div>`
      ).join('');

      const prods = isLandmark
        ? (m.owner ? `<span class="card-prod-tag">👤 ${this.escapeHtml(m.owner)}</span>` : (m.notes ? `<span class="card-usage">${this.escapeHtml(m.notes)}</span>` : ''))
        : (m.products || []).map(p => `<span class="card-prod-tag">${p}</span>`).join('');

      const travel = m.station ? `<div class="card-travel">🚏 ${this.escapeHtml(m.station)}</div>` : '';

      const video = m.video_url ? `<a class="card-video" href="${this.escapeHtml(m.video_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📺 教程视频</a>` : '';
      const contrib = m.contributors ? `<div class="card-contrib">👤 ${this.escapeHtml(m.contributors)}</div>` : '';
      const opmode = m.opmode ? `<div class="card-contrib">⚙️ ${this.escapeHtml(m.opmode)}</div>` : '';

      return `
        <div class="card ${catKey}${disabled}" data-idx="${i}">
          <div class="card-header">
            <span class="card-name">${this.escapeHtml(m.name)}</span>
            <span class="card-badge ${catKey}">${this.CAT_ICONS[m.category] || ''} ${m.category}</span>
          </div>
          <div class="card-locations">${locs}</div>
          ${prods ? `<div class="card-products">${prods}</div>` : ''}
          ${travel}
          ${opmode}
          ${contrib}
          ${m.usage ? `<div class="card-usage">${this.escapeHtml(m.usage)}</div>` : ''}
          ${video}
        </div>`;
    }).join('');
  },

  // ========================
  //  表格视图
  // ========================
  renderTable() {
    const tbody = document.getElementById('table-body');
    const empty = document.getElementById('table-empty');

    if (this.filtered.length === 0) {
      tbody.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    const ths = document.querySelectorAll('#machine-table th');
    ths.forEach(th => {
      th.classList.remove('sorted');
      th.removeAttribute('data-dir');
      if (th.dataset.sort === this.sortField) {
        th.classList.add('sorted');
        th.setAttribute('data-dir', this.sortDir === 1 ? '▲' : '▼');
      }
    });

    tbody.innerHTML = this.filtered.map((m, i) => {
      const disabled = m.enabled === false ? ' class="disabled"' : '';
      const statusHtml = m.enabled === false
        ? '<span class="status-dot off"></span>停用'
        : '<span class="status-dot on"></span>正常';
      const locs = (m.locations || []).map(l =>
        `<div>${l.dimension}: ${(l.coords || []).join(', ')}</div>`
      ).join('');
      const isLandmark = this.LANDMARK_CATEGORIES.includes(m.category);
      const prods = isLandmark
        ? (m.owner ? '👤 ' + this.escapeHtml(m.owner) : '')
        : (m.products || []).join('、');
      const travel = m.station || '';

      return `
        <tr${disabled} data-idx="${i}">
          <td class="td-name">${this.escapeHtml(m.name)}</td>
          <td>${this.CAT_ICONS[m.category] || ''} ${m.category}</td>
          <td>${(m.locations || []).map(l => l.dimension).join(' / ')}</td>
          <td class="td-coords">${locs}</td>
          <td class="td-products">${prods}</td>
          <td>${this.escapeHtml(travel)}</td>
          <td class="td-status">${statusHtml}</td>
        </tr>`;
    }).join('');
  },

  // ========================
  //  详情弹窗
  // ========================
  showDetail(machine) {
    const overlay = document.getElementById('detail-overlay');
    const content = document.getElementById('modal-content');
    const catKey = this.CAT_KEYS[machine.category] || 'other';
    const isLandmark = this.LANDMARK_CATEGORIES.includes(machine.category);

    const locs = (machine.locations || []).map(l =>
      `<div>📍 <strong>${l.dimension}</strong>：<span class="modal-value mono">${(l.coords || []).join(', ')}</span></div>`
    ).join('');

    const travel = machine.station
      ? `<div class="modal-section"><div class="modal-label">最近站点</div><div class="modal-value">🚏 ${this.escapeHtml(machine.station)}</div></div>`
      : '';

    const status = machine.enabled === false
      ? '<span style="color:#ef5350">⚠️ 当前停用</span>'
      : '<span style="color:#4caf50">✅ 正常</span>';

    let extra = '';
    if (isLandmark) {
      if (machine.owner) {
        extra += `<div class="modal-section"><div class="modal-label">所属</div><div class="modal-value">👤 ${this.escapeHtml(machine.owner)}</div></div>`;
      }
      if (machine.notes) {
        extra += `<div class="modal-section"><div class="modal-label">简介</div><div class="modal-value">${this.escapeHtml(machine.notes)}</div></div>`;
      }
    } else {
      const prods = (machine.products || []).map(p => `<span class="modal-prod">${p}</span>`).join('');
      extra += `<div class="modal-section"><div class="modal-label">产物</div><div class="modal-products">${prods || '<span style="color:#666">（待补充）</span>'}</div></div>`;
      if (machine.usage) {
        extra += `<div class="modal-section"><div class="modal-label">使用方法</div><div class="modal-value">${this.escapeHtml(machine.usage)}</div></div>`;
      }
    }

    const notes = machine.notes ? `<div class="modal-notes">⚠️ ${this.escapeHtml(machine.notes)}</div>` : '';
    const video = machine.video_url
      ? `<a class="modal-video" href="${this.escapeHtml(machine.video_url)}" target="_blank" rel="noopener">📺 相关链接</a>`
      : '';
    const contrib = machine.contributors
      ? `<div class="modal-section"><div class="modal-label">贡献者</div><div class="modal-value">${this.escapeHtml(machine.contributors)}</div></div>`
      : '';
    const opmode = machine.opmode
      ? `<div class="modal-section"><div class="modal-label">运作方式</div><div class="modal-value">${this.escapeHtml(machine.opmode)}</div></div>`
      : '';

    content.innerHTML = `
      <div class="modal-header">
        <span class="modal-name">${this.escapeHtml(machine.name)}</span>
        <span class="modal-badge ${catKey}">${this.CAT_ICONS[machine.category] || ''} ${machine.category}</span>
      </div>
      <div class="modal-section"><div class="modal-label">状态</div><div class="modal-value">${status}</div></div>
      <div class="modal-section"><div class="modal-label">位置</div><div class="modal-value">${locs}</div></div>
      ${contrib}
      ${opmode}
      ${travel}
      ${extra}
      ${notes ? `<div class="modal-section">${notes}</div>` : ''}
      ${video ? `<div class="modal-section">${video}</div>` : ''}
    `;

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  },

  hideDetail() {
    const overlay = document.getElementById('detail-overlay');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  },

  // ========================
  //  错误提示
  // ========================
  showError(msg) {
    const banner = document.getElementById('error-banner');
    if (!msg) { banner.hidden = true; return; }
    document.getElementById('error-msg').textContent = msg;
    banner.hidden = false;
  },

  // ========================
  //  工具方法
  // ========================
  escapeHtml(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  },

  // ========================
  //  事件绑定
  // ========================
  bindEvents() {
    // 视图切换
    document.querySelectorAll('.view-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.view-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeView = btn.dataset.view;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-' + this.activeView).classList.add('active');
        if (this.activeView === 'map') this.renderMap();
      });
    });

    // 搜索
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim();
      searchClear.hidden = !this.searchQuery;
      this.filter();
      this.renderAll();
    });
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      this.searchQuery = '';
      searchClear.hidden = true;
      this.filter();
      this.renderAll();
      searchInput.focus();
    });

    // 分类筛选
    document.getElementById('category-filters').addEventListener('click', (e) => {
      const chip = e.target.closest('.cat-chip');
      if (!chip) return;
      const cat = chip.dataset.cat;
      if (this.activeCats.has(cat)) {
        this.activeCats.delete(cat);
      } else {
        this.activeCats.add(cat);
      }
      this.filter();
      this.renderAll();
    });

    // 维度切换
    document.getElementById('dimension-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.dim-tab');
      if (!tab) return;
      this.activeDim = tab.dataset.dim;
      this.renderDimensionTabs();
      this.renderMap();
    });

    // 地图交互
    const canvas = document.getElementById('map-canvas');
    const tooltip = document.getElementById('map-tooltip');

    canvas.addEventListener('mousedown', (e) => {
      this._dragging = true;
      this._dragMoved = false;
      this._dragStartX = e.clientX;
      this._dragStartY = e.clientY;
      this._dragPanX = this._panX;
      this._dragPanZ = this._panZ;
      canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._dragging) {
        // 非拖拽时的悬停检测
        if (this.activeView !== 'map') return;
        const rect = canvas.getBoundingClientRect();
        const hit = this.findMapMachine(e.clientX - rect.left, e.clientY - rect.top);
        if (hit) {
          canvas.style.cursor = 'pointer';
          tooltip.hidden = false;
          if (hit.isStation) {
            const s = hit.station;
            const icon = this.STATION_ICONS[s.type] || '';
            tooltip.innerHTML = `<div class="tt-name">${icon} ${this.escapeHtml(s.name)}</div><div class="tt-products">${s.type}</div>`;
          } else if (hit.isRegion) {
            const regionInfo = this.regions[hit.folder];
            const name = regionInfo ? regionInfo.name : hit.folder;
            tooltip.innerHTML = `<div class="tt-name">${this.escapeHtml(name)}</div><div class="tt-products">${hit.machines.length}个设施</div>`;
          } else {
            const prods = (hit.machine.products || []).slice(0, 4).join('、');
            const more = (hit.machine.products || []).length > 4 ? '…' : '';
            const label = this.LANDMARK_CATEGORIES.includes(hit.machine.category)
              ? (hit.machine.owner ? `👤 ${this.escapeHtml(hit.machine.owner)}` : (hit.machine.notes || ''))
              : `${prods}${more}`;
            tooltip.innerHTML = `<div class="tt-name">${this.escapeHtml(hit.machine.name)}</div>${label ? `<div class="tt-products">${label}</div>` : ''}`;
          }
          const csx = canvas.clientWidth / (canvas.width / (window.devicePixelRatio || 1));
          const csy = canvas.clientHeight / (canvas.height / (window.devicePixelRatio || 1));
          tooltip.style.left = (hit.sx * csx) + 'px';
          tooltip.style.top = (hit.sz * csy) + 'px';
        } else {
          canvas.style.cursor = this._dragging ? 'grabbing' : 'grab';
          tooltip.hidden = true;
        }
        return;
      }

      const dx = e.clientX - this._dragStartX;
      const dy = e.clientY - this._dragStartY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._dragMoved = true;
      this._panX = this._dragPanX + dx;
      this._panZ = this._dragPanZ + dy;
      this.renderMap();
      tooltip.hidden = true;
    });

    window.addEventListener('mouseup', () => {
      if (this._dragging) {
        this._dragging = false;
        canvas.style.cursor = 'grab';
      }
    });

    canvas.addEventListener('click', (e) => {
      if (this._dragMoved) return;
      const rect = canvas.getBoundingClientRect();
      const hit = this.findMapMachine(e.clientX - rect.left, e.clientY - rect.top);
      if (hit && hit.machine) this.showDetail(hit.machine);
    });

    canvas.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
      if (!this._dragging) canvas.style.cursor = 'grab';
    });

    // 滚轮缩放
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const [wx, wz] = this.canvasToWorld(mx, my, rect.width, rect.height);

      const zoom = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newScale = Math.min(12, Math.max(0.15, this.MAP_SCALE * zoom));
      this.MAP_SCALE = newScale;

      const [nx, nz] = this.worldToCanvas(wx, wz, rect.width, rect.height);
      this._panX += mx - nx;
      this._panZ += my - nz;

      this.renderMap();
    }, { passive: false });

    // 卡片点击
    document.getElementById('card-grid').addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      const idx = parseInt(card.dataset.idx);
      if (!isNaN(idx) && this.filtered[idx]) this.showDetail(this.filtered[idx]);
    });

    // 表格点击
    document.getElementById('table-body').addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      if (!row) return;
      const idx = parseInt(row.dataset.idx);
      if (!isNaN(idx) && this.filtered[idx]) this.showDetail(this.filtered[idx]);
    });

    // 表格排序
    document.querySelectorAll('#machine-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (this.sortField === field) {
          this.sortDir *= -1;
        } else {
          this.sortField = field;
          this.sortDir = 1;
        }
        this.sort();
        this.renderTable();
      });
    });

    // 弹窗关闭
    document.getElementById('modal-close').addEventListener('click', () => {
      this.hideDetail();
    });
    document.getElementById('modal-backdrop').addEventListener('click', () => {
      this.hideDetail();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hideDetail();
    });

    // 错误关闭
    document.getElementById('error-dismiss').addEventListener('click', () => this.showError(null));

    // 窗口大小变化 — 重绘地图
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (this.activeView === 'map') this.renderMap();
      }, 150);
    });
  }
};

// 启动
document.addEventListener('DOMContentLoaded', () => App.init());
