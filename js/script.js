/* =========================================================
   WebGIS Pro — an Esri-ArcGIS-Pro-inspired web mapping app
   built on Leaflet + Leaflet.draw + Turf.js
   ========================================================= */

// ---------- Map init ----------
let map = L.map('map', { zoomControl: false, attributionControl: true });
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.scale({ position: 'bottomleft', metric: true, imperial: true }).addTo(map);

// Continental US bounding box — used for the initial view and "Full Extent"
const US_BOUNDS = [[24.396308, -125.0], [49.384358, -66.93457]];
map.fitBounds(US_BOUNDS);

// ---------- Basemaps (public Esri tile services + OSM, no API key required) ----------
const basemaps = {
  streets: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '<span class="attribution"> ESRI — World Street Map</span>' }),
  topo:    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri — World Topo Map' }),
  imagery: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri — World Imagery' }),
  dark:    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'Esri — Dark Gray Canvas' }),
  osm:     L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }),
};
let currentBasemapKey = 'streets';
basemaps[currentBasemapKey].addTo(map);

function setBasemap(key){
  if(!basemaps[key] || key === currentBasemapKey) return;
  map.removeLayer(basemaps[currentBasemapKey]);
  basemaps[key].addTo(map);
  currentBasemapKey = key;
  document.querySelectorAll('.bm-opt').forEach(el => el.classList.toggle('active', el.dataset.bm === key));
}

// ---------- Small helpers ----------
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function randomColor(){
  const palette = ['#3da7e0','#5ec98f','#e0b13d','#c97ee0','#e0635a','#4fd1c5','#f08fb0'];
  return palette[Math.floor(Math.random()*palette.length)];
}

const COLOR_RAMPS = [
  { name:'Blues',    min:'#f7fbff', max:'#08306b' },
  { name:'Reds',     min:'#fff5f0', max:'#67000d' },
  { name:'Greens',   min:'#f7fcf5', max:'#00441b' },
  { name:'Oranges',  min:'#fff5eb', max:'#7f2704' },
  { name:'Purples',  min:'#fcfbfd', max:'#3f007d' },
  { name:'YlOrRd',   min:'#ffffcc', max:'#800026' },
  { name:'YlGn',     min:'#ffffe5', max:'#004529' },
  { name:'OrRd',     min:'#fff7ec', max:'#7f0000' },
  { name:'PuBu',     min:'#f1eef6', max:'#034e7b' },
  { name:'RdPu',     min:'#fff7f3', max:'#7a0177' },
  { name:'RdYlGn',   min:'#d73027', max:'#1a9850' },
  { name:'RdBu',     min:'#b2182b', max:'#2166ac' },
  { name:'Spectral', min:'#d53e4f', max:'#3288bd' },
  { name:'BrBG',     min:'#8c510a', max:'#003c30' },
  { name:'Viridis',  min:'#440154', max:'#fde725' },
  { name:'Plasma',   min:'#0d0887', max:'#f0f921' },
  { name:'Inferno',  min:'#000004', max:'#fcffa4' },
  { name:'Hot',      min:'#ffffff', max:'#7f0000' },
];

const QUAL_PALETTES = {
  'Pastel':   ['#a6cee3','#1f78b4','#b2df8a','#33a02c','#fb9a99','#e31a1c','#fdbf6f','#ff7f00','#cab2d6','#6a3d9a','#ffff99','#b15928'],
  'Vivid':    ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'],
  'Dark':     ['#1b9e77','#d95f02','#7570b3','#e7298a','#66a61e','#e6ab02','#a6761d','#666666'],
  'Muted':    ['#8dd3c7','#ffffb3','#bebada','#fb8072','#80b1d3','#fdb462','#b3de69','#fccde5','#d9d9d9','#bc80bd'],
  'Tableau':  ['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac'],
  'Earth':    ['#8B4513','#A0522D','#CD853F','#DEB887','#D2691E','#BC8F8F','#F4A460','#DAA520','#B8860B'],
};
function popupHtml(props, fields){
  const entries = Object.entries(props || {})
    .filter(([k]) => !fields || fields.includes(k))
    .map(([k,v]) => `<b>${escapeHtml(k)}:</b> ${escapeHtml(v)}`);
  return entries.join('<br>') || '<i>No attributes</i>';
}

// ---------- Layer registry (Contents pane) ----------
let layerIdCounter = 1;
const layers = {}; // id -> { name, leafletLayer, visible, color, type, opacity, weight, fillOpacity, radius, customFill, allFeatures, labelsOn, labelField, queryExpr, symbologyMode, symbologyConfig }

// Browser-side autosave (see the implementation near the end of this file).
// Declared up here, not just near that implementation, because scheduleAutosave()
// gets called from renderLayerList()/syncLinkedFeatureClass() — which run during
// the very first render at startup — long before restoreAutosaveState() has had
// a chance to run and flip this back to false.
let _autosaveTimer = null;
let _autosaveRestoring = true;

function addLayerToRegistry(name, leafletLayer, color, type, forcedId){
  const id = forcedId || ('L' + (layerIdCounter++));
  if(forcedId){
    // Restoring a specific id from autosave — make sure future auto-ids
    // can't collide with it.
    const n = parseInt(String(forcedId).replace(/^L/, ''), 10);
    if(!isNaN(n) && n >= layerIdCounter) layerIdCounter = n + 1;
  }
  layers[id] = {
    name, leafletLayer, visible: true,
    color: color || '#3da7e0', strokeColor: color || '#3da7e0', fillColor: color || '#3da7e0',
    opacity: 1, strokeOpacity: 1, fillOpacity: 0.4, dashArray: null,
    weight: 2, radius: 6, type: type || 'feature',
    allFeatures: [], labelsOn: false, labelField: null, queryExpr: null,
    labelColor: '#ffffff', labelHaloColor: '#000000', labelSize: 12,
    labelBold: true, labelItalic: false, labelUppercase: true, labelDirection: 'top',
    symbologyMode: 'single', // 'single', 'graduated', 'unique'
    symbologyConfig: { field: null, minColor: '#f7fbff', maxColor: '#08306b', breaks: 5, colorRamp: 'Blues', classificationMethod: 'quantile', uniqueColors: {}, fillOpacity: 0.8,
      heatField: null, heatRadius: 25, heatBlur: 15, heatMax: 1.0, heatMinColor: '#0000ff', heatMidColor: '#00ff00', heatMaxColor: '#ff0000' },
    // Cartographic effects — apply on top of whichever symbology mode is
    // active, rendered as CSS filter: drop-shadow() on each feature's SVG path.
    effects: { shadowEnabled: false, shadowColor: '#000000', shadowBlur: 4, shadowOffsetX: 2, shadowOffsetY: 2,
      glowEnabled: false, glowColor: '#3da7e0', glowBlur: 6 }
  };
  // Track every individual feature layer (for Definition Query, Labels, Properties, Export)
  // even ones later hidden by a query, since those get add/removed from the map dynamically.
  if(leafletLayer.eachLayer) leafletLayer.eachLayer(l => layers[id].allFeatures.push(l));
  if(leafletLayer.on){
    leafletLayer.on('layeradd', e => {
      if(!layers[id]) return;
      if(!layers[id].allFeatures.includes(e.layer)) layers[id].allFeatures.push(e.layer);
      applyLayerEffects(layers[id], [e.layer]);
    });
  }
  leafletLayer.addTo(map);
  renderLayerList();
  updateStatusLayers();
  return id;
}

function getLayerStyle(lyr){
  return {
    color: lyr.strokeColor,
    fillColor: lyr.fillColor || lyr.strokeColor,
    weight: lyr.weight ?? 2,
    opacity: lyr.strokeOpacity ?? 1,
    fillOpacity: lyr.fillOpacity ?? 0.4,
    dashArray: lyr.dashArray || null,
    radius: lyr.radius ?? 6
  };
}

function applyLayerStyle(lyr){
  const style = getLayerStyle(lyr);
  if(lyr.leafletLayer.setStyle) lyr.leafletLayer.setStyle(style);
  else if(lyr.leafletLayer.eachLayer) lyr.leafletLayer.eachLayer(l => { if(l.setStyle) l.setStyle(style); });
  applyLayerEffects(lyr);
}

// Cartographic effects (shadow / outer glow) — these aren't Leaflet style
// options, so instead of setStyle() this sets a CSS filter directly on each
// feature's rendered SVG element. Applies on top of whatever symbology mode
// (single/graduated/unique) is active, since it's a rendering effect, not a
// classification. Pass `features` to touch just one feature (e.g. a newly
// drawn one) instead of the whole layer.
function applyLayerEffects(lyr, features){
  const eff = lyr && lyr.effects;
  if(!eff) return;
  const filters = [];
  if(eff.shadowEnabled){
    filters.push(`drop-shadow(${eff.shadowOffsetX}px ${eff.shadowOffsetY}px ${eff.shadowBlur}px ${eff.shadowColor})`);
  }
  if(eff.glowEnabled){
    filters.push(`drop-shadow(0 0 ${eff.glowBlur}px ${eff.glowColor})`);
    filters.push(`drop-shadow(0 0 ${eff.glowBlur}px ${eff.glowColor})`); // doubled — a single pass reads too faint as a "glow"
  }
  const filterStr = filters.join(' ');
  (features || lyr.allFeatures).forEach(l => {
    const el = l._path || (l.getElement && l.getElement());
    if(el) el.style.filter = filterStr;
  });
}

function removeLayer(id){
  if(!layers[id]) return;
  // Persist to GeoPackage before the layer is lost from memory
  syncLinkedFeatureClass(id);
  if(activeSketchLayerId === id) activeSketchLayerId = null;
  if(layers[id]._heatLayer) map.removeLayer(layers[id]._heatLayer);
  map.removeLayer(layers[id].leafletLayer);
  delete layers[id];
  idbDelete('layers', id).catch(() => {}); // drop it from autosave right away, don't wait for the debounce
  renderLayerList();
  updateStatusLayers();
  refreshTable();
  refreshGPLayerOptions();
}

function buildLegendHTML(lyr){
  if(lyr.symbologyMode === 'graduated' && lyr.symbologyConfig.field){
    const breaks = lyr.symbologyConfig._cachedBreaks || computeClassBreaks(lyr);
    if(!breaks || breaks.length < 2) return '';
    const numClasses = breaks.length - 1;
    const rows = [];
    for(let i = 0; i < numClasses; i++){
      const ratio = numClasses > 1 ? i / (numClasses - 1) : 0;
      const color = interpolateColor(lyr.symbologyConfig.minColor, lyr.symbologyConfig.maxColor, ratio);
      const from = breaks[i].toFixed(2);
      const to   = breaks[i + 1].toFixed(2);
      rows.push(`<div class="legend-row"><span class="legend-swatch" style="background:${color}"></span><span class="legend-label">${escapeHtml(from)} – ${escapeHtml(to)}</span></div>`);
    }
    return `<div class="layer-legend">${rows.join('')}</div>`;
  }
  if(lyr.symbologyMode === 'unique' && lyr.symbologyConfig.field){
    const entries = Object.entries(lyr.symbologyConfig.uniqueColors);
    if(entries.length === 0) return '';
    const rows = entries.map(([val, color]) =>
      `<div class="legend-row"><span class="legend-swatch" style="background:${escapeHtml(color)}"></span><span class="legend-label">${escapeHtml(val)}</span></div>`
    );
    return `<div class="layer-legend">${rows.join('')}</div>`;
  }
  return '';
}

function renderLayerList(){
  scheduleAutosave();
  const list = document.getElementById('layer-list');
  list.innerHTML = '';
  const ids = Object.keys(layers).reverse();
  if(ids.length === 0){
    list.innerHTML = '<div style="padding:24px 10px;color:var(--text-faint);font-size:12px;text-align:center;">No layers yet.<br>Add data or create a sketch layer below.</div>';
    refreshGPLayerOptions();
    return;
  }
  const rawKeys = Object.keys(layers); // insertion order — last key draws on top
  ids.forEach(id => {
    const lyr = layers[id];
    const item = document.createElement('div');
    item.className = 'layer-item' + (id === activeSketchLayerId ? ' active-layer' : '');
    item.dataset.layerid = id;
    item.title = 'Click to make this the active layer for editing. Right-click for Symbology, Query, and more';
    const isRaster = lyr.type === 'raster';
    const swatchColor = lyr.fillColor || lyr.strokeColor || lyr.color || '#3da7e0';
    const count = lyr.allFeatures.length;
    const legendHTML = isRaster ? '' : buildLegendHTML(lyr);
    const rawIdx = rawKeys.indexOf(id);
    const canMoveUp = rawIdx < rawKeys.length - 1; // draws later = appears higher in the TOC
    const canMoveDown = rawIdx > 0;
    item.innerHTML = `
      <div class="layer-row">
        <input type="checkbox" ${lyr.visible ? 'checked' : ''} data-toggle="${id}">
        ${isRaster
          ? '<span class="layer-swatch" style="background:transparent;display:flex;align-items:center;justify-content:center;font-size:11px;">🖼</span>'
          : `<span class="layer-swatch" style="background:${escapeHtml(swatchColor)};${legendHTML ? 'display:none' : ''}"></span>`}
        <span class="layer-name">${escapeHtml(lyr.name)}${lyr.queryExpr ? ' <span style="color:var(--text-faint);font-weight:400;">(filtered)</span>' : ''}</span>
        ${id === activeSketchLayerId ? '<span class="layer-editing-badge" title="Active editing layer">✎</span>' : ''}
        ${isRaster ? '' : `<span class="layer-count" title="${count} feature${count === 1 ? '' : 's'}">${count}</span>`}
        <div class="layer-reorder">
          <button class="layer-reorder-btn" data-move-up="${id}" title="Move layer up" type="button" ${canMoveUp ? '' : 'disabled'}>▲</button>
          <button class="layer-reorder-btn" data-move-down="${id}" title="Move layer down" type="button" ${canMoveDown ? '' : 'disabled'}>▼</button>
        </div>
        ${isRaster ? '' : `<button class="layer-save-btn" data-save="${id}" title="Save edits to layer" type="button">💾</button>`}
      </div>
      ${legendHTML}
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('[data-move-up]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      moveLayerUp(btn.dataset.moveUp);
    });
  });
  list.querySelectorAll('[data-move-down]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      moveLayerDown(btn.dataset.moveDown);
    });
  });

  list.querySelectorAll('[data-save]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      commitLayerEdits(btn.dataset.save);
    });
  });

  list.querySelectorAll('[data-toggle]').forEach(cb => {
    cb.addEventListener('change', e => {
      const id = e.target.dataset.toggle;
      const lyr = layers[id];
      if(!lyr) return;
      lyr.visible = e.target.checked;
      if(lyr.visible){
        lyr.leafletLayer.addTo(map);
        if(lyr._heatLayer) lyr._heatLayer.addTo(map);
      } else {
        map.removeLayer(lyr.leafletLayer);
        if(lyr._heatLayer) map.removeLayer(lyr._heatLayer);
      }
      updateStatusLayers();
    });
  });

  list.querySelectorAll('.layer-item').forEach(item => {
    item.addEventListener('click', e => {
      if(e.target.closest('[data-toggle]')) return;
      const id = item.dataset.layerid;
      if(!layers[id] || id === activeSketchLayerId) return;
      activeSketchLayerId = id;
      renderLayerList();
    });
  });

  refreshGPLayerOptions();
}

function updateStatusLayers(){
  document.getElementById('status-layers').textContent = 'Coordinate System' + (Object.keys(layers).length === 1 ? '' : 's');
}

// ---------- Layer right-click context menu ----------
let lastCtxX = 0, lastCtxY = 0;

document.getElementById('layer-list').addEventListener('contextmenu', e => {
  const item = e.target.closest('.layer-item');
  if(!item) return;
  e.preventDefault();
  lastCtxX = e.clientX;
  lastCtxY = e.clientY;
  openLayerContextMenu(item.dataset.layerid, e.clientX, e.clientY);
});

function positionFloating(el, x, y){
  const margin = 8;
  const rect = el.getBoundingClientRect();
  let left = x, top = y;
  if(left + rect.width > window.innerWidth - margin) left = window.innerWidth - rect.width - margin;
  if(top + rect.height > window.innerHeight - margin) top = window.innerHeight - rect.height - margin;
  el.style.left = Math.max(margin, left) + 'px';
  el.style.top = Math.max(margin, top) + 'px';
}

function openLayerContextMenu(id, x, y){
  const lyr = layers[id];
  if(!lyr) return;
  const menu = document.getElementById('ctx-menu');
  menu.dataset.layerid = id;
  const layerIds = Object.keys(layers);
  const layerIdx = layerIds.indexOf(id);
  const isRaster = lyr.type === 'raster';
  const rasterSymbologyItem = (isRaster && lyr.rasterRender)
    ? `<div class="ctx-item" data-ctx="symbology">🎨 Symbology…</div><div class="ctx-sep"></div>`
    : '';
  const vectorOnlyItems = isRaster ? rasterSymbologyItem : `
    <div class="ctx-item" data-ctx="attrTable">📋 Attribute Table</div>
    <div class="ctx-item" data-ctx="selectAll">☑️ Select All Features</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" data-ctx="symbology">🎨 Symbology…</div>
    <div class="ctx-item" data-ctx="query">🔎 Definition Query…</div>
    <div class="ctx-item" data-ctx="popup">🖼️ Configure Popup…</div>
    <div class="ctx-item" data-ctx="labels">🏷️ ${lyr.labelsOn ? 'Remove Labels' : 'Label Features…'}</div>
    <div class="ctx-sep"></div>`;
  menu.innerHTML = `
    <div class="ctx-item" data-ctx="zoomTo">🔍 Zoom To Layer</div>
    ${vectorOnlyItems}
    <div class="ctx-item${layerIdx < layerIds.length - 1 ? '' : ' disabled'}" data-ctx="moveUp">⬆️ Move Up</div>
    <div class="ctx-item${layerIdx > 0 ? '' : ' disabled'}" data-ctx="moveDown">⬇️ Move Down</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" data-ctx="rename">✏️ Rename…</div>
    ${isRaster ? '' : '<div class="ctx-item" data-ctx="export">⬇️ Export as GeoJSON</div>'}
    <div class="ctx-item" data-ctx="properties">ℹ️ Properties…</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item danger" data-ctx="remove">🗑️ Remove Layer</div>
  `;
  menu.classList.add('show');
  positionFloating(menu, x, y);
  document.removeEventListener('click', closeContextMenuOnce, { capture: true });
  document.addEventListener('click', closeContextMenuOnce, { capture: true });
}
function closeContextMenuOnce(){
  document.getElementById('ctx-menu').classList.remove('show');
  document.removeEventListener('click', closeContextMenuOnce, { capture: true });
}
document.getElementById('ctx-menu').addEventListener('click', e => {
  const item = e.target.closest('.ctx-item');
  if(!item) return;
  const id = document.getElementById('ctx-menu').dataset.layerid;
  handleLayerContextAction(item.dataset.ctx, id);
});

function handleLayerContextAction(action, id){
  const lyr = layers[id];
  if(!lyr) return;
  switch(action){
    case 'zoomTo':
      try{ map.fitBounds(lyr.leafletLayer.getBounds(), { maxZoom: 16 }); }
      catch(e){ alert('This layer has no spatial extent to zoom to.'); }
      break;
    case 'attrTable':
      tableFilterLayerId = id;
      document.getElementById('table-dock').classList.add('show');
      refreshTable();
      break;
    case 'symbology': (lyr.rasterRender ? openRasterSymbologyPopover(id) : openSymbologyPopover(id)); break;
    case 'query': openQueryPopover(id); break;
    case 'popup': openPopupConfigPopover(id); break;
    case 'labels': toggleLabels(id); break;
    case 'rename': {
      const name = prompt('Rename layer:', lyr.name);
      if(name){ lyr.name = name; renderLayerList(); refreshTable(); }
      break;
    }
    case 'export': exportLayerGeoJSON(id); break;
    case 'properties': openPropertiesPopover(id); break;
    case 'remove': removeLayer(id); break;
    case 'selectAll': selectAllInLayer(id); break;
    case 'moveUp': moveLayerUp(id); break;
    case 'moveDown': moveLayerDown(id); break;
  }
}

// ---------- Layer popover (Symbology / Definition Query / Properties) ----------
function showPopover(){
  const pop = document.getElementById('layer-popover');
  pop.classList.add('show');
  positionFloating(pop, lastCtxX, lastCtxY);
}
function closePopover(){
  document.getElementById('layer-popover').classList.remove('show');
}
document.getElementById('popover-close').addEventListener('click', closePopover);

function getFieldValues(features, field){
  const values = [];
  features.forEach(f => {
    const val = f.feature?.properties?.[field];
    if(val !== null && val !== undefined && !values.includes(val)) values.push(val);
  });
  return values;
}

function getNumericValues(lyr, field){
  return lyr.allFeatures
    .map(l => parseFloat(l.feature?.properties?.[field]))
    .filter(v => !isNaN(v))
    .sort((a,b) => a-b);
}

function getGraduatedColor(lyr, value){
  if(isNaN(value)) return lyr.fillColor;
  if(!lyr.symbologyConfig._cachedBreaks){
    lyr.symbologyConfig._cachedBreaks = computeClassBreaks(lyr);
  }
  const breaks = lyr.symbologyConfig._cachedBreaks;
  if(!breaks || breaks.length < 2) return lyr.fillColor;
  const numClasses = breaks.length - 1;
  const classIdx = getClassFromBreaks(value, breaks);
  const ratio = numClasses > 1 ? classIdx / (numClasses - 1) : 0;
  return interpolateColor(lyr.symbologyConfig.minColor, lyr.symbologyConfig.maxColor, ratio);
}

function getUniqueColor(lyr, value){
  const key = String(value);
  if(!lyr.symbologyConfig.uniqueColors[key]){
    lyr.symbologyConfig.uniqueColors[key] = randomColor();
  }
  return lyr.symbologyConfig.uniqueColors[key];
}

function getFeatureStyle(lyr, feature){
  const thematic = lyr.symbologyMode === 'graduated' || lyr.symbologyMode === 'unique';
  const baseStyle = {
    color: lyr.strokeColor,
    fillColor: lyr.fillColor,
    weight: lyr.weight,
    opacity: lyr.strokeOpacity,
    fillOpacity: thematic ? (lyr.symbologyConfig.fillOpacity ?? 0.8) : lyr.fillOpacity,
    radius: lyr.radius
  };

  let thematicColor = null;
  if(lyr.symbologyMode === 'graduated' && lyr.symbologyConfig.field){
    const val = parseFloat(feature.properties?.[lyr.symbologyConfig.field]);
    thematicColor = getGraduatedColor(lyr, val);
  } else if(lyr.symbologyMode === 'unique' && lyr.symbologyConfig.field){
    const val = feature.properties?.[lyr.symbologyConfig.field];
    thematicColor = getUniqueColor(lyr, val);
  }

  if(thematicColor){
    baseStyle.fillColor = thematicColor;
    // Lines have no fill to show a thematic color with — the stroke IS the
    // visible line, so that's what needs to carry the per-category color.
    const geomType = feature.geometry && feature.geometry.type;
    if(geomType === 'LineString' || geomType === 'MultiLineString') baseStyle.color = thematicColor;
  }

  return baseStyle;
}

function interpolateColor(color1, color2, ratio){
  const c1 = parseInt(color1.slice(1), 16);
  const c2 = parseInt(color2.slice(1), 16);
  const r1 = (c1 >> 16) & 255, g1 = (c1 >> 8) & 255, b1 = c1 & 255;
  const r2 = (c2 >> 16) & 255, g2 = (c2 >> 8) & 255, b2 = c2 & 255;
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// Fisher-Jenks natural breaks optimisation. Returns (k+1) sorted break values.
function jenksBreaks(sorted, k){
  const n = sorted.length;
  if(n <= k) return [...sorted];
  const lcl = Array.from({length: n + 1}, () => new Array(k + 1).fill(0));
  const vc  = Array.from({length: n + 1}, () => new Array(k + 1).fill(Infinity));
  for(let j = 1; j <= k; j++){ lcl[1][j] = 1; vc[1][j] = 0; }
  for(let l = 2; l <= n; l++){
    let s1 = 0, s2 = 0, w = 0;
    for(let m = 1; m <= l; m++){
      const i3 = l - m + 1;
      const v = sorted[i3 - 1];
      s1 += v; s2 += v * v; w++;
      const variance = s2 - (s1 * s1) / w;
      const i4 = i3 - 1;
      if(i4 !== 0){
        for(let j = 2; j <= k; j++){
          const cand = variance + vc[i4][j - 1];
          if(vc[l][j] >= cand){ lcl[l][j] = i3; vc[l][j] = cand; }
        }
      }
    }
    lcl[l][1] = 1;
    // recompute full-range variance for class 1
    let fs = 0, fs2 = 0;
    for(let i = 0; i < l; i++){ fs += sorted[i]; fs2 += sorted[i] * sorted[i]; }
    vc[l][1] = fs2 - (fs * fs) / l;
  }
  const breaks = new Array(k + 1);
  breaks[0] = sorted[0]; breaks[k] = sorted[n - 1];
  let idx = n;
  for(let j = k; j >= 2; j--){
    breaks[j - 1] = sorted[lcl[idx][j] - 1];
    idx = lcl[idx][j] - 1;
  }
  return breaks;
}

// Returns array of (numClasses+1) break values for the chosen method.
function computeClassBreaks(lyr){
  const values = getNumericValues(lyr, lyr.symbologyConfig.field);
  if(values.length < 2) return null;
  const k = Math.max(2, Math.min(lyr.symbologyConfig.breaks || 5, 10));
  const min = values[0], max = values[values.length - 1];
  if(min === max) return null;
  const method = lyr.symbologyConfig.classificationMethod || 'quantile';

  if(method === 'equal'){
    const step = (max - min) / k;
    return Array.from({length: k + 1}, (_, i) => i === k ? max : min + i * step);
  }
  if(method === 'quantile'){
    const breaks = [min];
    for(let i = 1; i < k; i++){
      breaks.push(values[Math.min(Math.floor(i * values.length / k), values.length - 1)]);
    }
    breaks.push(max);
    return breaks;
  }
  if(method === 'jenks'){
    return jenksBreaks(values, k);
  }
  return null;
}

// Finds which class (0-based) a value falls into given break boundaries.
function getClassFromBreaks(value, breaks){
  const n = breaks.length - 1;
  if(value >= breaks[n]) return n - 1;
  for(let i = 1; i <= n; i++){
    if(value < breaks[i]) return i - 1;
  }
  return n - 1;
}

function applyThematicStyle(lyr){
  if(lyr.symbologyMode !== 'heatmap') removeHeatLayer(lyr);

  if(lyr.symbologyMode === 'single'){
    const s = getLayerStyle(lyr);
    lyr.allFeatures.forEach(l => { if(l.setStyle) l.setStyle(s); });
  } else if(lyr.symbologyMode === 'heatmap'){
    applyHeatmapStyle(lyr);
  } else {
    if(lyr.symbologyMode === 'graduated'){
      lyr.symbologyConfig._cachedBreaks = computeClassBreaks(lyr);
    }
    lyr.allFeatures.forEach(l => {
      if(l.setStyle && l.feature){
        l.setStyle(getFeatureStyle(lyr, l.feature));
      }
    });
  }
  applyLayerEffects(lyr);
}

function removeHeatLayer(lyr){
  if(lyr._heatLayer){
    map.removeLayer(lyr._heatLayer);
    lyr._heatLayer = null;
  }
  // Restore point visibility if we're coming off heatmap mode
  if(lyr.symbologyMode === 'heatmap'){
    lyr.allFeatures.forEach(l => {
      if(l.setStyle) l.setStyle({ opacity: lyr.strokeOpacity ?? 1, fillOpacity: lyr.fillOpacity ?? 0.7 });
    });
  }
}

function applyHeatmapStyle(lyr){
  const cfg = lyr.symbologyConfig;
  const points = [];
  lyr.allFeatures.forEach(l => {
    if(!l.feature) return;
    const geom = l.feature.geometry;
    if(!geom) return;
    let lat, lng;
    if(geom.type === 'Point'){ [lng, lat] = geom.coordinates; }
    else if(geom.type === 'MultiPoint'){ [lng, lat] = geom.coordinates[0]; }
    else return;
    if(isNaN(lat) || isNaN(lng)) return;
    let intensity = 1;
    if(cfg.heatField){
      const v = parseFloat(l.feature.properties?.[cfg.heatField]);
      if(!isNaN(v) && v > 0) intensity = v;
    }
    points.push([lat, lng, intensity]);
    // Hide the underlying marker so only the heat layer shows
    if(l.setStyle) l.setStyle({ opacity: 0, fillOpacity: 0 });
  });
  const gradient = { 0.4: cfg.heatMinColor || '#0000ff', 0.65: cfg.heatMidColor || '#00ff00', 1.0: cfg.heatMaxColor || '#ff0000' };
  lyr._heatLayer = L.heatLayer(points, {
    radius: cfg.heatRadius || 25,
    blur:   cfg.heatBlur   || 15,
    max:    cfg.heatMax    || 1.0,
    gradient
  }).addTo(map);
}

// Recolors a raster-analysis output (currently: Hillshade) by remapping its
// stored grayscale value through a min/max ramp — a 256-entry lookup table,
// so this stays fast even on multi-megapixel rasters — instead of redoing
// the underlying analysis math.
function recolorRasterLayer(lyr, minColor, maxColor){
  const rr = lyr.rasterRender;
  if(!rr) return;
  const lut = new Uint8Array(256 * 3);
  for(let i = 0; i < 256; i++){
    const hex = interpolateColor(minColor, maxColor, i / 255);
    const v = parseInt(hex.slice(1), 16);
    lut[i*3] = (v >> 16) & 255; lut[i*3+1] = (v >> 8) & 255; lut[i*3+2] = v & 255;
  }
  const { width, height, grayscale } = rr;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  for(let idx = 0; idx < width * height; idx++){
    const p = idx * 4;
    const a = grayscale[p+3];
    img.data[p+3] = a;
    if(a === 0) continue;
    const gray = grayscale[p];
    img.data[p] = lut[gray*3]; img.data[p+1] = lut[gray*3+1]; img.data[p+2] = lut[gray*3+2];
  }
  ctx.putImageData(img, 0, 0);
  lyr.leafletLayer.setUrl(canvas.toDataURL());
  rr.minColor = minColor;
  rr.maxColor = maxColor;
}

function openRasterSymbologyPopover(id){
  const lyr = layers[id];
  const rr = lyr.rasterRender;
  if(!rr) return;
  document.getElementById('popover-title').textContent = 'Symbology — ' + lyr.name;
  document.getElementById('popover-body').innerHTML = `
    <div class="gp-field"><label>Recolor this ${escapeHtml(rr.kind)} layer by its shading value</label></div>
    <div class="gp-row">
      <div class="gp-field"><label>Low Color</label><input type="color" id="raster-sym-min" value="${rr.minColor}"></div>
      <div class="gp-field"><label>High Color</label><input type="color" id="raster-sym-max" value="${rr.maxColor}"></div>
    </div>
    <div class="grad-preview" id="raster-sym-preview" style="background:linear-gradient(to right,${rr.minColor},${rr.maxColor})"></div>
    <button class="btn" id="raster-sym-reset" style="width:100%;margin-top:8px;">Reset to Grayscale</button>
    <button class="btn primary" id="raster-sym-apply" style="width:100%;margin-top:8px;">Apply</button>
  `;
  showPopover();

  const updatePreview = () => {
    const min = document.getElementById('raster-sym-min').value;
    const max = document.getElementById('raster-sym-max').value;
    document.getElementById('raster-sym-preview').style.background = `linear-gradient(to right,${min},${max})`;
  };
  document.getElementById('raster-sym-min').addEventListener('input', updatePreview);
  document.getElementById('raster-sym-max').addEventListener('input', updatePreview);
  document.getElementById('raster-sym-reset').addEventListener('click', () => {
    document.getElementById('raster-sym-min').value = '#000000';
    document.getElementById('raster-sym-max').value = '#ffffff';
    updatePreview();
  });
  document.getElementById('raster-sym-apply').addEventListener('click', () => {
    recolorRasterLayer(lyr, document.getElementById('raster-sym-min').value, document.getElementById('raster-sym-max').value);
    closePopover();
  });
}

function openSymbologyPopover(id){
  const lyr = layers[id];
  if(!lyr.effects){
    lyr.effects = { shadowEnabled: false, shadowColor: '#000000', shadowBlur: 4, shadowOffsetX: 2, shadowOffsetY: 2,
      glowEnabled: false, glowColor: '#3da7e0', glowBlur: 6 };
  }
  const geomTypes = lyr.allFeatures.map(l => l.feature && l.feature.geometry && l.feature.geometry.type).filter(Boolean);
  const hasPoint = geomTypes.some(t => t === 'Point' || t === 'MultiPoint');
  const sample = (lyr.allFeatures[0]?.feature?.properties) || {};
  const fieldNames = Object.keys(sample);
  
  document.getElementById('popover-title').textContent = 'Symbology — ' + lyr.name;
  document.getElementById('popover-body').innerHTML = `
    <div style="display:flex;gap:4px;margin-bottom:10px;font-size:11px;flex-wrap:wrap;">
      <button class="sym-tab active" data-tab="single">Single Symbol</button>
      <button class="sym-tab" data-tab="graduated">Graduated Color</button>
      <button class="sym-tab" data-tab="unique">Unique Values</button>
      ${hasPoint ? '<button class="sym-tab" data-tab="heatmap">Heat Map</button>' : ''}
    </div>
    
    <div id="sym-tab-single" class="sym-tab-content show">
      <div class="gp-row">
        <div class="gp-field"><label>Stroke Color</label><input type="color" id="sym-stroke-color" value="${lyr.strokeColor}"></div>
        <div class="gp-field"><label>Fill Color</label><input type="color" id="sym-fill-color" value="${lyr.fillColor}"></div>
      </div>
      <div class="gp-row">
        <div class="gp-field"><label>Stroke Width</label><input type="number" id="sym-weight" min="0" max="20" step="0.5" value="${lyr.weight}"></div>
        ${hasPoint ? `<div class="gp-field"><label>Point Radius</label><input type="number" id="sym-radius" min="1" max="40" step="1" value="${lyr.radius}"></div>` : ''}
      </div>
      <div class="gp-row">
        <div class="gp-field"><label>Stroke Opacity</label><input type="range" id="sym-opacity" min="0" max="1" step="0.05" value="${lyr.strokeOpacity}"></div>
        <div class="gp-field"><label>Fill Opacity</label><input type="range" id="sym-fillopacity" min="0" max="1" step="0.05" value="${lyr.fillOpacity}"></div>
      </div>
    </div>
    
    <div id="sym-tab-graduated" class="sym-tab-content">
      <div class="gp-field"><label>Field</label>
        <select id="grad-field">
          <option value="">— Select field —</option>
          ${fieldNames.map(f => `<option value="${escapeHtml(f)}" ${lyr.symbologyConfig.field === f ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}
        </select>
      </div>
      <div class="gp-field">
        <label>Color Scheme</label>
        <div class="sym-ramps" id="sym-ramps">
          ${COLOR_RAMPS.map(r => `<button class="sym-ramp-btn${lyr.symbologyConfig.colorRamp === r.name ? ' active' : ''}" title="${r.name}" data-min="${r.min}" data-max="${r.max}" data-name="${escapeHtml(r.name)}" style="background:linear-gradient(to right,${r.min},${r.max})"></button>`).join('')}
        </div>
      </div>
      <div class="gp-row">
        <div class="gp-field"><label>Min Color</label><input type="color" id="grad-min-color" value="${lyr.symbologyConfig.minColor}"></div>
        <div class="gp-field"><label>Max Color</label><input type="color" id="grad-max-color" value="${lyr.symbologyConfig.maxColor}"></div>
      </div>
      <div class="grad-preview" id="grad-preview" style="background:linear-gradient(to right,${lyr.symbologyConfig.minColor},${lyr.symbologyConfig.maxColor})"></div>
      <div class="gp-row">
        <div class="gp-field"><label>Color Breaks</label><input type="number" id="grad-breaks" min="3" max="10" value="${lyr.symbologyConfig.breaks}"></div>
        <div class="gp-field"><label>Fill Opacity <span id="grad-opacity-val">${Math.round((lyr.symbologyConfig.fillOpacity ?? 0.8)*100)}%</span></label><input type="range" id="grad-fill-opacity" min="0" max="1" step="0.05" value="${lyr.symbologyConfig.fillOpacity ?? 0.8}"></div>
      </div>
      <div class="gp-field">
        <label>Classification Method</label>
        <select id="grad-method">
          <option value="quantile"${(lyr.symbologyConfig.classificationMethod||'quantile')==='quantile' ? ' selected' : ''}>Quantile</option>
          <option value="equal"${lyr.symbologyConfig.classificationMethod==='equal' ? ' selected' : ''}>Equal Interval</option>
          <option value="jenks"${lyr.symbologyConfig.classificationMethod==='jenks' ? ' selected' : ''}>Natural Breaks (Jenks)</option>
        </select>
      </div>
      <div class="gp-row" style="margin-top:6px;">
        <div class="gp-field"><label>Stroke Color</label><input type="color" id="grad-stroke-color" value="${lyr.strokeColor}"></div>
        <div class="gp-field"><label>Stroke Width</label><input type="number" id="grad-stroke-width" min="0" max="10" step="0.5" value="${lyr.weight ?? 2}" style="width:100%;"></div>
      </div>
    </div>

    <div id="sym-tab-unique" class="sym-tab-content">
      <div class="gp-field"><label>Field</label>
        <select id="unique-field">
          <option value="">— Select field —</option>
          ${fieldNames.map(f => `<option value="${escapeHtml(f)}" ${lyr.symbologyConfig.field === f ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}
        </select>
      </div>
      <div class="sym-palette-row">
        <select id="unique-palette">
          ${Object.keys(QUAL_PALETTES).map(p => `<option value="${p}">${p}</option>`).join('')}
        </select>
        <button class="btn" id="unique-gen-colors">Generate Colors</button>
      </div>
      <div id="unique-colors-list" style="margin-top:6px;max-height:140px;overflow-y:auto;"></div>
      <div class="gp-field" style="margin-top:6px;"><label>Fill Opacity <span id="unique-opacity-val">${Math.round((lyr.symbologyConfig.fillOpacity ?? 0.8)*100)}%</span></label><input type="range" id="unique-fill-opacity" min="0" max="1" step="0.05" value="${lyr.symbologyConfig.fillOpacity ?? 0.8}"></div>
      <div class="gp-row" style="margin-top:6px;">
        <div class="gp-field"><label>Stroke Color</label><input type="color" id="unique-stroke-color" value="${lyr.strokeColor}"></div>
        <div class="gp-field"><label>Stroke Width</label><input type="number" id="unique-stroke-width" min="0" max="10" step="0.5" value="${lyr.weight ?? 2}" style="width:100%;"></div>
      </div>
    </div>

    ${hasPoint ? `
    <div id="sym-tab-heatmap" class="sym-tab-content">
      <div class="gp-field">
        <label>Intensity Field <span style="color:var(--text-faint);font-weight:400;">(optional)</span></label>
        <select id="heat-field">
          <option value="">— Equal weight (point count) —</option>
          ${fieldNames.map(f => `<option value="${escapeHtml(f)}"${lyr.symbologyConfig.heatField === f ? ' selected' : ''}>${escapeHtml(f)}</option>`).join('')}
        </select>
      </div>
      <div class="gp-row">
        <div class="gp-field"><label>Radius (px)</label><input type="number" id="heat-radius" min="5" max="80" value="${lyr.symbologyConfig.heatRadius ?? 25}" style="width:100%;"></div>
        <div class="gp-field"><label>Blur (px)</label><input type="number" id="heat-blur" min="1" max="60" value="${lyr.symbologyConfig.heatBlur ?? 15}" style="width:100%;"></div>
      </div>
      <div class="gp-field"><label>Max Intensity <span style="color:var(--text-faint);font-weight:400;">(scale for intensity field)</span></label>
        <input type="number" id="heat-max" min="0.01" step="any" value="${lyr.symbologyConfig.heatMax ?? 1.0}" style="width:100%;">
      </div>
      <div class="gp-field" style="margin-top:6px;"><label>Color Gradient</label>
        <div style="display:flex;gap:6px;align-items:center;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px;color:var(--text-faint);">
            <input type="color" id="heat-color-low" value="${lyr.symbologyConfig.heatMinColor ?? '#0000ff'}">Low
          </div>
          <div id="heat-grad-preview" class="grad-preview" style="flex:1;"></div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px;color:var(--text-faint);">
            <input type="color" id="heat-color-mid" value="${lyr.symbologyConfig.heatMidColor ?? '#00ff00'}">Mid
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px;color:var(--text-faint);">
            <input type="color" id="heat-color-high" value="${lyr.symbologyConfig.heatMaxColor ?? '#ff0000'}">High
          </div>
        </div>
      </div>
    </div>` : ''}

    <div class="gp-field" style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px;">
      <label style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">Effects <span style="color:var(--text-faint);font-weight:400;text-transform:none;letter-spacing:normal;">(applies no matter which mode above is active)</span></label>
    </div>

    <label style="display:flex;align-items:center;gap:6px;font-weight:normal;font-size:12px;color:var(--text-dim);margin-bottom:6px;">
      <input type="checkbox" id="eff-shadow-on" ${lyr.effects.shadowEnabled ? 'checked' : ''}> Drop Shadow
    </label>
    <div class="gp-row">
      <div class="gp-field"><label>Shadow Color</label><input type="color" id="eff-shadow-color" value="${lyr.effects.shadowColor}"></div>
      <div class="gp-field"><label>Blur</label><input type="number" id="eff-shadow-blur" min="0" max="30" value="${lyr.effects.shadowBlur}"></div>
    </div>
    <div class="gp-row">
      <div class="gp-field"><label>Offset X</label><input type="number" id="eff-shadow-x" min="-30" max="30" value="${lyr.effects.shadowOffsetX}"></div>
      <div class="gp-field"><label>Offset Y</label><input type="number" id="eff-shadow-y" min="-30" max="30" value="${lyr.effects.shadowOffsetY}"></div>
    </div>

    <label style="display:flex;align-items:center;gap:6px;font-weight:normal;font-size:12px;color:var(--text-dim);margin:10px 0 6px;">
      <input type="checkbox" id="eff-glow-on" ${lyr.effects.glowEnabled ? 'checked' : ''}> Outer Glow
    </label>
    <div class="gp-row">
      <div class="gp-field"><label>Glow Color</label><input type="color" id="eff-glow-color" value="${lyr.effects.glowColor}"></div>
      <div class="gp-field"><label>Glow Blur</label><input type="number" id="eff-glow-blur" min="0" max="30" value="${lyr.effects.glowBlur}"></div>
    </div>

    <button class="btn primary" id="sym-apply" style="width:100%;margin-top:10px;">Apply</button>
  `;
  showPopover();
  
  const tabs = document.querySelectorAll('.sym-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.sym-tab-content').forEach(c => c.classList.remove('show'));
      tab.classList.add('active');
      document.getElementById('sym-tab-' + tab.dataset.tab).classList.add('show');
    });
  });
  
  const updateUniqueColorsList = () => {
    const field = document.getElementById('unique-field').value;
    const listEl = document.getElementById('unique-colors-list');
    if(!field){ listEl.innerHTML = '<div style="color:var(--text-faint);font-size:12px;">Select a field to see unique values.</div>'; return; }
    const values = getFieldValues(lyr.allFeatures, field);
    values.forEach(v => getUniqueColor(lyr, v));
    listEl.innerHTML = values.map((v) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="flex:1;font-size:11px;">${escapeHtml(String(v))}</span>
        <input type="color" class="unique-color" data-value="${escapeHtml(String(v))}" value="${escapeHtml(lyr.symbologyConfig.uniqueColors[String(v)])}">
      </div>
    `).join('');
  };

  document.getElementById('unique-field').addEventListener('change', updateUniqueColorsList);
  if(lyr.symbologyMode === 'unique' && lyr.symbologyConfig.field){
    document.getElementById('unique-field').value = lyr.symbologyConfig.field;
    updateUniqueColorsList();
  }

  // Unique: generate colors from selected palette
  document.getElementById('unique-gen-colors').addEventListener('click', () => {
    const field = document.getElementById('unique-field').value;
    if(!field){ alert('Select a field first.'); return; }
    const palName = document.getElementById('unique-palette').value;
    const pal = QUAL_PALETTES[palName] || Object.values(QUAL_PALETTES)[0];
    const values = getFieldValues(lyr.allFeatures, field);
    values.forEach((v, i) => { lyr.symbologyConfig.uniqueColors[String(v)] = pal[i % pal.length]; });
    updateUniqueColorsList();
  });

  // Graduated: color ramp swatch buttons
  const updateGradPreview = () => {
    const min = document.getElementById('grad-min-color').value;
    const max = document.getElementById('grad-max-color').value;
    document.getElementById('grad-preview').style.background = `linear-gradient(to right,${min},${max})`;
  };
  document.querySelectorAll('.sym-ramp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sym-ramp-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('grad-min-color').value = btn.dataset.min;
      document.getElementById('grad-max-color').value = btn.dataset.max;
      updateGradPreview();
    });
  });
  document.getElementById('grad-min-color').addEventListener('input', () => {
    document.querySelectorAll('.sym-ramp-btn').forEach(b => b.classList.remove('active'));
    updateGradPreview();
  });
  document.getElementById('grad-max-color').addEventListener('input', () => {
    document.querySelectorAll('.sym-ramp-btn').forEach(b => b.classList.remove('active'));
    updateGradPreview();
  });
  document.getElementById('grad-fill-opacity').addEventListener('input', e => {
    document.getElementById('grad-opacity-val').textContent = Math.round(e.target.value * 100) + '%';
  });
  document.getElementById('unique-fill-opacity').addEventListener('input', e => {
    document.getElementById('unique-opacity-val').textContent = Math.round(e.target.value * 100) + '%';
  });

  if(hasPoint){
    const updateHeatGradPreview = () => {
      const lo = document.getElementById('heat-color-low').value;
      const mi = document.getElementById('heat-color-mid').value;
      const hi = document.getElementById('heat-color-high').value;
      document.getElementById('heat-grad-preview').style.background =
        `linear-gradient(to right, ${lo}, ${mi}, ${hi})`;
    };
    updateHeatGradPreview();
    ['heat-color-low','heat-color-mid','heat-color-high'].forEach(id =>
      document.getElementById(id).addEventListener('input', updateHeatGradPreview)
    );
  }

  document.getElementById('sym-apply').addEventListener('click', () => {
    const activeTab = document.querySelector('.sym-tab.active').dataset.tab;

    if(activeTab === 'single'){
      lyr.symbologyMode = 'single';
      lyr.strokeColor = document.getElementById('sym-stroke-color').value;
      lyr.fillColor = document.getElementById('sym-fill-color').value;
      lyr.color = lyr.strokeColor;
      lyr.weight = parseFloat(document.getElementById('sym-weight').value) || 0;
      if(hasPoint) lyr.radius = parseFloat(document.getElementById('sym-radius').value) || 1;
      lyr.strokeOpacity = parseFloat(document.getElementById('sym-opacity').value);
      lyr.fillOpacity = parseFloat(document.getElementById('sym-fillopacity').value);
    } else if(activeTab === 'graduated'){
      const field = document.getElementById('grad-field').value;
      if(!field){ alert('Select a field to classify'); return; }
      lyr.symbologyMode = 'graduated';
      lyr.symbologyConfig.field = field;
      lyr.symbologyConfig.minColor = document.getElementById('grad-min-color').value;
      lyr.symbologyConfig.maxColor = document.getElementById('grad-max-color').value;
      lyr.symbologyConfig.breaks = parseInt(document.getElementById('grad-breaks').value) || 5;
      lyr.symbologyConfig.fillOpacity = parseFloat(document.getElementById('grad-fill-opacity').value) ?? 0.8;
      lyr.symbologyConfig.colorRamp = document.querySelector('.sym-ramp-btn.active')?.dataset.name || null;
      lyr.symbologyConfig.classificationMethod = document.getElementById('grad-method').value;
      lyr.symbologyConfig._cachedBreaks = null;
      lyr.strokeColor = document.getElementById('grad-stroke-color').value;
      lyr.color = lyr.strokeColor;
      lyr.weight = parseFloat(document.getElementById('grad-stroke-width').value) ?? 2;
    } else if(activeTab === 'unique'){
      const field = document.getElementById('unique-field').value;
      if(!field){ alert('Select a field to classify'); return; }
      lyr.symbologyMode = 'unique';
      lyr.symbologyConfig.field = field;
      document.querySelectorAll('.unique-color').forEach(input => {
        lyr.symbologyConfig.uniqueColors[input.dataset.value] = input.value;
      });
      lyr.symbologyConfig.fillOpacity = parseFloat(document.getElementById('unique-fill-opacity').value) ?? 0.8;
      lyr.strokeColor = document.getElementById('unique-stroke-color').value;
      lyr.color = lyr.strokeColor;
      lyr.weight = parseFloat(document.getElementById('unique-stroke-width').value) ?? 2;
    } else if(activeTab === 'heatmap'){
      lyr.symbologyMode = 'heatmap';
      lyr.symbologyConfig.heatField    = document.getElementById('heat-field').value || null;
      lyr.symbologyConfig.heatRadius   = parseInt(document.getElementById('heat-radius').value) || 25;
      lyr.symbologyConfig.heatBlur     = parseInt(document.getElementById('heat-blur').value) || 15;
      lyr.symbologyConfig.heatMax      = parseFloat(document.getElementById('heat-max').value) || 1.0;
      lyr.symbologyConfig.heatMinColor = document.getElementById('heat-color-low').value;
      lyr.symbologyConfig.heatMidColor = document.getElementById('heat-color-mid').value;
      lyr.symbologyConfig.heatMaxColor = document.getElementById('heat-color-high').value;
    }

    lyr.effects.shadowEnabled = document.getElementById('eff-shadow-on').checked;
    lyr.effects.shadowColor   = document.getElementById('eff-shadow-color').value;
    lyr.effects.shadowBlur    = parseFloat(document.getElementById('eff-shadow-blur').value) || 0;
    lyr.effects.shadowOffsetX = parseFloat(document.getElementById('eff-shadow-x').value) || 0;
    lyr.effects.shadowOffsetY = parseFloat(document.getElementById('eff-shadow-y').value) || 0;
    lyr.effects.glowEnabled   = document.getElementById('eff-glow-on').checked;
    lyr.effects.glowColor     = document.getElementById('eff-glow-color').value;
    lyr.effects.glowBlur      = parseFloat(document.getElementById('eff-glow-blur').value) || 0;

    applyThematicStyle(lyr);
    renderLayerList();
    // Deliberately left open — Symbology is the one dialog you typically want
    // to keep tweaking (colors, ramps, effects) and see the result live,
    // rather than reopening it after every change. Close it with the × when done.
  });
}

function openPopupConfigPopover(id){
  const lyr = layers[id];
  const sample = (lyr.allFeatures[0] && lyr.allFeatures[0].feature && lyr.allFeatures[0].feature.properties) || {};
  const fieldNames = Object.keys(sample);
  const currentFields = Array.isArray(lyr.popupFields) ? lyr.popupFields : fieldNames;
  document.getElementById('popover-title').textContent = 'Popup Configuration — ' + lyr.name;
  const fieldHtml = fieldNames.length
    ? fieldNames.map(f => `<label class="popup-field-row"><input type="checkbox" value="${escapeHtml(f)}" ${currentFields.includes(f) ? 'checked' : ''}> ${escapeHtml(f)}</label>`).join('')
    : '<div style="color:var(--text-faint);font-size:12px;">No fields available for popup configuration.</div>';
  document.getElementById('popover-body').innerHTML = `
    <div class="gp-field" style="margin-bottom:10px;"><label>Choose fields to show in the popup</label></div>
    <div id="popup-field-list" style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow:auto;">${fieldHtml}</div>
    <button class="btn primary" id="popup-apply" style="width:100%;margin-top:10px;">Apply</button>
    <button class="btn" id="popup-reset" style="width:100%;margin-top:6px;">Show All Fields</button>
  `;
  showPopover();
  document.getElementById('popup-apply').addEventListener('click', () => {
    const selected = Array.from(document.querySelectorAll('#popup-field-list input[type=checkbox]:checked')).map(el => el.value);
    lyr.popupFields = selected.length ? selected : null;
    refreshLayerPopups(lyr);
    closePopover();
  });
  document.getElementById('popup-reset').addEventListener('click', () => {
    lyr.popupFields = null;
    refreshLayerPopups(lyr);
    closePopover();
  });
}

function refreshLayerPopups(lyr){
  if(!lyr || !lyr.leafletLayer || !lyr.leafletLayer.eachLayer) return;
  lyr.leafletLayer.eachLayer(l => {
    if(l.unbindPopup) l.unbindPopup();
    if(l.bindPopup) l.bindPopup(popupHtml(l.feature?.properties || {}, lyr.popupFields));
  });
}

function openQueryPopover(id){
  const lyr = layers[id];
  const sample = (lyr.allFeatures[0] && lyr.allFeatures[0].feature && lyr.allFeatures[0].feature.properties) || {};
  const fieldNames = Object.keys(sample);
  document.getElementById('popover-title').textContent = 'Definition Query — ' + lyr.name;
  const fieldHtml = fieldNames.length
    ? `<select id="qry-field">${fieldNames.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}</select>`
    : `<input id="qry-field" type="text" placeholder="field name">`;
  document.getElementById('popover-body').innerHTML = `
    <div class="gp-field"><label>Field</label>${fieldHtml}</div>
    <div class="gp-row">
      <div class="gp-field"><label>Operator</label>
        <select id="qry-op">
          <option value="=">=</option><option value="!=">≠</option>
          <option value=">">&gt;</option><option value="<">&lt;</option>
          <option value=">=">&ge;</option><option value="<=">&le;</option>
          <option value="contains">contains</option>
        </select>
      </div>
      <div class="gp-field"><label>Value</label><input id="qry-value" type="text" placeholder="value"></div>
    </div>
    <button class="btn primary" id="qry-apply" style="width:100%;margin-top:6px;">Apply Query</button>
    <button class="btn" id="qry-clear" style="width:100%;margin-top:6px;">Clear Query</button>
    <div id="qry-result" style="margin-top:10px;font-size:12px;color:var(--text-dim);"></div>
  `;
  showPopover();
  document.getElementById('qry-apply').addEventListener('click', () => {
    const field = document.getElementById('qry-field').value.trim();
    const op = document.getElementById('qry-op').value;
    const value = document.getElementById('qry-value').value;
    if(!field){ document.getElementById('qry-result').textContent = 'Enter a field name.'; return; }
    const count = applyDefinitionQuery(id, field, op, value);
    document.getElementById('qry-result').textContent = `${count} of ${lyr.allFeatures.length} feature(s) match.`;
  });
  document.getElementById('qry-clear').addEventListener('click', () => {
    clearDefinitionQuery(id);
    document.getElementById('qry-result').textContent = 'Query cleared — showing all features.';
  });
}

function openPropertiesPopover(id){
  const lyr = layers[id];
  const count = lyr.allFeatures.length;
  let extentStr = 'n/a';
  try{
    const b = lyr.leafletLayer.getBounds();
    extentStr = `${b.getSouth().toFixed(4)}, ${b.getWest().toFixed(4)} to ${b.getNorth().toFixed(4)}, ${b.getEast().toFixed(4)}`;
  }catch(e){}
  document.getElementById('popover-title').textContent = 'Layer Properties';
  document.getElementById('popover-body').innerHTML = `
    <table class="popover-table">
      <tr><td class="k">Name</td><td>${escapeHtml(lyr.name)}</td></tr>
      <tr><td class="k">Type</td><td>${escapeHtml(lyr.type)}</td></tr>
      <tr><td class="k">Features</td><td>${count}</td></tr>
      <tr><td class="k">Extent (S,W to N,E)</td><td>${extentStr}</td></tr>
      <tr><td class="k">CRS</td><td>WGS 84 (EPSG:4326)</td></tr>
      <tr><td class="k">Definition Query</td><td>${lyr.queryExpr ? escapeHtml(lyr.queryExpr) : '(none)'}</td></tr>
      <tr><td class="k">Labels</td><td>${lyr.labelsOn ? 'On (' + escapeHtml(lyr.labelField) + ')' : 'Off'}</td></tr>
    </table>
  `;
  showPopover();
}

// ---------- Definition Query engine ----------
function evaluateQuery(raw, op, value){
  const numRaw = parseFloat(raw), numVal = parseFloat(value);
  const bothNumeric = !isNaN(numRaw) && !isNaN(numVal) && raw !== '' && raw !== null && raw !== undefined;
  switch(op){
    case '=': return bothNumeric ? numRaw === numVal : String(raw) === value;
    case '!=': return bothNumeric ? numRaw !== numVal : String(raw) !== value;
    case '>': return bothNumeric && numRaw > numVal;
    case '<': return bothNumeric && numRaw < numVal;
    case '>=': return bothNumeric && numRaw >= numVal;
    case '<=': return bothNumeric && numRaw <= numVal;
    case 'contains': return String(raw ?? '').toLowerCase().includes(String(value).toLowerCase());
    default: return true;
  }
}

function applyDefinitionQuery(id, field, op, value){
  const lyr = layers[id];
  if(!lyr) return 0;
  let matchCount = 0;
  lyr.allFeatures.forEach(l => {
    const props = (l.feature && l.feature.properties) || {};
    const match = evaluateQuery(props[field], op, value);
    if(match){
      matchCount++;
      if(!lyr.leafletLayer.hasLayer(l)) lyr.leafletLayer.addLayer(l);
    } else if(lyr.leafletLayer.hasLayer(l)){
      lyr.leafletLayer.removeLayer(l);
    }
  });
  lyr.queryExpr = `${field} ${op} ${value}`;
  renderLayerList();
  refreshTable();
  return matchCount;
}

function clearDefinitionQuery(id){
  const lyr = layers[id];
  if(!lyr) return;
  lyr.allFeatures.forEach(l => { if(!lyr.leafletLayer.hasLayer(l)) lyr.leafletLayer.addLayer(l); });
  lyr.queryExpr = null;
  renderLayerList();
  refreshTable();
}

// ---------- Label Features ----------
function toggleLabels(id){
  const lyr = layers[id];
  if(!lyr || lyr.allFeatures.length === 0){ alert('This layer has no features to label.'); return; }
  if(lyr.labelsOn){
    lyr.allFeatures.forEach(l => { if(l.getTooltip && l.getTooltip()) l.unbindTooltip(); });
    lyr.labelsOn = false;
    lyr.labelField = null;
    renderLayerList();
  } else {
    openLabelDialog(id);
  }
}

function openLabelDialog(id){
  const lyr = layers[id];
  const sample = (lyr.allFeatures[0]?.feature?.properties) || {};
  const fields = Object.keys(sample);
  if(fields.length === 0){ alert('This layer has no attributes to label with.'); return; }

  const fieldOpts = fields.map(f =>
    `<option value="${escapeHtml(f)}" ${lyr.labelField === f ? 'selected' : ''}>${escapeHtml(f)}</option>`
  ).join('');

  document.getElementById('popover-title').textContent = 'Label Features — ' + lyr.name;
  document.getElementById('popover-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;padding-top:4px;">

      <div class="gp-field">
        <label>Label Field</label>
        <select id="lbl-field" style="width:100%;background:var(--bg-panel-raised);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:6px 8px;font-size:12px;">${fieldOpts}</select>
      </div>

      <div class="gp-row">
        <div class="gp-field">
          <label>Font Size</label>
          <input type="number" id="lbl-size" min="8" max="48" value="${lyr.labelSize}" style="width:70px;background:var(--bg-panel-raised);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:5px 8px;font-size:12px;">
        </div>
        <div class="gp-field">
          <label>Position</label>
          <select id="lbl-dir" style="background:var(--bg-panel-raised);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:5px 8px;font-size:12px;">
            <option value="top"    ${lyr.labelDirection==='top'    ?'selected':''}>Above</option>
            <option value="center" ${lyr.labelDirection==='center' ?'selected':''}>Center</option>
            <option value="bottom" ${lyr.labelDirection==='bottom' ?'selected':''}>Below</option>
          </select>
        </div>
      </div>

      <div class="gp-row">
        <div class="gp-field">
          <label>Text Color</label>
          <input type="color" id="lbl-color" value="${lyr.labelColor}">
        </div>
        <div class="gp-field">
          <label>Halo Color</label>
          <input type="color" id="lbl-halo" value="${lyr.labelHaloColor}">
        </div>
      </div>

      <div class="gp-field">
        <label>Style</label>
        <div style="display:flex;gap:14px;margin-top:5px;">
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-dim);font-weight:normal;">
            <input type="checkbox" id="lbl-bold"      ${lyr.labelBold      ? 'checked' : ''}> Bold
          </label>
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-dim);font-weight:normal;">
            <input type="checkbox" id="lbl-italic"    ${lyr.labelItalic    ? 'checked' : ''}> Italic
          </label>
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-dim);font-weight:normal;">
            <input type="checkbox" id="lbl-upper"     ${lyr.labelUppercase ? 'checked' : ''}> Uppercase
          </label>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:4px;">
        <button class="btn primary" id="lbl-apply" style="flex:1;">Apply</button>
        <button class="btn"         id="lbl-cancel">Cancel</button>
      </div>
    </div>
  `;

  showPopover();

  document.getElementById('lbl-cancel').addEventListener('click', closePopover);

  document.getElementById('lbl-apply').addEventListener('click', () => {
    lyr.labelField     = document.getElementById('lbl-field').value;
    lyr.labelColor     = document.getElementById('lbl-color').value;
    lyr.labelHaloColor = document.getElementById('lbl-halo').value;
    lyr.labelSize      = parseInt(document.getElementById('lbl-size').value) || 12;
    lyr.labelBold      = document.getElementById('lbl-bold').checked;
    lyr.labelItalic    = document.getElementById('lbl-italic').checked;
    lyr.labelUppercase = document.getElementById('lbl-upper').checked;
    lyr.labelDirection = document.getElementById('lbl-dir').value;
    applyLabels(id);
    closePopover();
    renderLayerList();
  });
}

const LABEL_MIN_SIZE = 8, LABEL_MAX_SIZE = 48; // matches the Label dialog's Font Size input range

function labelCss(lyr, size){
  const h = lyr.labelHaloColor;
  return [
    `color:${lyr.labelColor}`,
    `font-size:${size}px`,
    `font-weight:${lyr.labelBold ? '700' : '400'}`,
    `font-style:${lyr.labelItalic ? 'italic' : 'normal'}`,
    `text-transform:${lyr.labelUppercase ? 'uppercase' : 'none'}`,
    `letter-spacing:0.04em`,
    `font-family:Segoe UI,system-ui,sans-serif`,
    `text-shadow:-1px -1px 2px ${h},1px -1px 2px ${h},-1px 1px 2px ${h},1px 1px 2px ${h},0 0 6px ${h}`
  ].join(';');
}

function applyLabels(id){
  const lyr = layers[id];
  lyr.allFeatures.forEach(l => { if(l.getTooltip && l.getTooltip()) l.unbindTooltip(); });

  const dir    = lyr.labelDirection || 'top';
  const offset = dir === 'bottom' ? [0, 8] : [0, -8];

  lyr.allFeatures.forEach(l => {
    const val = (l.feature?.properties?.[lyr.labelField]) ?? '';
    const size = l._labelSize || lyr.labelSize;
    l.bindTooltip(`<span style="${labelCss(lyr, size)}">${escapeHtml(String(val))}</span>`, {
      permanent: true, direction: dir, className: 'feature-label', offset, interactive: true
    });
    // Concentric buffer rings share one centroid, so their default label
    // anchor (the polygon center) would stack every ring's label on top of
    // each other. If this feature has a precomputed anchor further out
    // (see attachRingLabelAnchors) — or the user has already dragged this
    // label once before — open the tooltip there instead.
    if(l._labelAnchor) l.openTooltip(l._labelAnchor);
    wireLabelDrag(l, lyr);
  });
  lyr.labelsOn = true;
}

// ---------- Feature labels: drag to reposition ----------
// Labels are Leaflet tooltips, not markers, so they don't get draggability
// for free — this wires a plain mousedown/mousemove/mouseup drag onto the
// tooltip's own DOM element, then pins the result via the same _labelAnchor
// mechanism attachRingLabelAnchors() uses, so a dragged position sticks
// across re-styling (font/color changes just rebind the tooltip) and stays
// geographically anchored on pan/zoom. Double-click resets to the default
// (feature-centroid) position.
// { l, startX, startY, moved } while a mouse button is down on a label —
// "moved" only flips true once the pointer has actually traveled past a
// small threshold, so a plain click or the two clicks of a double-click
// (used to reset a label) don't get misread as a drag.
let _labelDrag = null;
const LABEL_DRAG_THRESHOLD = 4; // px

function wireLabelDrag(l, lyr){
  const tooltip = l.getTooltip();
  const el = tooltip && tooltip.getElement();
  if(!el) return;
  el.addEventListener('mousedown', e => {
    e.stopPropagation();
    e.preventDefault();
    _labelDrag = { l, startX: e.clientX, startY: e.clientY, moved: false };
  });
  el.addEventListener('dblclick', e => {
    e.stopPropagation();
    e.preventDefault();
    delete l._labelAnchor;
    delete l._labelSize;
    const span = el.querySelector('span');
    if(span) span.style.fontSize = lyr.labelSize + 'px';
    l.closeTooltip();
    l.openTooltip();
  });
  // Scroll over a label to resize just that one label, independent of the
  // layer's shared Font Size setting — stopPropagation keeps this from also
  // zooming the map underneath.
  el.addEventListener('wheel', e => {
    e.preventDefault();
    e.stopPropagation();
    const current = l._labelSize || lyr.labelSize;
    const next = Math.max(LABEL_MIN_SIZE, Math.min(LABEL_MAX_SIZE, current + (e.deltaY < 0 ? 1 : -1)));
    l._labelSize = next;
    const span = el.querySelector('span');
    if(span) span.style.fontSize = next + 'px';
  }, { passive: false });
}

function labelDragLatLng(e){
  const rect = map.getContainer().getBoundingClientRect();
  return map.containerPointToLatLng(L.point(e.clientX - rect.left, e.clientY - rect.top));
}

document.addEventListener('mousemove', e => {
  if(!_labelDrag) return;
  if(!_labelDrag.moved){
    const dx = e.clientX - _labelDrag.startX, dy = e.clientY - _labelDrag.startY;
    if(Math.hypot(dx, dy) < LABEL_DRAG_THRESHOLD) return;
    _labelDrag.moved = true;
    map.dragging.disable();
    const el = _labelDrag.l.getTooltip() && _labelDrag.l.getTooltip().getElement();
    if(el) el.classList.add('label-dragging');
  }
  _labelDrag.l.openTooltip(labelDragLatLng(e));
});

document.addEventListener('mouseup', e => {
  if(!_labelDrag) return;
  const { l, moved } = _labelDrag;
  if(moved){
    l._labelAnchor = labelDragLatLng(e);
    const tooltipEl = l.getTooltip() && l.getTooltip().getElement();
    if(tooltipEl) tooltipEl.classList.remove('label-dragging');
    map.dragging.enable();
  }
  _labelDrag = null;
});

// Gives each ring of a multi-distance Buffer output its own label anchor —
// the ring's own centroid pushed out along its DISTANCE, due north — so
// labels fan out instead of overlapping at the shared buffer center.
function attachRingLabelAnchors(lyr, units){
  lyr.allFeatures.forEach(l => {
    const dist = l.feature?.properties?.DISTANCE;
    if(dist == null) return;
    try{
      const centroid = turf.centroid(l.feature);
      const labelPt = turf.destination(centroid, dist, 0, { units });
      const [lon, lat] = labelPt.geometry.coordinates;
      l._labelAnchor = L.latLng(lat, lon);
    }catch(e){}
  });
}

// ---------- Export a single layer ----------
function exportLayerGeoJSON(id){
  const lyr = layers[id];
  if(!lyr) return;
  const selected = getSelectedFeaturesForLayer(lyr);
  const gj = selected.length > 0
    ? turf.featureCollection(selected)
    : lyr.leafletLayer.toGeoJSON();
  const blob = new Blob([JSON.stringify(gj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (lyr.name || 'layer').replace(/[^\w.-]+/g, '_') + '.geojson';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Sketch / draw layer (Leaflet.draw) ----------
let sketchFeatureGroup = new L.FeatureGroup();
let sketchLayerId = null;
let activeSketchLayerId = null; // track which sketch layer is active for drawing

function ensureSketchLayerRegistered(){
  if(!activeSketchLayerId && !sketchLayerId){
    sketchLayerId = addLayerToRegistry('Sketch Layer', sketchFeatureGroup, '#e0635a', 'sketch');
    activeSketchLayerId = sketchLayerId;
  }
  return activeSketchLayerId || sketchLayerId;
}

function getActiveSketchLayer(){
  if(activeSketchLayerId && layers[activeSketchLayerId]){
    return { id: activeSketchLayerId, layer: layers[activeSketchLayerId] };
  }
  const id = ensureSketchLayerRegistered();
  return { id, layer: layers[id] };
}

let currentTool = 'pan';
let activeDrawHandler = null;
let selectedFeatureLayer = null;

function stopActiveDraw(){
  if(activeDrawHandler){ activeDrawHandler.disable(); activeDrawHandler = null; }
}

function completeActiveDrawShape(){
  if(!activeDrawHandler) return false;
  if(typeof activeDrawHandler.completeShape === 'function'){
    try{ activeDrawHandler.completeShape(); return true; }catch(e){}
  }
  if(typeof activeDrawHandler.finishShape === 'function'){
    try{ activeDrawHandler.finishShape(); return true; }catch(e){}
  }
  return false;
}

function addDistanceSegmentToActiveDraw(input){
  if(!activeDrawHandler || !activeDrawHandler._markers || activeDrawHandler._markers.length === 0) return false;
  const match = String(input || '').trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(north|south|east|west|n|s|e|w)$/i);
  if(!match) return false;
  const meters = parseFloat(match[1]);
  const direction = match[2].toLowerCase();
  const last = activeDrawHandler._markers[activeDrawHandler._markers.length - 1].getLatLng();
  let lat = last.lat;
  let lng = last.lng;
  const degLat = meters / 110540;
  const degLng = meters / (111320 * Math.cos(lat * Math.PI / 180) || 1);
  if(direction === 'north' || direction === 'n') lat += degLat;
  else if(direction === 'south' || direction === 's') lat -= degLat;
  else if(direction === 'east' || direction === 'e') lng += degLng;
  else if(direction === 'west' || direction === 'w') lng -= degLng;

  const latlng = L.latLng(lat, lng);
  if(activeDrawHandler._poly){ activeDrawHandler._poly.addLatLng(latlng); }
  if(activeDrawHandler._shape){ activeDrawHandler._shape.addLatLng(latlng); }
  const marker = L.marker(latlng, { icon: activeDrawHandler.options.icon || new L.DivIcon({ className: 'leaflet-draw-guide-icon custom-draw-vertex', iconSize:[8,8] }) });
  marker.addTo(map);
  activeDrawHandler._markers.push(marker);
  return true;
}

const TOOL_LABELS = {
  pan:'Pan', point:'Add Point', line:'Draw Line', polygon:'Draw Polygon',
  select:'Identify (I)', 'select-rect':'Select by Rectangle (R)',
  'select-lasso':'Lasso Select (L)',
  'measure-dist':'Measure Distance', 'measure-area':'Measure Area',
  'edit-feature':'Edit Features', 'move-feature':'Move Feature'
};

function setTool(tool){
  stopActiveDraw();
  if(currentTool === 'edit-feature' && tool !== 'edit-feature'){
    if(selectedFeatureLayer) disableLayerEditing(selectedFeatureLayer);
  }
  currentTool = tool;
  document.querySelectorAll('.rbtn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  document.getElementById('status-tool').textContent = TOOL_LABELS[tool] || tool;

  map.getContainer().style.cursor = (tool === 'pan') ? '' : 'crosshair';

  const commonGuideIcon = new L.DivIcon({ className: 'leaflet-draw-guide-icon custom-draw-vertex', iconSize:[8,8] });
  if(tool === 'point') activeDrawHandler = new L.Draw.Marker(map, { icon: sketchIcon('#e0635a') });
  if(tool === 'line') activeDrawHandler = new L.Draw.Polyline(map, { shapeOptions: { color: '#e0635a', weight: 3 }, icon: commonGuideIcon });
  if(tool === 'polygon') activeDrawHandler = new L.Draw.Polygon(map, { shapeOptions: { color: '#e0635a', weight: 2, fillOpacity: 0.25 }, icon: commonGuideIcon });
  if(tool === 'measure-dist') activeDrawHandler = new L.Draw.Polyline(map, { shapeOptions: { color: '#3da7e0', weight: 3, dashArray: '6,6' }, icon: commonGuideIcon });
  if(tool === 'measure-area') activeDrawHandler = new L.Draw.Polygon(map, { shapeOptions: { color: '#3da7e0', weight: 2, fillOpacity: 0.15, dashArray: '6,6' }, icon: commonGuideIcon });
  if(tool === 'select-rect') activeDrawHandler = new L.Draw.Rectangle(map, { shapeOptions: { color: '#ffd54a', weight: 2, fillOpacity: 0.08 }, icon: commonGuideIcon });
  if(tool === 'select-lasso') activeDrawHandler = new L.Draw.Polygon(map, { shapeOptions: { color: '#ffd54a', weight: 2, fillOpacity: 0.08, dashArray: '4 4' }, icon: commonGuideIcon });
  // edit-feature: no draw handler — relies on feature click via bindIdentify
  if(tool === 'edit-feature') map.getContainer().style.cursor = 'cell';
  // move-feature: no draw handler either — relies on a feature mousedown+drag in bindIdentify
  if(tool === 'move-feature') map.getContainer().style.cursor = 'move';

  if(activeDrawHandler) activeDrawHandler.enable();

  document.getElementById('measure-readout').style.display = (tool === 'measure-dist' || tool === 'measure-area') ? 'block' : 'none';
  if(tool !== 'measure-dist' && tool !== 'measure-area') document.getElementById('measure-readout').textContent = '';
}

function sketchIcon(color){
  return L.divIcon({ className: '', html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4)"></div>`, iconSize:[14,14], iconAnchor:[7,7] });
}

let featureCounter = 1;
function _onDrawCreated(e){
  const layer = e.layer;

  if(currentTool === 'select-rect'){
    handleRectSelect(layer);
    return;
  }
  if(currentTool === 'select-lasso'){
    handleLassoSelect(layer);
    return;
  }

  const geoJsonFeature = layer.toGeoJSON();
  layer.feature = {
    geometry:   geoJsonFeature.geometry,
    properties: { id: 'F' + (featureCounter++), type: e.layerType, created: new Date().toLocaleString() }
  };
  layer.bindPopup(popupHtml(layer.feature.properties));

  const sketchInfo = getActiveSketchLayer();
  const targetLayer = sketchInfo.layer;

  if(currentTool === 'measure-dist'){
    const latlngs = layer.getLatLngs();
    let dist = 0;
    for(let i=1;i<latlngs.length;i++) dist += latlngs[i-1].distanceTo(latlngs[i]);
    document.getElementById('measure-readout').textContent = `Distance: ${(dist/1000).toFixed(3)} km  (${(dist*3.28084).toFixed(0)} ft)`;
    targetLayer.leafletLayer.addLayer(layer);
  } else if(currentTool === 'measure-area'){
    const areaM2 = turf.area(geoJsonFeature);
    document.getElementById('measure-readout').textContent = `Area: ${(areaM2/1e6).toFixed(4)} km²  (${(areaM2*10.7639).toFixed(0)} ft²)`;
    targetLayer.leafletLayer.addLayer(layer);
  } else {
    targetLayer.leafletLayer.addLayer(layer);
    // Sync to GeoPackage if this sketch layer is linked to a feature class
    syncLinkedFeatureClass(sketchInfo.id);
  }

  bindIdentify(layer);
  renderLayerList();
  refreshTable();
  if(['point','line','polygon'].includes(currentTool)){
    showAttributes(layer);
  }
}

function _onContextMenu(e){
  if(!activeDrawHandler) return;
  if(['line','polygon','measure-dist','measure-area'].includes(currentTool)){
    L.DomEvent.preventDefault(e);
    const answer = prompt('Right-click draw: enter distance and direction (e.g. 150 east), or type FINISH to complete the shape.');
    if(!answer) return;
    if(answer.trim().toLowerCase() === 'finish'){
      completeActiveDrawShape();
      return;
    }
    if(addDistanceSegmentToActiveDraw(answer)){
      return;
    }
    alert('Enter a distance and direction like "150 east" or "75 north", or type FINISH.');
  }
}

// ---------- Identify / select ----------
function disableLayerEditing(layer){
  if(!layer || !layer.editing || typeof layer.editing.disable !== 'function') return;
  try{ if(layer.editing.enabled()) layer.editing.disable(); }catch(e){}
}

function enableLayerEditing(layer){
  if(!layer || !layer.editing || typeof layer.editing.enable !== 'function') return;
  try{ if(!layer.editing.enabled()) layer.editing.enable(); }catch(e){}
}

function selectFeature(layer, opts){
  const enableEdit = opts && opts.enableEdit === false ? false : (currentTool === 'edit-feature');
  if(!layer || !layer.feature) return;
  if(selection.includes(layer)){
    if(selectedFeatureLayer !== layer){
      disableLayerEditing(selectedFeatureLayer);
      selectedFeatureLayer = layer;
      if(enableEdit) enableLayerEditing(layer);
    }
    showAttributes(layer);
    return;
  }

  if(selectedFeatureLayer && selectedFeatureLayer !== layer){
    disableLayerEditing(selectedFeatureLayer);
  }

  if(layer.setStyle){
    const orig = {
      color: layer.options.color,
      weight: layer.options.weight,
      fillOpacity: layer.options.fillOpacity,
      opacity: layer.options.opacity,
      fillColor: layer.options.fillColor,
      radius: layer.options.radius
    };
    if(!originalStyles.has(layer)) originalStyles.set(layer, orig);
    layer.setStyle({ color: '#ffd54a', weight: (layer.options.weight || 2) + 2, fillOpacity: 0.65, opacity: 1, fillColor: '#ffd54a' });
  }

  selection.push(layer);
  selectedFeatureLayer = layer;
  if(enableEdit) enableLayerEditing(layer);
  updateSelectionStatus();
  showAttributes(layer);
}

// Recursively shifts every LatLng in a (possibly deeply nested) getLatLngs()
// structure by a fixed delta — used by the Move tool to translate a whole
// feature's shape without reshaping it.
function shiftLatLngsDeep(latlngs, dLat, dLng){
  if(Array.isArray(latlngs)) return latlngs.map(v => shiftLatLngsDeep(v, dLat, dLng));
  return L.latLng(latlngs.lat + dLat, latlngs.lng + dLng);
}

function bindIdentify(layer){
  // In Edit mode, clicking a feature should only select it for editing (attribute
  // panel + vertex handles) — not also pop open the Identify popup on top of it.
  // Wrapping openPopup (rather than fighting Leaflet's internal click listener
  // order) also avoids the popup's autoPan silently panning the map before we
  // could close it.
  if(layer.openPopup && !layer._editModeSuppressesPopup){
    const originalOpenPopup = layer.openPopup.bind(layer);
    layer.openPopup = function(...args){
      if(currentTool === 'edit-feature') return this;
      return originalOpenPopup(...args);
    };
    layer._editModeSuppressesPopup = true;
  }

  // Auto-persist geometry edits as soon as they finish. Dragging a marker or
  // reshaping a vertex updates the Leaflet layer immediately, but nothing else
  // finds out about it — without this, the change only reaches the linked
  // GeoPackage table if the user remembers to hit the layer's Save icon first.
  if(!layer._autoSyncOnEditBound){
    const autoSyncGeometry = () => {
      if(layer.feature && layer.toGeoJSON) layer.feature.geometry = layer.toGeoJSON().geometry;
      const ownerLayerId = findOwnerLayerId(layer);
      if(ownerLayerId){
        syncLinkedFeatureClass(ownerLayerId);
        refreshTable();
      }
    };
    layer.on('dragend', autoSyncGeometry); // marker moved
    layer.on('edit', autoSyncGeometry);    // polyline/polygon vertex reshaped (leaflet.draw)
    layer._autoSyncOnEditBound = true;
  }

  layer.on('click', function(ev){
    if(currentTool !== 'select' && currentTool !== 'edit-feature') return;
    L.DomEvent.preventDefault(ev);
    L.DomEvent.stopPropagation(ev);
    if(ev.originalEvent && ev.originalEvent.stopImmediatePropagation){
      ev.originalEvent.stopImmediatePropagation();
    }
    if(L.DomEvent.stopImmediatePropagation){
      L.DomEvent.stopImmediatePropagation(ev);
    }
    const shiftHeld = ev.originalEvent && ev.originalEvent.shiftKey;
    if(!shiftHeld && !selection.includes(layer)){
      clearSelection();
    }
    selectFeature(layer);
  });

  // Move tool — click-and-drag a whole feature to relocate it without
  // reshaping it (Leaflet.draw's per-vertex editing only reshapes, it has no
  // "move the whole thing" mode for lines/polygons).
  if(!layer._moveDragBound){
    layer.on('mousedown', function(ev){
      if(currentTool !== 'move-feature') return;
      L.DomEvent.preventDefault(ev);
      L.DomEvent.stopPropagation(ev);
      if(ev.originalEvent && ev.originalEvent.stopImmediatePropagation){
        ev.originalEvent.stopImmediatePropagation();
      }

      if(!selection.includes(layer)){ clearSelection(); selectFeature(layer); }

      const startLatLng = ev.latlng;
      const hasLatLngs = typeof layer.getLatLngs === 'function';
      const originalLatLngs = hasLatLngs ? layer.getLatLngs() : layer.getLatLng();

      map.dragging.disable();

      function onMove(moveEv){
        const dLat = moveEv.latlng.lat - startLatLng.lat;
        const dLng = moveEv.latlng.lng - startLatLng.lng;
        if(hasLatLngs){
          layer.setLatLngs(shiftLatLngsDeep(originalLatLngs, dLat, dLng));
        } else {
          layer.setLatLng(L.latLng(originalLatLngs.lat + dLat, originalLatLngs.lng + dLng));
        }
      }
      function onUp(){
        map.off('mousemove', onMove);
        map.off('mouseup', onUp);
        map.dragging.enable();
        if(layer.feature && layer.toGeoJSON) layer.feature.geometry = layer.toGeoJSON().geometry;
        const ownerLayerId = findOwnerLayerId(layer);
        if(ownerLayerId){
          syncLinkedFeatureClass(ownerLayerId);
          refreshTable();
        }
      }
      map.on('mousemove', onMove);
      map.on('mouseup', onUp);
    });
    layer._moveDragBound = true;
  }
}
sketchFeatureGroup.on('layeradd', e => bindIdentify(e.layer));

function createAttributeEditorRow(key, value, type){
  if(type === undefined){
    type = (value !== '' && value !== null && value !== undefined && typeof value === 'number') ? 'number' : 'text';
  }
  const safeVal = escapeHtml(String(value ?? ''));
  return `
    <div class="attr-editor-row">
      <input type="text" class="attr-key" placeholder="Field name" value="${escapeHtml(key)}">
      <select class="attr-type" title="Field type">
        <option value="text"   ${type==='text'   ?'selected':''}>Text</option>
        <option value="number" ${type==='number' ?'selected':''}>Number</option>
      </select>
      <input type="text" class="attr-value" placeholder="Value" value="${safeVal}">
      <button type="button" class="attr-remove" title="Remove field">&times;</button>
    </div>
  `;
}

function attachAttributeEditorListeners(){
  document.querySelectorAll('.attr-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.attr-editor-row')?.remove();
    });
  });
}

function updateAttributeEditorRows(){
  attachAttributeEditorListeners();
  document.getElementById('attr-add-field').addEventListener('click', () => {
    const rows = document.getElementById('attr-editor-rows');
    rows.insertAdjacentHTML('beforeend', createAttributeEditorRow('', ''));
    attachAttributeEditorListeners();
  });
  document.getElementById('attr-save').addEventListener('click', saveAttributeEditor);
}

function showAttributes(layer){
  selectedFeatureLayer = layer;
  const el = document.getElementById('attr-content');
  const props = (layer.feature && layer.feature.properties) || {};
  const rows = Object.entries(props).length
    ? Object.entries(props).map(([k, v]) => createAttributeEditorRow(k, v)).join('')
    : createAttributeEditorRow('', '');
  const editBanner = currentTool === 'edit-feature' ? `
    <div id="edit-mode-banner">
      <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      <span>Drag vertices on the map to edit geometry</span>
      <button class="btn" id="btn-finish-edit">Finish</button>
    </div>` : '';
  el.innerHTML = `
    ${editBanner}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">
      <div style="font-size:13px;color:var(--text);">
        <strong>Selected Feature</strong><br>
        <span style="color:var(--text-faint);font-size:11px;">${escapeHtml(layer.feature?.properties?.id || 'No ID')}</span>
      </div>
      <button class="btn" id="attr-add-field" style="padding:6px 10px;font-size:11px;">+ Add Field</button>
    </div>
    <div id="attr-editor-rows">${rows}</div>
    <button class="btn primary" id="attr-save" style="width:100%;margin-top:10px;">Save Attributes</button>
  `;
  if(currentTool === 'edit-feature'){
    document.getElementById('btn-finish-edit').addEventListener('click', finishEditing);
  }
  updateAttributeEditorRows();
  showRightTab('attributes');
}

function finishEditing(){
  if(selectedFeatureLayer) disableLayerEditing(selectedFeatureLayer);
  clearSelection();
  setTool('pan');
  const el = document.getElementById('attr-content');
  if(el) el.innerHTML = '<p style="color:var(--text-faint);font-size:12px;padding:8px 0;">Click a feature with the Edit tool to select it and edit its attributes or geometry.</p>';
}

function saveAttributeEditor(){
  if(!selectedFeatureLayer || !selectedFeatureLayer.feature) return;
  const props = {};
  document.querySelectorAll('.attr-editor-row').forEach(row => {
    const key  = row.querySelector('.attr-key')?.value.trim();
    const raw  = row.querySelector('.attr-value')?.value ?? '';
    const type = row.querySelector('.attr-type')?.value || 'text';
    if(key){
      if(type === 'number' && raw !== ''){
        const n = Number(raw);
        props[key] = isNaN(n) ? raw : n;
      } else {
        props[key] = raw;
      }
    }
  });
  selectedFeatureLayer.feature.properties = props;
  if(selectedFeatureLayer.getPopup && selectedFeatureLayer.setPopupContent){
    selectedFeatureLayer.setPopupContent(popupHtml(props));
  } else if(selectedFeatureLayer.getPopup){
    selectedFeatureLayer.bindPopup(popupHtml(props));
  }
  showAttributes(selectedFeatureLayer);
  refreshTable();
  showGpkgToast('Edits saved');

  // Persist attribute changes to any linked GeoPackage feature class
  const ownerLayerId = findOwnerLayerId(selectedFeatureLayer);
  if(ownerLayerId) syncLinkedFeatureClass(ownerLayerId);
}

function findOwnerLayerId(leafletLayer){
  return Object.keys(layers).find(id => layers[id].allFeatures.includes(leafletLayer)) || null;
}

// ---------- Select by Rectangle ----------
let selection = [];
const originalStyles = new Map();

function handleRectSelect(rectLayer){
  const rectGeoJSON = rectLayer.toGeoJSON();
  Object.values(layers).forEach(lyr => {
    if(!lyr.visible || !lyr.leafletLayer.eachLayer) return;
    lyr.leafletLayer.eachLayer(l => {
      let geom;
      try { geom = l.toGeoJSON(); } catch(err){ return; }
      let hit = false;
      try { hit = turf.booleanIntersects(rectGeoJSON, geom); } catch(err){ hit = false; }
      if(hit && !selection.includes(l)){
        if(l.setStyle){
          originalStyles.set(l, { color: l.options.color, weight: l.options.weight, fillOpacity: l.options.fillOpacity, opacity: l.options.opacity, fillColor: l.options.fillColor });
          l.setStyle({ color: '#ffd54a', weight: (l.options.weight || 2) + 2, fillOpacity: 0.65, opacity: 1, fillColor: '#ffd54a' });
        }
        selection.push(l);
      }
    });
  });
  updateSelectionStatus();
}

function restoreFeatureStyle(l){
  if(!l.setStyle) return;
  const ownerLyr = Object.values(layers).find(lr => lr.allFeatures.includes(l));
  if(ownerLyr && ownerLyr.symbologyMode !== 'single' && l.feature){
    l.setStyle(getFeatureStyle(ownerLyr, l.feature));
  } else if(originalStyles.has(l)){
    l.setStyle(originalStyles.get(l));
  }
}

function clearSelection(){
  selection.forEach(l => restoreFeatureStyle(l));
  disableLayerEditing(selectedFeatureLayer);
  selectedFeatureLayer = null;
  selection = [];
  originalStyles.clear();
  updateSelectionStatus();
}

function updateSelectionStatus(){
  document.getElementById('status-selection').textContent = 'Selected: ' + selection.length;
}

// ---------- GeoJSON import / generic layer creation ----------
function loadGeoJSON(name, geojson, forcedColor, forcedId){
  const color = forcedColor || randomColor();
  const gjLayer = L.geoJSON(geojson, {
    style: { color: color, weight: 2, fillOpacity: 0.3 },
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 6, color: color, fillColor: color, fillOpacity: 0.8, weight: 1.5 }),
    onEachFeature: (feature, layer) => {
      layer.feature = feature;
      layer.bindPopup(popupHtml(feature.properties || {}));
      bindIdentify(layer);
    }
  });
  const id = addLayerToRegistry(name, gjLayer, color, 'geojson', forcedId);
  refreshLayerPopups(layers[id]);
  try { map.fitBounds(gjLayer.getBounds(), { maxZoom: 15 }); } catch(e){}
  refreshTable();
  return id;
}

document.getElementById('btn-add-geojson').addEventListener('click', () => document.getElementById('file-input').click());
document.getElementById('file-input').addEventListener('change', function(e){
  const files = Array.from(e.target.files);
  e.target.value = '';
  if(files.length === 0) return;
  handleAddedDataFiles(files);
});

// Routes an "Add Data" file selection to the right parser:
// .geojson/.json -> parsed directly; .zip or .shp(+.dbf/.prj/.shx/.cpg) -> parsed via shpjs.
async function handleAddedDataFiles(files){
  const isSingleJsonLike = files.length === 1 && /\.(geo)?json$/i.test(files[0].name);
  if(isSingleJsonLike){
    try{
      const text = await files[0].text();
      const gj = JSON.parse(text);
      loadGeoJSON(files[0].name.replace(/\.(geo)?json$/i, ''), gj);
    }catch(err){
      alert('Could not parse that file as GeoJSON.');
    }
    return;
  }

  const isSingleTiff = files.length === 1 && /\.tiff?$/i.test(files[0].name);
  if(isSingleTiff){
    await openGeoTiffFile(files[0]);
    return;
  }

  const isSingleZip = files.length === 1 && /\.zip$/i.test(files[0].name);
  const hasShp = files.some(f => /\.shp$/i.test(f.name));

  if(isSingleZip || hasShp){
    await handleShapefileFiles(isSingleZip ? files[0] : null, files);
    return;
  }

  alert('Unsupported file selection. Add a .geojson/.json file, a zipped Shapefile (.zip), a GeoTIFF (.tif/.tiff), or select the .shp file together with its .dbf (and .prj if available).');
}

/* ── GeoTIFF raster layer ─────────────────────────────────────────── */

let _geoRasterLibs = null;
async function loadGeoRasterLibs(){
  if(_geoRasterLibs) return _geoRasterLibs;
  if(!window.parseGeoraster){
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/georaster';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load georaster from CDN'));
      document.head.appendChild(s);
    });
  }
  if(!window.GeoRasterLayer){
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/georaster-layer-for-leaflet';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load georaster-layer-for-leaflet from CDN'));
      document.head.appendChild(s);
    });
  }
  _geoRasterLibs = { parseGeoraster: window.parseGeoraster, GeoRasterLayer: window.GeoRasterLayer };
  return _geoRasterLibs;
}

// Renders a single-band raster (e.g. a DEM) as grayscale, stretched across
// its real min/max (which georaster already computes excluding NoData), and
// returns undefined — georaster-layer-for-leaflet's own convention for "skip
// this pixel" — for NoData so it comes out transparent instead of opaque.
function singleBandColorFn(georaster){
  const noData = georaster.noDataValue;
  const min = georaster.mins && georaster.mins[0];
  const max = georaster.maxs && georaster.maxs[0];
  const range = (min != null && max != null && max > min) ? (max - min) : null;
  return function(values){
    const v = values[0];
    if(v === undefined || v === null || v === noData || Number.isNaN(v)) return;
    if(range == null) return `rgb(${v},${v},${v})`;
    const gray = Math.round(255 * Math.max(0, Math.min(1, (v - min) / range)));
    return `rgb(${gray},${gray},${gray})`;
  };
}

async function openGeoTiffFile(file, forcedId){
  try{
    const { parseGeoraster, GeoRasterLayer } = await loadGeoRasterLibs();
    // Pass the File/Blob straight through instead of pre-reading it with
    // file.arrayBuffer(): georaster then reads it lazily in chunks via
    // GeoTIFF.fromBlob, rather than pulling a large file entirely into
    // memory in one go — which is what actually trips the browser's
    // generic (and misleadingly-worded) "permission" read error on big
    // country-scale rasters, not an actual filesystem permission problem.
    const georaster = await parseGeoraster(file);
    const layerOptions = { georaster, opacity: 1, resolution: 256 };
    // georaster-layer-for-leaflet only auto-installs a NoData-aware color
    // function for rasters it loads from a URL; local File/Blob rasters
    // (everything Add Data loads) fall back to painting NoData as an opaque
    // color instead of transparent — which shows up as a big solid
    // rectangle around any raster that doesn't fill its bounding box. That's
    // the norm for real-world clipped DEMs (elevation outside a country's
    // border is NoData, not zero), so supply our own single-band renderer
    // that treats NoData as transparent and stretches real values to gray.
    if(georaster.numberOfRasters === 1){
      layerOptions.pixelValuesToColorFn = singleBandColorFn(georaster);
    }
    const rasterLayer = new GeoRasterLayer(layerOptions);
    const name = file.name.replace(/\.tiff?$/i, '');
    const id = addLayerToRegistry(name, rasterLayer, null, 'raster', forcedId);
    // Keep the original file around (it's just a Blob) so autosave can
    // re-persist and re-parse this exact raster on the next browser session.
    layers[id]._sourceFileBlob = file;
    layers[id]._sourceFileName = file.name;
    try { map.fitBounds(rasterLayer.getBounds()); } catch(e){}
    renderLayerList();
    return id;
  }catch(err){
    console.error('GeoTIFF parse error:', err);
    const rawMsg = (err && err.message) ? err.message : String(err);
    const looksLikeReadError = /permission|NotReadable|could not read/i.test(rawMsg);
    const hint = looksLikeReadError
      ? 'This is usually NOT a real file-permission problem — it\'s the browser\'s generic wording for "I failed to read this file." Common causes: the file is very large and ran out of memory, it\'s a cloud-sync placeholder (OneDrive/Google Drive) that hasn\'t fully downloaded, or another program (antivirus, etc.) has it locked. Try again, or try a smaller/compressed copy of the file.'
      : 'See the browser console for full details.';
    alert(`Could not read that GeoTIFF: ${rawMsg}\n\n${hint}`);
  }
}

/* ── Raster analysis: Hillshade / Slope / NDVI ───────────────────────
   All three read the pixel grid straight off the source georaster and
   render an ImageOverlay positioned at the same bounds Leaflet already
   draws the source raster at (rasterLayer.getBounds()), so no manual
   reprojection is needed regardless of the source's original CRS.     */

// Approximate meters-per-pixel. Geographic (degree) rasters are converted
// using the raster's mid-latitude; projected rasters are assumed to already
// be in meters (true for UTM and most local projected CRSes).
function rasterCellSizeMeters(gr){
  const isGeographic = gr.projection === 4326 || (Math.abs(gr.pixelWidth) < 1 && Math.abs(gr.pixelHeight) < 1);
  if(isGeographic){
    const midLat = (gr.ymin + gr.ymax) / 2;
    const mPerDegLat = 111320;
    const mPerDegLon = 111320 * Math.cos(midLat * Math.PI / 180);
    return { dx: Math.abs(gr.pixelWidth) * mPerDegLon, dy: Math.abs(gr.pixelHeight) * mPerDegLat };
  }
  return { dx: Math.abs(gr.pixelWidth), dy: Math.abs(gr.pixelHeight) };
}

// Horn's method 3x3 kernel — same formula GDAL/ArcGIS use for slope & hillshade.
function computeElevationGradients(band, width, height, dx, dy, noDataValue){
  const dzdx = new Float32Array(width * height);
  const dzdy = new Float32Array(width * height);
  const valid = new Uint8Array(width * height);
  const at = (r, c) => {
    r = r < 0 ? 0 : (r >= height ? height - 1 : r);
    c = c < 0 ? 0 : (c >= width ? width - 1 : c);
    const v = band[r][c];
    return (v == null || v === noDataValue || Number.isNaN(v)) ? null : v;
  };
  for(let r = 0; r < height; r++){
    for(let c = 0; c < width; c++){
      const a = at(r-1,c-1), b = at(r-1,c), cc = at(r-1,c+1);
      const d = at(r,c-1),                  f = at(r,c+1);
      const g = at(r+1,c-1), h = at(r+1,c), i = at(r+1,c+1);
      const idx = r * width + c;
      if(a===null||b===null||cc===null||d===null||f===null||g===null||h===null||i===null){
        valid[idx] = 0;
        continue;
      }
      dzdx[idx] = ((cc + 2*f + i) - (a + 2*d + g)) / (8 * dx);
      dzdy[idx] = ((g + 2*h + i) - (a + 2*b + cc)) / (8 * dy);
      valid[idx] = 1;
    }
  }
  return { dzdx, dzdy, valid };
}

// Linear color ramp across sorted [value, [r,g,b]] stops.
function rampColor(stops, t){
  if(t <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if(t >= last[0]) return last[1];
  for(let i = 0; i < stops.length - 1; i++){
    const [v0, c0] = stops[i], [v1, c1] = stops[i+1];
    if(t >= v0 && t <= v1){
      const f = (t - v0) / (v1 - v0);
      return [c0[0]+(c1[0]-c0[0])*f, c0[1]+(c1[1]-c0[1])*f, c0[2]+(c1[2]-c0[2])*f];
    }
  }
  return last[1];
}

function buildHillshadeOverlay(gr, azimuthDeg, altitudeDeg, zFactor){
  const band = gr.values[0];
  const { width, height, noDataValue } = gr;
  const { dx, dy } = rasterCellSizeMeters(gr);
  const { dzdx, dzdy, valid } = computeElevationGradients(band, width, height, dx, dy, noDataValue);
  const azRad = (360 - azimuthDeg + 90) * Math.PI / 180;
  const zenithRad = (90 - altitudeDeg) * Math.PI / 180;

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  for(let idx = 0; idx < width * height; idx++){
    const p = idx * 4;
    if(!valid[idx]){ img.data[p+3] = 0; continue; }
    const slopeRad = Math.atan(zFactor * Math.hypot(dzdx[idx], dzdy[idx]));
    const aspectRad = Math.atan2(dzdy[idx], -dzdx[idx]);
    let hs = Math.cos(zenithRad) * Math.cos(slopeRad) + Math.sin(zenithRad) * Math.sin(slopeRad) * Math.cos(azRad - aspectRad);
    hs = Math.max(0, hs) * 255;
    const v = Math.round(hs);
    img.data[p] = v; img.data[p+1] = v; img.data[p+2] = v; img.data[p+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Keep the raw grayscale+alpha alongside the canvas so Symbology can
  // recolor later by re-mapping gray -> a chosen ramp, without redoing the
  // hillshade math from scratch every time the user picks new colors.
  return { canvas, grayscale: img.data.slice() };
}

function buildSlopeOverlay(gr, zFactor){
  const band = gr.values[0];
  const { width, height, noDataValue } = gr;
  const { dx, dy } = rasterCellSizeMeters(gr);
  const { dzdx, dzdy, valid } = computeElevationGradients(band, width, height, dx, dy, noDataValue);
  const stops = [[0,[46,204,113]], [15,[241,196,15]], [35,[230,126,34]], [60,[231,76,60]]]; // green -> yellow -> orange -> red, in degrees

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  for(let idx = 0; idx < width * height; idx++){
    const p = idx * 4;
    if(!valid[idx]){ img.data[p+3] = 0; continue; }
    const slopeRad = Math.atan(zFactor * Math.hypot(dzdx[idx], dzdy[idx]));
    const deg = slopeRad * 180 / Math.PI;
    const [r,g,b] = rampColor(stops, deg);
    img.data[p] = Math.round(r); img.data[p+1] = Math.round(g); img.data[p+2] = Math.round(b); img.data[p+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function buildNdviOverlay(gr, redBandIdx, nirBandIdx){
  const redBand = gr.values[redBandIdx];
  const nirBand = gr.values[nirBandIdx];
  const { width, height, noDataValue } = gr;
  const stops = [[-1,[120,90,60]], [0,[210,180,120]], [0.2,[255,255,150]], [0.5,[120,200,80]], [1,[10,90,10]]]; // bare/water -> soil -> sparse -> healthy vegetation

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  for(let r = 0; r < height; r++){
    for(let c = 0; c < width; c++){
      const idx = r * width + c;
      const p = idx * 4;
      const red = redBand[r][c], nir = nirBand[r][c];
      const noData = (red == null || nir == null || red === noDataValue || nir === noDataValue || Number.isNaN(red) || Number.isNaN(nir));
      const denom = nir + red;
      if(noData || denom === 0){ img.data[p+3] = 0; continue; }
      const ndvi = (nir - red) / denom;
      const [rr,gg,bb] = rampColor(stops, ndvi);
      img.data[p] = Math.round(rr); img.data[p+1] = Math.round(gg); img.data[p+2] = Math.round(bb); img.data[p+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Parses a Shapefile using shpjs (https://github.com/calvinmetcalf/shapefile-js), loaded via CDN.
// Accepts either a single .zip (containing .shp/.dbf/.prj) or a loose set of files
// the user multi-selected in the file picker (.shp required, .dbf/.prj/.shx/.cpg optional).
async function handleShapefileFiles(zipFile, allFiles){
  if(typeof shp !== 'function'){
    alert('The Shapefile parser failed to load (check your network connection) — try a GeoJSON file instead.');
    return;
  }
  try{
    let geojson, baseName;

    if(zipFile){
      const buffer = await zipFile.arrayBuffer();
      geojson = await shp(buffer);
      baseName = zipFile.name.replace(/\.zip$/i, '');
    } else {
      const shpFile = allFiles.find(f => /\.shp$/i.test(f.name));
      const dbfFile = allFiles.find(f => /\.dbf$/i.test(f.name));
      const prjFile = allFiles.find(f => /\.prj$/i.test(f.name));
      const cpgFile = allFiles.find(f => /\.cpg$/i.test(f.name));
      if(!shpFile){ alert('No .shp file found in your selection.'); return; }

      const parts = { shp: await shpFile.arrayBuffer() };
      if(dbfFile) parts.dbf = await dbfFile.arrayBuffer();
      if(prjFile) parts.prj = await prjFile.arrayBuffer();
      if(cpgFile) parts.cpg = await cpgFile.arrayBuffer();
      if(!dbfFile) console.warn('No .dbf selected — features will be added without attributes.');
      if(!prjFile) console.warn('No .prj selected — assuming coordinates are already in WGS 84.');

      geojson = await shp(parts);
      baseName = shpFile.name.replace(/\.shp$/i, '');
    }

    if(Array.isArray(geojson)){
      geojson.forEach((fc, i) => loadGeoJSON(`${baseName} (${i + 1})`, fc));
    } else {
      loadGeoJSON(baseName, geojson);
    }
  }catch(err){
    console.error('Shapefile parse error:', err);
    alert('Could not read that Shapefile: ' + (err && err.message ? err.message : err) + '\n\n(See the browser console for full details.)');
  }
}

function createNewSketchLayer(name) {
  const fg = new L.FeatureGroup();
  fg.on('layeradd', ev => bindIdentify(ev.layer));
  const newId = addLayerToRegistry(name || ('Sketch Layer ' + layerIdCounter), fg, '#e0b13d', 'sketch');
  activeSketchLayerId = newId;
  renderLayerList(); // re-render so the new layer picks up the active-layer highlight
  return newId;
}

// ---------- Create Feature dropdown ----------
(function(){
  const trigger = document.getElementById('create-feat-trigger');
  const menu    = document.getElementById('create-feat-menu');
  if(!trigger || !menu) return;

  trigger.addEventListener('click', function(e){
    e.stopPropagation();
    if(menu.style.display === 'block'){ menu.style.display = 'none'; return; }
    const rect = trigger.getBoundingClientRect();
    menu.style.left    = rect.left + 'px';
    menu.style.top     = (rect.bottom + 4) + 'px';
    menu.style.display = 'block';
  });

  document.addEventListener('click', () => { menu.style.display = 'none'; });
  menu.addEventListener('click', e => e.stopPropagation());

  menu.querySelectorAll('.sel-menu-item[data-tool]').forEach(item => {
    item.addEventListener('click', () => {
      // Auto-create a sketch layer if none exists yet
      if(!activeSketchLayerId || !layers[activeSketchLayerId]){
        createNewSketchLayer('Sketch Layer');
      }
      setTool(item.dataset.tool);
      menu.style.display = 'none';
    });
  });
})();

// ---------- Ribbon: tabs ----------
document.querySelectorAll('.ribbon-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.ribbon-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.ribbon-body').forEach(b => b.classList.remove('show'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('show');
  });
});

// ---------- Ribbon: tool & action buttons ----------
document.querySelectorAll('.rbtn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
});
document.querySelectorAll('.rbtn[data-action]').forEach(btn => {
  btn.addEventListener('click', () => handleAction(btn.dataset.action));
});
document.querySelectorAll('.rbtn[data-gp]').forEach(btn => {
  btn.addEventListener('click', () => openGPTool(btn.dataset.gp));
});

// ---------- Selection dropdown menu ----------
(function(){
  const trigger = document.getElementById('sel-menu-trigger');
  const menu    = document.getElementById('sel-tool-menu');
  if(!trigger || !menu) return;

  trigger.addEventListener('click', function(e){
    e.stopPropagation();
    if(menu.style.display === 'block'){
      menu.style.display = 'none';
      return;
    }
    const rect = trigger.getBoundingClientRect();
    menu.style.left    = rect.left + 'px';
    menu.style.top     = (rect.bottom + 4) + 'px';
    menu.style.display = 'block';
  });

  document.addEventListener('click', () => { menu.style.display = 'none'; });
  menu.addEventListener('click', e => e.stopPropagation());

  menu.querySelectorAll('.sel-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      if(item.dataset.tool)   setTool(item.dataset.tool);
      else if(item.dataset.action) handleRibbonAction(item.dataset.action);
      menu.style.display = 'none';
    });
  });
})();

function handleRibbonAction(action){
  switch(action){
    case 'clearSelection': clearSelection(); break;
    case 'select-all':    selectAll(); break;
    case 'invert-sel':    invertSelection(); break;
    case 'select-by-attr': openSelectByAttribute(); break;
    case 'select-by-loc':  openSelectByLocation(); break;
    default: handleAction(action);
  }
}

function handleAction(action){
  switch(action){
    case 'zoomIn': map.zoomIn(); break;
    case 'zoomOut': map.zoomOut(); break;
    case 'fullExtent': map.fitBounds(US_BOUNDS); break;
    case 'gotoToggle': document.getElementById('goto-box').classList.toggle('show'); break;
    case 'clearSelection': clearSelection(); break;
    case 'select-all': selectAll(); break;
    case 'invert-sel': invertSelection(); break;
    case 'delete-selected': deleteSelectedFeatures(); break;
    case 'explodeSelected': explodeSelectedFeatures(); break;
    case 'select-by-attr': openSelectByAttribute(); break;
    case 'select-by-loc': openSelectByLocation(); break;
    case 'clearMeasure':
      sketchFeatureGroup.clearLayers();
      document.getElementById('measure-readout').textContent = '';
      refreshTable();
      break;
    case 'addBookmark': addBookmark(); break;
    case 'showBookmarks':
      showLeftTab('catalog');
      document.getElementById('left-panel').classList.remove('collapsed');
      break;
    case 'toggleBasemap': document.getElementById('basemap-gallery').classList.toggle('show'); break;
    case 'toggleTable':
      document.getElementById('table-dock').classList.toggle('show');
      tableFilterLayerId = null;
      refreshTable();
      break;
    case 'addGeoJSON': document.getElementById('file-input').click(); break;
    case 'newLayer': createNewSketchLayer(); break;
    case 'paneContents':
      showLeftTab('contents'); document.getElementById('left-panel').classList.remove('collapsed'); break;
    case 'paneCatalog':
      showLeftTab('catalog'); document.getElementById('left-panel').classList.remove('collapsed'); break;
    case 'paneAttributes':
      showRightTab('attributes'); document.getElementById('right-panel').classList.remove('collapsed'); break;
    case 'paneGeoprocessing':
      showRightTab('geoprocessing'); document.getElementById('right-panel').classList.remove('collapsed'); break;
    case 'saveProject': saveProject(); break;
    case 'openProjectTrigger': document.getElementById('project-file-input').click(); break;
    case 'exportPrint': if(typeof openLayoutView === 'function') openLayoutView(); break;
  }
}

// ---------- Basemap gallery ----------
document.querySelectorAll('.bm-opt').forEach(opt => {
  opt.addEventListener('click', () => setBasemap(opt.dataset.bm));
});

// ---------- Dock tab switching ----------
function showLeftTab(tab){
  document.querySelectorAll('#left-tabs .dock-tab').forEach(b => b.classList.toggle('active', b.dataset.lefttab === tab));
  document.getElementById('contents-view').style.display = tab === 'contents' ? 'flex' : 'none';
  document.getElementById('catalog-view').style.display = tab === 'catalog' ? 'flex' : 'none';
}
function showRightTab(tab){
  const panel = document.getElementById('right-panel');
  if(panel.classList.contains('collapsed')){
    panel.classList.remove('collapsed');
    document.getElementById('map-wrap').classList.remove('right-collapsed');
    map.invalidateSize();
  }
  document.querySelectorAll('#right-tabs .dock-tab').forEach(b => b.classList.toggle('active', b.dataset.righttab === tab));
  document.getElementById('attributes-view').style.display = tab === 'attributes' ? 'flex' : 'none';
  document.getElementById('geoprocessing-view').style.display = tab === 'geoprocessing' ? 'flex' : 'none';
}
document.querySelectorAll('#left-tabs .dock-tab').forEach(b => b.addEventListener('click', () => showLeftTab(b.dataset.lefttab)));
document.querySelectorAll('#right-tabs .dock-tab').forEach(b => b.addEventListener('click', () => showRightTab(b.dataset.righttab)));

document.getElementById('right-panel-close').addEventListener('click', () => {
  document.getElementById('right-panel').classList.add('collapsed');
  document.getElementById('map-wrap').classList.add('right-collapsed');
  map.invalidateSize();
});
document.getElementById('right-panel-reopen').addEventListener('click', () => {
  document.getElementById('right-panel').classList.remove('collapsed');
  document.getElementById('map-wrap').classList.remove('right-collapsed');
  map.invalidateSize();
});

// ---------- Mobile: left/right dock panels become overlay drawers ----------
(function(){
  const leftPanel = document.getElementById('left-panel');
  const rightPanel = document.getElementById('right-panel');
  const mapWrap = document.getElementById('map-wrap');
  const backdrop = document.getElementById('mobile-backdrop');
  const toggleBtn = document.getElementById('left-panel-toggle');
  const closeBtn = document.getElementById('left-panel-close');
  if(!leftPanel || !rightPanel || !backdrop) return;

  const MOBILE_BP = 900;
  const isMobile = () => window.innerWidth <= MOBILE_BP;
  let syncing = false;

  function sync(justOpened){
    if(syncing) return;
    syncing = true;
    if(isMobile()){
      const leftOpen = !leftPanel.classList.contains('collapsed');
      const rightOpen = !rightPanel.classList.contains('collapsed');
      // only one drawer open at a time on mobile — the one just opened wins
      if(leftOpen && rightOpen){
        if(justOpened === 'right'){
          leftPanel.classList.add('collapsed');
        } else {
          rightPanel.classList.add('collapsed');
          mapWrap.classList.add('right-collapsed');
        }
      }
      backdrop.classList.toggle('show', !leftPanel.classList.contains('collapsed') || !rightPanel.classList.contains('collapsed'));
    } else {
      backdrop.classList.remove('show');
    }
    syncing = false;
  }

  new MutationObserver(() => sync('left')).observe(leftPanel, { attributes:true, attributeFilter:['class'] });
  new MutationObserver(() => sync('right')).observe(rightPanel, { attributes:true, attributeFilter:['class'] });

  if(toggleBtn){
    toggleBtn.addEventListener('click', () => {
      leftPanel.classList.toggle('collapsed');
    });
  }
  if(closeBtn){
    closeBtn.addEventListener('click', () => leftPanel.classList.add('collapsed'));
  }
  backdrop.addEventListener('click', () => {
    leftPanel.classList.add('collapsed');
    rightPanel.classList.add('collapsed');
    mapWrap.classList.add('right-collapsed');
  });

  // Start with both drawers closed on a mobile-sized screen so the map is fully visible.
  if(isMobile()){
    leftPanel.classList.add('collapsed');
    rightPanel.classList.add('collapsed');
    mapWrap.classList.add('right-collapsed');
  }

  window.addEventListener('resize', () => { sync(); map.invalidateSize(); });
})();

// ---------- Right panel: drag-to-resize (Attributes / Geoprocessing dock) ----------
(function(){
  const resizer = document.getElementById('right-panel-resizer');
  const panel = document.getElementById('right-panel');
  if(!resizer || !panel) return;
  const MIN_WIDTH = 220, MAX_WIDTH = 560;
  let dragging = false, startX = 0, startWidth = 0;

  resizer.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    resizer.classList.add('dragging');
    document.body.classList.add('resizing-panel');
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if(!dragging) return;
    // The panel sits on the right edge — dragging left (negative dx) widens it.
    const dx = e.clientX - startX;
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth - dx));
    panel.style.width = newWidth + 'px';
    map.invalidateSize();
  });

  document.addEventListener('mouseup', () => {
    if(!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    document.body.classList.remove('resizing-panel');
    map.invalidateSize();
  });
})();

// ---------- Go To XY ----------
document.getElementById('goto-go').addEventListener('click', () => {
  const lat = parseFloat(document.getElementById('goto-lat').value);
  const lon = parseFloat(document.getElementById('goto-lon').value);
  if(isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180){
    alert('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).');
    return;
  }
  map.setView([lat, lon], 14);
  L.popup().setLatLng([lat, lon]).setContent(`Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`).openOn(map);
  document.getElementById('goto-box').classList.remove('show');
});

// ---------- Bookmarks ----------
let bookmarks = [];

function addBookmark(){
  const name = prompt('Bookmark name:', 'Bookmark ' + (bookmarks.length + 1));
  if(!name) return;
  const c = map.getCenter();
  bookmarks.push({ name, center: [c.lat, c.lng], zoom: map.getZoom() });
  renderCatalogBookmarks();
  showLeftTab('catalog');
  document.getElementById('left-panel').classList.remove('collapsed');
}
function flyToBookmark(idx){
  const b = bookmarks[idx];
  if(b) map.setView(b.center, b.zoom);
}
function deleteBookmark(idx){
  bookmarks.splice(idx, 1);
  renderCatalogBookmarks();
}
function renderCatalogBookmarks(){
  const el = document.getElementById('catalog-bookmarks');
  if(bookmarks.length === 0){
    el.innerHTML = '<div class="cat-leaf cat-empty">No bookmarks yet</div>';
    return;
  }
  el.innerHTML = bookmarks.map((b, i) =>
    `<div class="cat-leaf bookmark-item"><span data-goto="${i}">🔖 ${escapeHtml(b.name)}</span><button class="layer-del" data-bmdel="${i}" title="Delete bookmark">&times;</button></div>`
  ).join('');
  el.querySelectorAll('[data-goto]').forEach(s => s.addEventListener('click', () => flyToBookmark(parseInt(s.dataset.goto, 10))));
  el.querySelectorAll('[data-bmdel]').forEach(btn => btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    deleteBookmark(parseInt(btn.dataset.bmdel, 10));
  }));
}

// ---------- Geoprocessing ----------
const GP_TOOLS = {
  buffer:      { title: 'Buffer', fields: ['a','multidist','unit','ringoutput'], aLabel: 'Input Features', desc: 'Creates buffer polygons around input features. Enter up to three distances to get multiple buffer rings, each tagged with a DISTANCE attribute.' },
  clip:        { title: 'Clip', fields: ['a','b'], aLabel: 'Input Features', bLabel: 'Clip Features', desc: 'Extracts the portions of the input features that fall within the clip features.' },
  erase:       { title: 'Erase', fields: ['a','b'], aLabel: 'Input Features', bLabel: 'Erase Features', desc: 'Removes portions of the input features that overlap the erase features. Opposite of Clip.' },
  intersect:   { title: 'Intersect', fields: ['a','b'], aLabel: 'Input Layer', bLabel: 'Overlay Layer', desc: 'Computes the geometric intersection of two polygon layers.' },
  union:       { title: 'Union', fields: ['a','b'], aLabel: 'Input Layer', bLabel: 'Overlay Layer', desc: 'Computes the geometric union of two polygon layers.' },
  merge:       { title: 'Merge', fields: ['a','b'], aLabel: 'Layer A', bLabel: 'Layer B', desc: 'Combines features from two layers into a single layer without any geometric processing.' },
  spatialjoin: { title: 'Spatial Join', fields: ['a','b'], aLabel: 'Target Features', bLabel: 'Join Features', desc: 'Joins attributes from the Join Features to the Target Features based on spatial proximity (nearest feature).' },
  dissolve:    { title: 'Dissolve', fields: ['a'], aLabel: 'Input Layer', desc: 'Merges all features in a layer into as few features as possible.' },
  centroid:    { title: 'Centroid', fields: ['a'], aLabel: 'Input Layer', desc: 'Computes the centroid point of each input feature.' },
  convexhull:  { title: 'Convex Hull', fields: ['a'], aLabel: 'Input Layer', desc: 'Computes the smallest convex polygon that encloses all input features.' },
  fieldcalc:   { title: 'Field Calculator', fields: ['a','fieldcalc'], aLabel: 'Input Layer', desc: 'Calculates values for a new or existing field using a JavaScript expression. Use $value for the current field value, $index for feature index, and $props.FIELDNAME for other fields.' },
  near:        { title: 'Near', fields: ['a','b'], aLabel: 'Input Features', bLabel: 'Near Features', desc: 'Calculates the distance from each input feature to the nearest feature in another layer, adding NEAR_DIST and NEAR_FID attributes.' },
  exportkml:   { title: 'Export to KML/KMZ', fields: ['a','kmlformat'], aLabel: 'Input Layer', desc: 'Converts the selected layer\'s features to KML for Google Earth or any other KML-compatible viewer.' },
  importgdb:   { title: 'GDB to GPKG', fields: ['gdbfolder'], desc: 'Converts a real ESRI File Geodatabase (.gdb folder) into a standalone GeoPackage (.gpkg). Browsers can\'t read the .gdb format natively, so this loads GDAL compiled to WebAssembly on first use (~30MB, one-time) to do the conversion entirely on your machine — nothing is uploaded anywhere. The result downloads automatically and loads into Catalog.' },
  hillshade:   { title: 'Hillshade', fields: ['raster','hillshadeparams'], aLabel: 'Elevation Raster', desc: 'Computes shaded relief from an elevation raster\'s first band, given a sun azimuth and altitude.' },
  slope:       { title: 'Slope', fields: ['raster','slopeparams'], aLabel: 'Elevation Raster', desc: 'Computes slope steepness (in degrees) at each cell of an elevation raster\'s first band.' },
  ndvi:        { title: 'NDVI', fields: ['raster','ndviparams'], aLabel: 'Multiband Raster', desc: 'Computes the Normalized Difference Vegetation Index from a multiband raster\'s Red and Near-Infrared bands: (NIR-Red)/(NIR+Red).' },
  routeanalysis: { title: 'Route Analysis', fields: ['linelayer','reflayers','snaptol'], aLabel: 'Route (Line) Layer', desc: 'Splits a route line everywhere it crosses the checked reference layers. Segments inside a reference polygon are tagged "Intersecting {layer}" (combined if more than one overlaps); reference lines and points only add split points and don\'t tag a segment on their own. Each segment also gets LENGTH_M and LENGTH_MI attributes.' },
};

function layerOptionsHtml(){
  return Object.entries(layers).map(([id, lyr]) => `<option value="${id}">${escapeHtml(lyr.name)}</option>`).join('');
}

function lineLayerOptionsHtml(){
  return Object.entries(layers)
    .filter(([, lyr]) => lyr.allFeatures.some(l => {
      const t = l.feature && l.feature.geometry && l.feature.geometry.type;
      return t === 'LineString' || t === 'MultiLineString';
    }))
    .map(([id, lyr]) => `<option value="${id}">${escapeHtml(lyr.name)}</option>`).join('');
}

function refreshRouteRefLayerChecklist(excludeId){
  const container = document.getElementById('gp-ref-layers');
  if(!container) return;
  const items = Object.entries(layers).filter(([id]) => id !== excludeId);
  if(items.length === 0){
    container.innerHTML = '<span style="font-size:11px;color:var(--text-faint);">No other layers to reference.</span>';
    return;
  }
  container.innerHTML = items.map(([id, lyr]) =>
    `<label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:normal;color:var(--text-dim);">
      <input type="checkbox" class="gp-ref-layer-chk" value="${id}"> ${escapeHtml(lyr.name)}
    </label>`
  ).join('');
}

// georaster-layer-for-leaflet keeps the parsed georaster(s) as `.georasters`
// (an array, to support stacking); fall back to a singular `.georaster` in
// case a future/older version of the library exposes it that way instead.
function getLayerGeoraster(lyr){
  const ll = lyr && lyr.leafletLayer;
  if(!ll) return null;
  if(ll.georaster) return ll.georaster;
  if(ll.georasters && ll.georasters.length) return ll.georasters[0];
  return null;
}

function rasterLayerOptionsHtml(){
  return Object.entries(layers)
    .filter(([, lyr]) => lyr.type === 'raster' && getLayerGeoraster(lyr))
    .map(([id, lyr]) => `<option value="${id}">${escapeHtml(lyr.name)}</option>`).join('');
}

const gpHistory = [];

// Selected via the "GDB to GPKG" tool's folder picker — read by runGPTool('importgdb').
let _pickedGdbFiles = null;

function setPickedGdbFiles(files, folderName){
  _pickedGdbFiles = (files && files.length) ? Array.from(files) : null;
  const label = document.getElementById('gp-gdb-picked');
  if(label){
    label.textContent = _pickedGdbFiles
      ? `Selected: ${folderName || 'folder'} (${_pickedGdbFiles.length} files)`
      : '';
  }
}

// Recursively collects every file under a FileSystemDirectoryHandle, tagging
// each with a webkitRelativePath-shaped path so the rest of the pipeline
// (which was written around the webkitdirectory input) doesn't need to care
// which picking method was used.
async function collectFilesFromDirectoryHandle(dirHandle, rootName){
  const out = [];
  async function walk(handle, prefix){
    for await (const [name, entry] of handle.entries()){
      const relPath = prefix + '/' + name;
      if(entry.kind === 'file'){
        const file = await entry.getFile();
        try { Object.defineProperty(file, 'webkitRelativePath', { value: relPath, configurable: true }); } catch(_){}
        out.push(file);
      } else if(entry.kind === 'directory'){
        await walk(entry, relPath);
      }
    }
  }
  await walk(dirHandle, rootName);
  return out;
}

async function pickGdbFolder(){
  // Prefer the File System Access API's directory picker — it always shows a
  // real "select this folder" dialog and hands back exactly what's inside it,
  // which is far more reliable than the older webkitdirectory input trick
  // (whose behavior can vary by browser/OS and, per user reports, sometimes
  // returns zero files).
  if(window.showDirectoryPicker){
    try {
      const dirHandle = await window.showDirectoryPicker();
      const files = await collectFilesFromDirectoryHandle(dirHandle, dirHandle.name);
      setPickedGdbFiles(files, dirHandle.name);
      return;
    } catch(e){
      if(e.name === 'AbortError') return; // user cancelled the picker
      // Other errors (e.g. unsupported in this context): fall back below
    }
  }
  document.getElementById('gdb-folder-input').click();
}

document.getElementById('gdb-folder-input').addEventListener('change', e => {
  const files = e.target.files;
  const folderName = (files && files.length && files[0].webkitRelativePath)
    ? files[0].webkitRelativePath.split(/[\\/]/)[0]
    : null;
  setPickedGdbFiles(files, folderName);
  e.target.value = '';
});

function openGPTool(tool){
  const cfg = GP_TOOLS[tool];
  if(!cfg) return;
  showRightTab('geoprocessing');
  document.getElementById('right-panel').classList.remove('collapsed');
  document.getElementById('gp-empty').style.display = 'none';
  const formEl = document.getElementById('gp-form');
  formEl.style.display = 'block';

  const opts = layerOptionsHtml();
  let html = `<div class="gp-title">${cfg.title}</div><div class="gp-desc">${cfg.desc}</div>`;

  if(cfg.fields.includes('a')){
    html += `<div class="gp-field">
      <label>${cfg.aLabel}</label>
      <select id="gp-sel-a">${opts}</select>
      <label class="gp-use-sel-label"><input type="checkbox" id="gp-use-a"> Use selection only</label>
    </div>`;
  }
  if(cfg.fields.includes('b')){
    html += `<div class="gp-field">
      <label>${cfg.bLabel}</label>
      <select id="gp-sel-b">${opts}</select>
      <label class="gp-use-sel-label"><input type="checkbox" id="gp-use-b"> Use selection only</label>
    </div>`;
  }
  if(cfg.fields.includes('multidist')){
    html += `<div class="gp-field"><label>Distances (leave a ring blank to skip it)</label></div>
    <div class="gp-field"><label>Buffer 1</label><input id="gp-dist-1" type="number" value="500" min="0" step="any"></div>
    <div class="gp-field"><label>Buffer 2</label><input id="gp-dist-2" type="number" placeholder="—" min="0" step="any"></div>
    <div class="gp-field"><label>Buffer 3</label><input id="gp-dist-3" type="number" placeholder="—" min="0" step="any"></div>`;
  }
  if(cfg.fields.includes('unit')){
    html += `<div class="gp-field"><label>Units</label>
      <select id="gp-unit">
        <option value="meters">Meters</option>
        <option value="kilometers">Kilometers</option>
        <option value="feet">Feet</option>
        <option value="miles">Miles</option>
      </select>
    </div>`;
  }
  if(cfg.fields.includes('ringoutput')){
    html += `<div class="gp-field"><label>Multiple Rings Output</label>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:2px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:normal;color:var(--text-dim);">
          <input type="radio" name="gp-ring-output" value="combined" checked> One layer, colored by ring
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:normal;color:var(--text-dim);">
          <input type="radio" name="gp-ring-output" value="separate"> Separate layer per ring (toggle individually)
        </label>
      </div>
    </div>`;
  }
  if(cfg.fields.includes('fieldcalc')){
    html += `<div class="gp-field">
      <label>Target Field (new or existing name)</label>
      <input id="gp-calc-field" type="text" placeholder="e.g. area_km2">
    </div>
    <div class="gp-field">
      <label>Expression (JS)</label>
      <input id="gp-calc-expr" type="text" placeholder="e.g. turf.area($geom)/1e6">
      <span style="font-size:10px;color:var(--text-faint);margin-top:2px;">
        Variables: <code>$props</code> (attributes), <code>$geom</code> (GeoJSON geometry), <code>$index</code>
      </span>
    </div>`;
  }
  if(cfg.fields.includes('kmlformat')){
    html += `<div class="gp-field">
      <label>Output Format</label>
      <select id="gp-kmlformat">
        <option value="kml">KML (plain XML)</option>
        <option value="kmz">KMZ (zipped)</option>
      </select>
    </div>`;
  }
  if(cfg.fields.includes('gdbfolder')){
    _pickedGdbFiles = null; // discard any stale selection from a previous time this tool was opened
    html += `<div class="gp-field">
      <label>ESRI File Geodatabase</label>
      <button class="btn" id="gp-gdb-pick" type="button" style="width:100%;">📁 Choose .gdb Folder…</button>
      <span id="gp-gdb-picked" style="font-size:11px;color:var(--text-faint);margin-top:4px;"></span>
    </div>`;
  }
  if(cfg.fields.includes('raster')){
    const ropts = rasterLayerOptionsHtml();
    html += `<div class="gp-field">
      <label>${cfg.aLabel}</label>
      <select id="gp-sel-a">${ropts || '<option value="">No GeoTIFF raster layers loaded</option>'}</select>
    </div>`;
  }
  if(cfg.fields.includes('hillshadeparams')){
    html += `<div class="gp-row">
      <div class="gp-field"><label>Azimuth (°)</label><input id="gp-hs-azimuth" type="number" value="315" min="0" max="360" step="1"></div>
      <div class="gp-field"><label>Altitude (°)</label><input id="gp-hs-altitude" type="number" value="45" min="0" max="90" step="1"></div>
    </div>
    <div class="gp-field"><label>Z-factor</label><input id="gp-hs-zfactor" type="number" value="1" min="0.01" step="0.1"></div>`;
  }
  if(cfg.fields.includes('slopeparams')){
    html += `<div class="gp-field"><label>Z-factor</label><input id="gp-slope-zfactor" type="number" value="1" min="0.01" step="0.1"></div>
    <span style="font-size:10px;color:var(--text-faint);">Increase Z-factor if elevation units differ from the raster's horizontal units (e.g. feet vs. meters).</span>`;
  }
  if(cfg.fields.includes('ndviparams')){
    html += `<div class="gp-row">
      <div class="gp-field"><label>Red Band #</label><input id="gp-ndvi-red" type="number" value="1" min="1" step="1"></div>
      <div class="gp-field"><label>NIR Band #</label><input id="gp-ndvi-nir" type="number" value="4" min="1" step="1"></div>
    </div>
    <span style="font-size:10px;color:var(--text-faint);">Band numbers are 1-based. Common 4-band drone/satellite order is Red=1, Green=2, Blue=3, NIR=4 — check your source if colors look inverted.</span>`;
  }
  if(cfg.fields.includes('linelayer')){
    const lineOpts = lineLayerOptionsHtml();
    html += `<div class="gp-field">
      <label>${cfg.aLabel}</label>
      <select id="gp-sel-a">${lineOpts || '<option value="">No line layers loaded</option>'}</select>
      <label class="gp-use-sel-label"><input type="checkbox" id="gp-use-a"> Use selection only</label>
    </div>`;
  }
  if(cfg.fields.includes('reflayers')){
    html += `<div class="gp-field">
      <label>Reference Layers (check the ones to test against)</label>
      <div id="gp-ref-layers" style="max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;border:1px solid var(--border);border-radius:4px;padding:6px;"></div>
    </div>`;
  }
  if(cfg.fields.includes('snaptol')){
    html += `<div class="gp-row">
      <div class="gp-field"><label>Point Snap Tolerance</label><input id="gp-snap-tol" type="number" value="10" min="0" step="any"></div>
      <div class="gp-field"><label>Units</label>
        <select id="gp-snap-unit">
          <option value="meters">Meters</option>
          <option value="kilometers">Kilometers</option>
          <option value="feet">Feet</option>
          <option value="miles">Miles</option>
        </select>
      </div>
    </div>
    <span style="font-size:10px;color:var(--text-faint);">How close a point reference feature must be to the route to count as a crossing (split) point. Only affects point reference layers.</span>`;
  }

  html += `<button class="btn primary" id="gp-run" style="width:100%;margin-top:8px;">▶ Run</button>`;
  html += `<div id="gp-progress"><div id="gp-progress-bar"></div></div>`;
  html += `<div id="gp-result"></div>`;
  if(gpHistory.length){
    html += `<div id="gp-history">${gpHistory.map(h =>
      `<div class="gp-hist-item"><span class="ghi-tool">${escapeHtml(h.tool)}</span> — <span class="${h.ok ? 'ghi-ok' : 'ghi-err'}">${escapeHtml(h.msg)}</span></div>`
    ).join('')}</div>`;
  }

  formEl.innerHTML = html;
  document.getElementById('gp-run').addEventListener('click', () => runGPTool(tool));
  if(cfg.fields.includes('gdbfolder')){
    document.getElementById('gp-gdb-pick').addEventListener('click', () => pickGdbFolder());
  }
  if(cfg.fields.includes('reflayers')){
    const selA = document.getElementById('gp-sel-a');
    refreshRouteRefLayerChecklist(selA ? selA.value : null);
    if(selA) selA.addEventListener('change', () => refreshRouteRefLayerChecklist(selA.value));
  }
}

function getSelectedFeaturesForLayer(lyr){
  const out = [];
  if(!lyr || !lyr.leafletLayer) return out;
  selection.forEach(l => {
    try{ if(lyr.leafletLayer.hasLayer && lyr.leafletLayer.hasLayer(l)) out.push(l.toGeoJSON()); }catch(e){}
  });
  return out;
}

function evaluateAttributeCondition(value, op, compareValue){
  const rawValue = value == null ? '' : String(value);
  const rawCompare = compareValue == null ? '' : String(compareValue);
  const isNumber = !isNaN(parseFloat(rawValue)) && !isNaN(parseFloat(rawCompare));
  if(isNumber){
    const numValue = parseFloat(rawValue);
    const numCompare = parseFloat(rawCompare);
    if(op === '=') return numValue === numCompare;
    if(op === '!=') return numValue !== numCompare;
    if(op === '>') return numValue > numCompare;
    if(op === '<') return numValue < numCompare;
    if(op === '>=') return numValue >= numCompare;
    if(op === '<=') return numValue <= numCompare;
  }
  const lhs = rawValue.toLowerCase();
  const rhs = rawCompare.toLowerCase();
  if(op === '=') return lhs === rhs;
  if(op === '!=') return lhs !== rhs;
  if(op === 'contains') return lhs.includes(rhs);
  if(op === 'starts with') return lhs.startsWith(rhs);
  if(op === 'ends with') return lhs.endsWith(rhs);
  return false;
}

function normalizeSelectionMode(mode){
  const m = (mode || '').trim().toLowerCase();
  if(['new','new selection'].includes(m)) return 'new';
  if(['add','add to current selection','add selection'].includes(m)) return 'add';
  if(['remove','remove from selection','subtract','subtract from selection'].includes(m)) return 'remove';
  if(['intersect','select from current selection','intersection'].includes(m)) return 'intersect';
  return 'new';
}

function normalizeSpatialRelation(rel){
  const r = (rel || '').trim().toLowerCase();
  if(['intersect','intersects','intersection'].includes(r)) return 'intersect';
  if(['within'].includes(r)) return 'within';
  if(['contains','contain'].includes(r)) return 'contains';
  if(['touches','boundary touches','boundary touch','touch'].includes(r)) return 'touches';
  if(['crosses'].includes(r)) return 'crosses';
  if(['overlaps','overlap'].includes(r)) return 'overlaps';
  if(['disjoint','not intersecting','not intersects'].includes(r)) return 'disjoint';
  return null;
}

function applySelectionMode(matches, mode){
  const selected = new Set(matches);
  if(mode === 'new'){
    clearSelection();
    matches.forEach(selectFeature);
    return;
  }
  if(mode === 'add'){
    matches.forEach(selectFeature);
    return;
  }
  if(mode === 'remove'){
    selection.slice().forEach(item => {
      if(selected.has(item)){
        restoreFeatureStyle(item);
        const idx = selection.indexOf(item);
        if(idx >= 0) selection.splice(idx, 1);
        originalStyles.delete(item);
      }
    });
    updateSelectionStatus();
    return;
  }
  if(mode === 'intersect'){
    selection.slice().forEach(item => {
      if(!selected.has(item)){
        if(item.setStyle && originalStyles.has(item)) item.setStyle(originalStyles.get(item));
        const idx = selection.indexOf(item);
        if(idx >= 0) selection.splice(idx, 1);
        originalStyles.delete(item);
      }
    });
    updateSelectionStatus();
    return;
  }
}

function openSelectByAttribute(){
  const pop = document.getElementById('layer-popover');
  const options = layerOptionsHtml();
  document.getElementById('popover-title').textContent = 'Select by Attribute';
  document.getElementById('popover-body').innerHTML = `
    <div class="gp-field"><label>Layer</label><select id="selbyattr-layer">${options}</select></div>
    <div class="gp-field"><label>Field</label><select id="selbyattr-field"><option value="">Select a layer first</option></select></div>
    <div class="gp-field"><label>Operator</label><select id="selbyattr-op">
      <option value="=">Equals</option>
      <option value="!=">Does not equal</option>
      <option value=">">Greater than</option>
      <option value="<">Less than</option>
      <option value=">=">Greater than or equal</option>
      <option value="<=">Less than or equal</option>
      <option value="contains">Contains</option>
      <option value="starts with">Starts with</option>
      <option value="ends with">Ends with</option>
    </select></div>
    <div class="gp-field"><label>Value</label><input type="text" id="selbyattr-value" placeholder="Enter value"></div>
    <div class="gp-field"><label>Selection type</label><select id="selbyattr-mode">
      <option value="new">New selection</option>
      <option value="add">Add to current selection</option>
      <option value="remove">Remove from current selection</option>
      <option value="intersect">Select from current selection</option>
    </select></div>
    <div class="gp-field" style="flex-direction:row;align-items:center;gap:8px;">
      <input type="checkbox" id="selbyattr-use-selected">
      <label for="selbyattr-use-selected" style="margin:0;font-size:12px;color:var(--text-dim);">Use only currently selected features in this layer</label>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button class="btn primary" id="selbyattr-apply">Apply</button>
      <button class="btn" id="selbyattr-cancel">Cancel</button>
    </div>
  `;
  showPopover();
  pop.style.left = Math.max(20, window.innerWidth / 2 - 160) + 'px';
  pop.style.top = '100px';

  const layerSelect = document.getElementById('selbyattr-layer');
  const fieldSelect = document.getElementById('selbyattr-field');
  const updateFields = () => {
    const lyr = layers[layerSelect.value];
    if(!lyr) return;
    const feats = getFeaturesArray(lyr);
    const fields = Array.from(new Set(feats.flatMap(f => Object.keys(f.properties || {}))));
    fieldSelect.innerHTML = fields.length
      ? fields.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')
      : '<option value="">(no fields)</option>';
  };

  layerSelect.addEventListener('change', updateFields);
  updateFields();

  document.getElementById('selbyattr-cancel').addEventListener('click', closePopover);
  document.getElementById('selbyattr-apply').addEventListener('click', () => {
    const lyr = layers[layerSelect.value];
    const field = fieldSelect.value;
    const op = document.getElementById('selbyattr-op').value;
    const raw = document.getElementById('selbyattr-value').value;
    const mode = normalizeSelectionMode(document.getElementById('selbyattr-mode').value);
    const useCurrent = document.getElementById('selbyattr-use-selected').checked;
    if(!lyr){ alert('Please select a layer.'); return; }
    if(!field){ alert('Please select a field.'); return; }
    if(raw === null || raw === undefined){ return; }
    const sourceFeatures = useCurrent ? getSelectedFeaturesForLayer(lyr) : getFeaturesArray(lyr);
    if(useCurrent && sourceFeatures.length === 0){ alert('No currently selected features in this layer.'); return; }
    const matching = [];
    lyr.leafletLayer.eachLayer(l => {
      try{
        const geo = l.toGeoJSON();
        if(!geo || !geo.properties) return;
        const key = geo.properties[field];
        const match = evaluateAttributeCondition(key, op.trim().toLowerCase(), raw);
        if(match){
          if(useCurrent){
            if(sourceFeatures.some(sf => sf.id === geo.id && JSON.stringify(sf.geometry) === JSON.stringify(geo.geometry))){
              matching.push(l);
            }
          } else {
            matching.push(l);
          }
        }
      }catch(e){}
    });
    applySelectionMode(matching, mode);
    updateSelectionStatus();
    closePopover();
  });
}

function openSelectByLocation(){
  const pop = document.getElementById('layer-popover');
  const options = layerOptionsHtml();
  document.getElementById('popover-title').textContent = 'Select by Location';
  document.getElementById('popover-body').innerHTML = `
    <div class="gp-field"><label>Target layer (features to select)</label><select id="selbyloc-target">${options}</select></div>
    <div class="gp-field"><label>Spatial relationship</label><select id="selbyloc-relation">
      <option value="intersect">Intersect</option>
      <option value="within">Within</option>
      <option value="contains">Contains</option>
      <option value="touches">Boundary touches</option>
      <option value="crosses">Crosses</option>
      <option value="overlaps">Overlaps</option>
      <option value="disjoint">Disjoint</option>
    </select></div>
    <div class="gp-field"><label>Source layer (features to test against)</label><select id="selbyloc-source">${options}</select></div>
    <div class="gp-field"><label>Selection type</label><select id="selbyloc-mode">
      <option value="new">New selection</option>
      <option value="add">Add to current selection</option>
      <option value="remove">Remove from current selection</option>
      <option value="intersect">Select from current selection</option>
    </select></div>
    <div class="gp-field" style="flex-direction:row;align-items:center;gap:8px;">
      <input type="checkbox" id="selbyloc-use-selected">
      <label for="selbyloc-use-selected" style="margin:0;font-size:12px;color:var(--text-dim);">Use only selected features from source layer</label>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button class="btn primary" id="selbyloc-apply">Apply</button>
      <button class="btn" id="selbyloc-cancel">Cancel</button>
    </div>
  `;
  showPopover();
  pop.style.left = Math.max(20, window.innerWidth / 2 - 160) + 'px';
  pop.style.top = '100px';

  document.getElementById('selbyloc-cancel').addEventListener('click', closePopover);
  document.getElementById('selbyloc-apply').addEventListener('click', () => {
    const target = layers[document.getElementById('selbyloc-target').value];
    const source = layers[document.getElementById('selbyloc-source').value];
    const rel = normalizeSpatialRelation(document.getElementById('selbyloc-relation').value);
    const mode = normalizeSelectionMode(document.getElementById('selbyloc-mode').value);
    const useSelectedSource = document.getElementById('selbyloc-use-selected').checked;
    if(!target || !source){ alert('Please select both target and source layers.'); return; }
    const sourceGeoms = useSelectedSource ? getSelectedFeaturesForLayer(source) : getFeaturesArray(source);
    if(sourceGeoms.length === 0){ alert('Source layer has no features to use.'); return; }
    const matching = [];
    target.leafletLayer.eachLayer(t => {
      try{
        const tGeo = t.toGeoJSON();
        if(!tGeo) return;
        let ok = false;
        for(const sGeo of sourceGeoms){
          try{
            if(rel === 'intersect' && turf.booleanIntersects(tGeo, sGeo)) { ok = true; break; }
            if(rel === 'within' && turf.booleanWithin(tGeo, sGeo)) { ok = true; break; }
            if(rel === 'contains' && turf.booleanContains(tGeo, sGeo)) { ok = true; break; }
            if(rel === 'touches' && turf.booleanTouches(tGeo, sGeo)) { ok = true; break; }
            if(rel === 'crosses' && turf.booleanCrosses(tGeo, sGeo)) { ok = true; break; }
            if(rel === 'overlaps' && turf.booleanOverlap && turf.booleanOverlap(tGeo, sGeo)) { ok = true; break; }
            if(rel === 'disjoint' && turf.booleanDisjoint(tGeo, sGeo)) { ok = true; break; }
          }catch(e){}
        }
        if(ok) matching.push(t);
      }catch(e){}
    });
    applySelectionMode(matching, mode);
    updateSelectionStatus();
    closePopover();
  });
}

function refreshGPLayerOptions(){
  const a = document.getElementById('gp-sel-a');
  const b = document.getElementById('gp-sel-b');
  const opts = layerOptionsHtml();
  if(a) { const v = a.value; a.innerHTML = opts; if(layers[v]) a.value = v; }
  if(b) { const v = b.value; b.innerHTML = opts; if(layers[v]) b.value = v; }
}

function showGPResult(msg, isError, toolTitle){
  const el = document.getElementById('gp-result');
  const prog = document.getElementById('gp-progress');
  if(prog) prog.classList.remove('show');
  if(!el) return;
  el.textContent = msg;
  el.className = isError ? 'err' : 'ok';
  if(toolTitle){
    gpHistory.unshift({ tool: toolTitle, msg, ok: !isError });
    if(gpHistory.length > 10) gpHistory.pop();
  }
}

function startGPProgress(){
  const prog = document.getElementById('gp-progress');
  if(prog) prog.classList.add('show');
  const res = document.getElementById('gp-result');
  if(res){ res.textContent = ''; res.className = ''; }
}

function getFeaturesArray(lyr){
  const arr = [];
  if(lyr && lyr.leafletLayer && lyr.leafletLayer.eachLayer){
    lyr.leafletLayer.eachLayer(l => {
      try {
        const geo = l.toGeoJSON();
        if(geo && geo.type) arr.push(geo);
      } catch(e){}
    });
  }
  return arr;
}

function dissolveFeatures(features){
  if(features.length === 0) return null;
  if(features.length === 1) return features[0];
  try{
    return features.reduce((acc, f) => acc ? turf.union(acc, f) : f);
  }catch(e){
    return turf.combine(turf.featureCollection(features)).features[0];
  }
}

async function runGPTool(tool){
  const cfg = GP_TOOLS[tool];
  const title = cfg ? cfg.title : tool;
  startGPProgress();
  try{
    const selA = document.getElementById('gp-sel-a');
    const selB = document.getElementById('gp-sel-b');
    const layerA = selA ? layers[selA.value] : null;
    const layerB = selB ? layers[selB.value] : null;

    if(selA && !layerA){ showGPResult('Select an input layer first.', true, title); return; }
    if(selB && !layerB){ showGPResult('Select a second layer first.', true, title); return; }

    if(tool === 'buffer'){
      const units = document.getElementById('gp-unit').value;
      const rawDists = [1,2,3].map(n => document.getElementById(`gp-dist-${n}`).value.trim());
      const parsedDists = rawDists.map(v => v === '' ? null : parseFloat(v));
      if(parsedDists[0] == null || isNaN(parsedDists[0])){ showGPResult('Enter at least a first buffer distance.', true, title); return; }
      if(parsedDists.some(d => d != null && (isNaN(d) || d <= 0))){ showGPResult('Buffer distances must be greater than 0.', true, title); return; }
      const useSelA = document.getElementById('gp-use-a')?.checked;
      const feats = useSelA ? getSelectedFeaturesForLayer(layerA) : getFeaturesArray(layerA);
      if(feats.length === 0){ showGPResult(layerA.name + ' has no features.', true, title); return; }
      // Largest ring first so smaller (fully-contained) rings draw on top of it.
      const distances = parsedDists.filter(d => d != null).sort((a, b) => b - a);
      const pal = QUAL_PALETTES['Tableau'];
      const bufferOneRing = dist => feats.map(f => {
        const b = turf.buffer(f, dist, { units });
        return b ? turf.feature(b.geometry, Object.assign({}, f.properties || {}, { DISTANCE: dist })) : null;
      }).filter(Boolean);
      const separateLayers = distances.length > 1
        && document.querySelector('input[name="gp-ring-output"]:checked')?.value === 'separate';

      let totalCount = 0;
      if(separateLayers){
        distances.forEach((dist, i) => {
          const ringFeats = bufferOneRing(dist);
          totalCount += ringFeats.length;
          const ringLyrId = loadGeoJSON(`Buffer of ${layerA.name} (${dist} ${units})`, turf.featureCollection(ringFeats), pal[i % pal.length]);
          attachRingLabelAnchors(layers[ringLyrId], units);
        });
      } else {
        const buffered = distances.flatMap(bufferOneRing);
        totalCount = buffered.length;
        const bufferLyrId = loadGeoJSON(`Buffer of ${layerA.name}`, turf.featureCollection(buffered), '#5ec98f');
        const bufferLyr = layers[bufferLyrId];
        attachRingLabelAnchors(bufferLyr, units);
        if(distances.length > 1){
          // Multiple rings: color each DISTANCE value differently by default so
          // the rings read as distinct zones instead of one flat overlapping fill.
          distances.forEach((d, i) => { bufferLyr.symbologyConfig.uniqueColors[String(d)] = pal[i % pal.length]; });
          bufferLyr.symbologyMode = 'unique';
          bufferLyr.symbologyConfig.field = 'DISTANCE';
          applyThematicStyle(bufferLyr);
          renderLayerList();
        }
      }
      const ringWord = distances.length === 1 ? 'distance' : 'distances';
      const layoutWord = separateLayers ? `${distances.length} separate layers` : 'one layer';
      showGPResult(`Buffer complete — ${totalCount} feature(s) created across ${distances.length} ${ringWord} (${distances.join(', ')} ${units}), as ${layoutWord}.`, false, title);

    } else if(tool === 'clip'){
      const clipGeom = dissolveFeatures(getFeaturesArray(layerB));
      if(!clipGeom){ showGPResult(layerB.name + ' has no features to clip with.', true, title); return; }
      const useSelA = document.getElementById('gp-use-a')?.checked;
      const featsA = useSelA ? getSelectedFeaturesForLayer(layerA) : getFeaturesArray(layerA);
      const results = featsA.map(f => { try { return turf.intersect(f, clipGeom); } catch(e){ return null; } }).filter(Boolean);
      if(results.length === 0){ showGPResult('No overlap between the input and clip features.', true, title); return; }
      loadGeoJSON(`${layerA.name} clipped`, turf.featureCollection(results), '#5ec98f');
      showGPResult(`Clip complete — ${results.length} feature(s) created.`, false, title);

    } else if(tool === 'erase'){
      const eraseGeom = dissolveFeatures(getFeaturesArray(layerB));
      if(!eraseGeom){ showGPResult(layerB.name + ' has no features to erase with.', true, title); return; }
      const useSelA = document.getElementById('gp-use-a')?.checked;
      const featsA = useSelA ? getSelectedFeaturesForLayer(layerA) : getFeaturesArray(layerA);
      const results = featsA.map(f => {
        try { return turf.difference(f, eraseGeom); } catch(e){ return null; }
      }).filter(Boolean);
      if(results.length === 0){ showGPResult('Erase produced no output — input may be entirely within erase features.', true, title); return; }
      loadGeoJSON(`${layerA.name} erased`, turf.featureCollection(results), '#e0b13d');
      showGPResult(`Erase complete — ${results.length} feature(s) created.`, false, title);

    } else if(tool === 'intersect'){
      const useSelA = document.getElementById('gp-use-a')?.checked;
      const useSelB = document.getElementById('gp-use-b')?.checked;
      const a = dissolveFeatures(useSelA ? getSelectedFeaturesForLayer(layerA) : getFeaturesArray(layerA));
      const b = dissolveFeatures(useSelB ? getSelectedFeaturesForLayer(layerB) : getFeaturesArray(layerB));
      if(!a || !b){ showGPResult('Both layers need at least one feature.', true, title); return; }
      let result;
      try { result = turf.intersect(a, b); } catch(e){ result = null; }
      if(!result){ showGPResult('The two layers do not intersect (or are not polygons).', true, title); return; }
      loadGeoJSON('Intersect result', turf.featureCollection([result]), '#5ec98f');
      showGPResult('Intersect complete.', false, title);

    } else if(tool === 'union'){
      const useSelA = document.getElementById('gp-use-a')?.checked;
      const useSelB = document.getElementById('gp-use-b')?.checked;
      const a = dissolveFeatures(useSelA ? getSelectedFeaturesForLayer(layerA) : getFeaturesArray(layerA));
      const b = dissolveFeatures(useSelB ? getSelectedFeaturesForLayer(layerB) : getFeaturesArray(layerB));
      if(!a || !b){ showGPResult('Both layers need at least one feature.', true, title); return; }
      let result;
      try { result = turf.union(a, b); } catch(e){ result = null; }
      if(!result){ showGPResult('Union failed — make sure both layers are polygons.', true, title); return; }
      loadGeoJSON('Union result', turf.featureCollection([result]), '#5ec98f');
      showGPResult('Union complete.', false, title);

    } else if(tool === 'merge'){
      if(layerA === layerB){ showGPResult('Choose two different layers to merge.', true, title); return; }
      const useSelA = document.getElementById('gp-use-a')?.checked;
      const useSelB = document.getElementById('gp-use-b')?.checked;
      const featsA = useSelA ? getSelectedFeaturesForLayer(layerA) : getFeaturesArray(layerA);
      const featsB = useSelB ? getSelectedFeaturesForLayer(layerB) : getFeaturesArray(layerB);
      if(featsA.length === 0 || featsB.length === 0){ showGPResult('Both layers must contain at least one feature.', true, title); return; }
      const mergedFeats = [...featsA, ...featsB];
      loadGeoJSON(`Merge of ${layerA.name} & ${layerB.name}`, turf.featureCollection(mergedFeats), '#5ec98f');
      showGPResult(`Merge complete — ${mergedFeats.length} feature(s) combined.`, false, title);

    } else if(tool === 'spatialjoin'){
      const useSelA = document.getElementById('gp-use-a')?.checked;
      const featsA = useSelA ? getSelectedFeaturesForLayer(layerA) : getFeaturesArray(layerA);
      const featsB = getFeaturesArray(layerB);
      if(featsA.length === 0){ showGPResult(layerA.name + ' has no features.', true, title); return; }
      if(featsB.length === 0){ showGPResult(layerB.name + ' has no join features.', true, title); return; }
      const joined = featsA.map((fa, idx) => {
        let bestDist = Infinity, bestProps = {};
        const ptA = turf.centroid(fa);
        featsB.forEach(fb => {
          try{
            const ptB = turf.centroid(fb);
            const d = turf.distance(ptA, ptB, { units: 'meters' });
            if(d < bestDist){ bestDist = d; bestProps = fb.properties || {}; }
          }catch(e){}
        });
        return turf.feature(fa.geometry, Object.assign({}, fa.properties || {}, bestProps, { JOIN_DIST_M: Math.round(bestDist) }));
      });
      loadGeoJSON(`${layerA.name} joined`, turf.featureCollection(joined), '#c97ee0');
      showGPResult(`Spatial Join complete — ${joined.length} feature(s) with joined attributes.`, false, title);

    } else if(tool === 'dissolve'){
      const useSelA = document.getElementById('gp-use-a')?.checked;
      const feats = useSelA ? getSelectedFeaturesForLayer(layerA) : getFeaturesArray(layerA);
      if(feats.length === 0){ showGPResult(layerA.name + ' has no features.', true, title); return; }
      const merged = dissolveFeatures(feats);
      loadGeoJSON(`${layerA.name} (dissolved)`, turf.featureCollection([merged]), '#5ec98f');
      showGPResult('Dissolve complete.', false, title);

    } else if(tool === 'centroid'){
      const useSelA = document.getElementById('gp-use-a')?.checked;
      const feats = useSelA ? getSelectedFeaturesForLayer(layerA) : getFeaturesArray(layerA);
      if(feats.length === 0){ showGPResult(layerA.name + ' has no features.', true, title); return; }
      const centroids = feats.map(f => turf.centroid(f, { properties: f.properties || {} }));
      loadGeoJSON(`${layerA.name} centroids`, turf.featureCollection(centroids), '#5ec98f');
      showGPResult(`Centroid complete — ${centroids.length} point(s) created.`, false, title);

    } else if(tool === 'convexhull'){
      const feats = getFeaturesArray(layerA);
      if(feats.length === 0){ showGPResult(layerA.name + ' has no features.', true, title); return; }
      const hull = turf.convex(turf.featureCollection(feats));
      if(!hull){ showGPResult('Need at least 3 non-collinear points to compute a hull.', true, title); return; }
      loadGeoJSON(`${layerA.name} convex hull`, turf.featureCollection([hull]), '#5ec98f');
      showGPResult('Convex Hull complete.', false, title);

    } else if(tool === 'fieldcalc'){
      const fieldName = (document.getElementById('gp-calc-field')?.value || '').trim();
      const expr = (document.getElementById('gp-calc-expr')?.value || '').trim();
      if(!fieldName){ showGPResult('Enter a target field name.', true, title); return; }
      if(!expr){ showGPResult('Enter an expression.', true, title); return; }
      const feats = getFeaturesArray(layerA);
      if(feats.length === 0){ showGPResult(layerA.name + ' has no features.', true, title); return; }
      let errCount = 0;
      const results = feats.map((f, $index) => {
        const $props = f.properties || {};
        const $geom = f.geometry;
        let val;
        try {
          // eslint-disable-next-line no-new-func
          val = new Function('turf','$props','$geom','$index', `"use strict"; return (${expr});`)(turf, $props, $geom, $index);
        } catch(e){ val = null; errCount++; }
        return turf.feature($geom, Object.assign({}, $props, { [fieldName]: val }));
      });
      loadGeoJSON(`${layerA.name} (calculated)`, turf.featureCollection(results), layerA.color || '#3da7e0');
      const msg = `Field Calc complete — ${results.length} feature(s).${errCount ? ` (${errCount} expression error(s))` : ''}`;
      showGPResult(msg, errCount > 0, title);

    } else if(tool === 'near'){
      const useSelA = document.getElementById('gp-use-a')?.checked;
      const featsA = useSelA ? getSelectedFeaturesForLayer(layerA) : getFeaturesArray(layerA);
      const featsB = getFeaturesArray(layerB);
      if(featsA.length === 0){ showGPResult(layerA.name + ' has no features.', true, title); return; }
      if(featsB.length === 0){ showGPResult(layerB.name + ' has no near features.', true, title); return; }
      const results = featsA.map((fa, i) => {
        let bestDist = Infinity, bestFid = -1;
        const ptA = turf.centroid(fa);
        featsB.forEach((fb, j) => {
          try{
            const ptB = turf.centroid(fb);
            const d = turf.distance(ptA, ptB, { units: 'meters' });
            if(d < bestDist){ bestDist = d; bestFid = j; }
          }catch(e){}
        });
        return turf.feature(fa.geometry, Object.assign({}, fa.properties || {}, {
          NEAR_DIST: parseFloat(bestDist.toFixed(2)),
          NEAR_FID: bestFid
        }));
      });
      loadGeoJSON(`${layerA.name} near`, turf.featureCollection(results), '#4fd1c5');
      showGPResult(`Near complete — ${results.length} feature(s) with NEAR_DIST attribute.`, false, title);

    } else if(tool === 'exportkml'){
      const useSelA = document.getElementById('gp-use-a')?.checked;
      const feats = useSelA ? getSelectedFeaturesForLayer(layerA) : getFeaturesArray(layerA);
      if(feats.length === 0){ showGPResult(layerA.name + ' has no features.', true, title); return; }
      const format = document.getElementById('gp-kmlformat')?.value || 'kml';
      await exportLayerToKml(layerA.name, feats, format);
      showGPResult(`Exported ${feats.length} feature(s) to .${format}`, false, title);

    } else if(tool === 'importgdb'){
      if(!_pickedGdbFiles){ showGPResult('Choose a .gdb folder first.', true, title); return; }
      const setProgress = msg => {
        const el = document.getElementById('gp-result');
        if(el){ el.textContent = msg; el.className = ''; }
      };
      const { gdbFolderName, outName } = await convertGdbFolderToGpkg(_pickedGdbFiles, setProgress);
      showGPResult(`Converted "${gdbFolderName}" → ${outName} — downloaded, and loaded into Catalog.`, false, title);

    } else if(tool === 'hillshade'){
      const gr = getLayerGeoraster(layerA);
      if(!gr){ showGPResult(layerA.name + ' is not a readable GeoTIFF raster.', true, title); return; }
      const azimuth = parseFloat(document.getElementById('gp-hs-azimuth').value);
      const altitude = parseFloat(document.getElementById('gp-hs-altitude').value);
      const zFactor = parseFloat(document.getElementById('gp-hs-zfactor').value);
      if(isNaN(azimuth) || isNaN(altitude) || isNaN(zFactor)){ showGPResult('Enter valid azimuth, altitude, and Z-factor values.', true, title); return; }
      const { canvas, grayscale } = buildHillshadeOverlay(gr, azimuth, altitude, zFactor);
      const bounds = layerA.leafletLayer.getBounds();
      const overlay = L.imageOverlay(canvas.toDataURL(), bounds, { opacity: 1 });
      const hsId = addLayerToRegistry(`${layerA.name} (Hillshade)`, overlay, null, 'raster');
      layers[hsId].rasterRender = { kind: 'Hillshade', width: canvas.width, height: canvas.height, grayscale, minColor: '#000000', maxColor: '#ffffff' };
      showGPResult('Hillshade complete.', false, title);

    } else if(tool === 'slope'){
      const gr = getLayerGeoraster(layerA);
      if(!gr){ showGPResult(layerA.name + ' is not a readable GeoTIFF raster.', true, title); return; }
      const zFactor = parseFloat(document.getElementById('gp-slope-zfactor').value);
      if(isNaN(zFactor) || zFactor <= 0){ showGPResult('Enter a Z-factor greater than 0.', true, title); return; }
      const canvas = buildSlopeOverlay(gr, zFactor);
      const bounds = layerA.leafletLayer.getBounds();
      const overlay = L.imageOverlay(canvas.toDataURL(), bounds, { opacity: 1 });
      addLayerToRegistry(`${layerA.name} (Slope)`, overlay, null, 'raster');
      showGPResult('Slope complete — colorized 0° (green) to 60°+ (red).', false, title);

    } else if(tool === 'ndvi'){
      const gr = getLayerGeoraster(layerA);
      if(!gr){ showGPResult(layerA.name + ' is not a readable GeoTIFF raster.', true, title); return; }
      const redBand = parseInt(document.getElementById('gp-ndvi-red').value, 10) - 1;
      const nirBand = parseInt(document.getElementById('gp-ndvi-nir').value, 10) - 1;
      const bandCount = gr.numberOfRasterBands || (gr.values ? gr.values.length : 0);
      if(isNaN(redBand) || isNaN(nirBand) || redBand < 0 || nirBand < 0 || redBand >= bandCount || nirBand >= bandCount){
        showGPResult(`${layerA.name} only has ${bandCount} band(s) — enter valid band numbers.`, true, title); return;
      }
      const canvas = buildNdviOverlay(gr, redBand, nirBand);
      const bounds = layerA.leafletLayer.getBounds();
      const overlay = L.imageOverlay(canvas.toDataURL(), bounds, { opacity: 1 });
      addLayerToRegistry(`${layerA.name} (NDVI)`, overlay, null, 'raster');
      showGPResult('NDVI complete — colorized bare/water (brown) to healthy vegetation (green).', false, title);

    } else if(tool === 'routeanalysis'){
      const useSelA = document.getElementById('gp-use-a')?.checked;
      const routeFeats = (useSelA ? getSelectedFeaturesForLayer(layerA) : getFeaturesArray(layerA))
        .filter(f => f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'));
      if(routeFeats.length === 0){ showGPResult(layerA.name + ' has no line features.', true, title); return; }

      const refIds = Array.from(document.querySelectorAll('.gp-ref-layer-chk:checked')).map(cb => cb.value);
      if(refIds.length === 0){ showGPResult('Check at least one reference layer.', true, title); return; }

      const snapDist = parseFloat(document.getElementById('gp-snap-tol').value) || 0;
      const snapUnits = document.getElementById('gp-snap-unit').value;

      // Classify each checked reference layer's features by geometry once,
      // up front — polygons drive the "Intersecting X" label, lines and
      // points only contribute split points (per the tool's design).
      const polygonRefs = [], lineRefs = [], pointRefs = [];
      refIds.forEach(refId => {
        const refLyr = layers[refId];
        if(!refLyr) return;
        const feats = getFeaturesArray(refLyr);
        const polyFeats = feats.filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
        const lineFeats = feats.filter(f => f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'));
        const pointFeats = feats.filter(f => f.geometry && f.geometry.type === 'Point');
        if(polyFeats.length) polygonRefs.push({ name: refLyr.name, features: polyFeats });
        if(lineFeats.length) lineRefs.push({ name: refLyr.name, features: lineFeats });
        if(pointFeats.length) pointRefs.push({ name: refLyr.name, features: pointFeats });
      });

      const outputFeats = [];
      routeFeats.forEach(routeFeat => {
        // Explode MultiLineString routes into individual LineStrings so the
        // splitting logic below only has to deal with simple lines.
        const lines = routeFeat.geometry.type === 'MultiLineString'
          ? routeFeat.geometry.coordinates.map(c => turf.lineString(c, routeFeat.properties))
          : [routeFeat];

        lines.forEach(line => {
          const splitPoints = [];

          polygonRefs.forEach(pref => {
            pref.features.forEach(pf => {
              try{
                const boundary = turf.polygonToLine(pf);
                const boundaryFeats = boundary.type === 'FeatureCollection' ? boundary.features : [boundary];
                boundaryFeats.forEach(bf => {
                  const bLines = bf.geometry.type === 'MultiLineString'
                    ? bf.geometry.coordinates.map(c => turf.lineString(c))
                    : [bf];
                  bLines.forEach(bl => {
                    try{ turf.lineIntersect(line, bl).features.forEach(pt => splitPoints.push(pt)); }catch(e){}
                  });
                });
              }catch(e){}
            });
          });

          lineRefs.forEach(lref => {
            lref.features.forEach(lf => {
              try{ turf.lineIntersect(line, lf).features.forEach(pt => splitPoints.push(pt)); }catch(e){}
            });
          });

          if(snapDist > 0){
            pointRefs.forEach(pref => {
              pref.features.forEach(pf => {
                try{
                  const dist = turf.pointToLineDistance(pf, line, { units: snapUnits });
                  if(dist <= snapDist) splitPoints.push(turf.nearestPointOnLine(line, pf));
                }catch(e){}
              });
            });
          }

          let segments;
          if(splitPoints.length === 0){
            segments = [line];
          } else {
            try{
              const splitter = turf.multiPoint(splitPoints.map(pt => pt.geometry.coordinates));
              const splitFC = turf.lineSplit(line, splitter);
              segments = splitFC.features.length ? splitFC.features : [line];
            }catch(e){ segments = [line]; }
          }

          segments.forEach(seg => {
            if(!seg.geometry || seg.geometry.coordinates.length < 2) return;
            const lenKm = turf.length(seg, { units: 'kilometers' });
            if(lenKm < 0.0001) return; // drop slivers from coincident split points
            const mid = turf.along(seg, lenKm / 2, { units: 'kilometers' });
            const matchedNames = [];
            polygonRefs.forEach(pref => {
              const inside = pref.features.some(pf => { try{ return turf.booleanPointInPolygon(mid, pf); }catch(e){ return false; } });
              if(inside && !matchedNames.includes(pref.name)) matchedNames.push(pref.name);
            });
            const label = matchedNames.length ? `Intersecting ${matchedNames.join(', ')}` : 'Clear';
            const lenM = lenKm * 1000;
            outputFeats.push(turf.feature(seg.geometry, Object.assign({}, line.properties || {}, {
              CROSSING: label,
              LENGTH_M: Math.round(lenM * 100) / 100,
              LENGTH_MI: Math.round((lenM / 1609.344) * 1000) / 1000,
            })));
          });
        });
      });

      if(outputFeats.length === 0){ showGPResult('No output segments were produced — check your reference layer selections.', true, title); return; }

      const routeLyrId = loadGeoJSON(`${layerA.name} — Route Analysis`, turf.featureCollection(outputFeats), '#9aa3ad');
      const routeLyr = layers[routeLyrId];
      const uniqueLabels = [...new Set(outputFeats.map(f => f.properties.CROSSING))];
      const pal = QUAL_PALETTES['Tableau'];
      uniqueLabels.filter(l => l !== 'Clear').forEach((label, i) => {
        routeLyr.symbologyConfig.uniqueColors[label] = pal[i % pal.length];
      });
      routeLyr.symbologyConfig.uniqueColors['Clear'] = '#9aa3ad';
      routeLyr.symbologyMode = 'unique';
      routeLyr.symbologyConfig.field = 'CROSSING';
      applyThematicStyle(routeLyr);
      renderLayerList();

      const categoryWord = uniqueLabels.length === 1 ? 'category' : 'categories';
      showGPResult(`Route Analysis complete — ${outputFeats.length} segment(s) created across ${uniqueLabels.length} ${categoryWord}.`, false, title);
    }

  }catch(err){
    showGPResult('Error: ' + (err.message || err), true, title);
  }
}

// ---------- Attribute table dock ----------
let tableFilterLayerId = null;

document.getElementById('table-close').addEventListener('click', () => document.getElementById('table-dock').classList.remove('show'));
document.getElementById('table-clear-filter').addEventListener('click', () => {
  tableFilterLayerId = null;
  refreshTable();
});

function refreshTable(){
  if(!document.getElementById('table-dock').classList.contains('show')) return;

  const titleEl = document.getElementById('table-title');
  const clearBtn = document.getElementById('table-clear-filter');
  if(tableFilterLayerId && layers[tableFilterLayerId]){
    titleEl.textContent = 'Attribute Table — ' + layers[tableFilterLayerId].name;
    clearBtn.style.display = 'inline-block';
  } else {
    titleEl.textContent = 'Attribute Table';
    clearBtn.style.display = 'none';
  }

  const allProps = [];
  Object.entries(layers).forEach(([id, lyr]) => {
    if(tableFilterLayerId && id !== tableFilterLayerId) return;
    if(lyr.leafletLayer.eachLayer){
      lyr.leafletLayer.eachLayer(l => { if(l.feature) allProps.push({ layer: lyr.name, ...l.feature.properties }); });
    }
  });
  const head = document.getElementById('table-head');
  const body = document.getElementById('table-body');
  if(allProps.length === 0){
    head.innerHTML = '<th>No features</th>';
    body.innerHTML = '';
    return;
  }
  const cols = [...new Set(allProps.flatMap(p => Object.keys(p)))];
  head.innerHTML = cols.map(c => `<th>${escapeHtml(c)}</th>`).join('');
  body.innerHTML = allProps.map(p => '<tr>' + cols.map(c => `<td>${escapeHtml(p[c] ?? '')}</td>`).join('') + '</tr>').join('');
}

// ---------- Search / geocode (Nominatim — free, no API key) ----------
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
let searchTimeout = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = searchInput.value.trim();
  if(q.length < 3){ searchResults.innerHTML = ''; return; }
  searchTimeout = setTimeout(() => doGeocode(q), 400);
});

async function doGeocode(query){
  try{
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    searchResults.innerHTML = data.map(d =>
      `<div data-lat="${d.lat}" data-lon="${d.lon}">${escapeHtml(d.display_name)}</div>`
    ).join('') || '<div style="color:var(--text-faint);cursor:default;">No results</div>';
    searchResults.querySelectorAll('div[data-lat]').forEach(el => {
      el.addEventListener('click', () => {
        const lat = parseFloat(el.dataset.lat), lon = parseFloat(el.dataset.lon);
        map.setView([lat, lon], 14);
        L.popup().setLatLng([lat, lon]).setContent(el.textContent).openOn(map);
        searchResults.innerHTML = '';
        searchInput.value = el.textContent.split(',')[0];
      });
    });
  }catch(err){
    searchResults.innerHTML = '<div style="color:var(--danger);cursor:default;">Search failed — check connection.</div>';
  }
}

// ---------- CRS Definitions ----------
const CRS_DEFS = {
  wgs84:       { label: 'WGS 84 (EPSG:4326)',                code: 'EPSG:4326',   proj4: null,  isGeo: true  },
  webmercator: { label: 'Mercator (EPSG:3857)',              code: 'EPSG:3857',   proj4: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs' },
  albers:      { label: 'N.America Albers Equal Area Conic',code: 'ESRI:102008', proj4: '+proj=aea +lat_0=40 +lon_0=-96 +lat_1=20 +lat_2=60 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs' },
  lcc:         { label: 'Lambert Conformal Conic',           code: 'ESRI:102004', proj4: '+proj=lcc +lat_0=39 +lon_0=-96 +lat_1=33 +lat_2=45 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs' },
  tmerc:       { label: 'Transverse Mercator (UTM 15N)',     code: 'EPSG:32615',  proj4: '+proj=tmerc +lat_0=0 +lon_0=-93 +k=0.9996 +x_0=500000 +y_0=0 +datum=WGS84 +units=m +no_defs' }
};
let activeCRSKey = 'wgs84';

function projectCoords(lat, lng) {
  const def = CRS_DEFS[activeCRSKey];
  if (def.isGeo) return { x: lng, y: lat, isGeo: true };
  const [x, y] = proj4('EPSG:4326', def.proj4, [lng, lat]);
  return { x, y, isGeo: false };
}

// ---------- Status bar: live coordinates + zoom ----------
function _onMouseMove(e){
  const { x, y, isGeo } = projectCoords(e.latlng.lat, e.latlng.lng);
  const coordEl = document.getElementById('status-coords');
  if (isGeo) {
    coordEl.textContent = `Lon: ${x.toFixed(5)}, Lat: ${y.toFixed(5)}`;
  } else {
    coordEl.textContent = `X: ${x.toFixed(1)} m,  Y: ${y.toFixed(1)} m`;
  }
}
function updateZoomStatus(){ document.getElementById('status-scale').textContent = 'Zoom: ' + map.getZoom(); }

let _coordPopup = null;

function bindMapEvents(){
  map.on(L.Draw.Event.CREATED, _onDrawCreated);
  map.on('contextmenu', _onContextMenu);
  map.on('mousemove', _onMouseMove);
  map.on('zoomend', updateZoomStatus);
  map.on('click', _onMapClick);
}

function _onMapClick(e){
  if(currentTool !== 'pan') return;
  const lat = e.latlng.lat.toFixed(6);
  const lng = e.latlng.lng.toFixed(6);
  if(_coordPopup) _coordPopup.remove();
  _coordPopup = L.popup({
    className: 'coord-popup',
    closeButton: true,
    autoClose: true,
    closeOnClick: true,
    offset: [0, -4]
  })
    .setLatLng(e.latlng)
    .setContent(`<span class="coord-popup-text"><span class="coord-dot"></span>${lat}, ${lng}</span>`)
    .openOn(map);
}
bindMapEvents();
updateZoomStatus();

// ---------- CRS Map Rebuild ----------
function buildLeafletCRS(crsKey){
  if(crsKey === 'webmercator') return null; // null = use Leaflet default (EPSG:3857)
  if(crsKey === 'wgs84')       return L.CRS.EPSG4326;
  const def = CRS_DEFS[crsKey];
  // Resolutions cover continental extents down to street level (~1 m/px)
  const res = [131072,65536,32768,16384,8192,4096,2048,1024,512,256,128,64,32,16,8,4,2,1];
  return new L.Proj.CRS(def.code, def.proj4, { resolutions: res });
}

function rebuildMap(newCrsKey){
  // 1 — Save all layer state as plain GeoJSON (always in WGS84)
  const layerState = Object.values(layers).map(lyr => ({
    name: lyr.name, color: lyr.color, type: lyr.type,
    visible: lyr.visible, opacity: lyr.opacity,
    weight: lyr.weight, fillOpacity: lyr.fillOpacity,
    geojson: lyr.leafletLayer.toGeoJSON()
  }));

  // 2 — Capture current view in WGS84 (always valid regardless of active CRS)
  const savedCenter = map.getCenter();
  const savedZoom   = map.getZoom();

  // 3 — Tear down old map cleanly
  clearSelection();
  Object.keys(layers).forEach(id => delete layers[id]);
  sketchFeatureGroup  = new L.FeatureGroup();
  sketchLayerId       = null;
  activeSketchLayerId = null;
  map.remove();

  // 4 — Create new map with the target CRS
  const lcrs = buildLeafletCRS(newCrsKey);
  const mapOpts = { zoomControl: false, attributionControl: true };
  if(lcrs) mapOpts.crs = lcrs;
  map = L.map('map', mapOpts);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ position: 'bottomleft', metric: true, imperial: true }).addTo(map);

  // 5 — Basemap: only standard tile layers work reliably in Web Mercator
  if(newCrsKey === 'webmercator'){
    basemaps[currentBasemapKey].addTo(map);
  }
  // All other CRS: plain dark canvas background (no tile layer)

  // 6 — Re-register all map events on the new map instance
  bindMapEvents();

  // 7 — Reload vector layers (GeoJSON coords stay WGS84; Leaflet/Proj4Leaflet reprojects them)
  layerState.forEach(ls => {
    const hasFeatures = ls.geojson && ls.geojson.features && ls.geojson.features.length > 0;
    if(!hasFeatures) return;
    const id = loadGeoJSON(ls.name, ls.geojson, ls.color);
    const lyr = layers[id];
    if(lyr){
      lyr.opacity     = ls.opacity     ?? 1;
      lyr.weight      = ls.weight      ?? 2;
      lyr.fillOpacity = ls.fillOpacity ?? 0.4;
      applyLayerStyle(lyr);
      if(!ls.visible){ lyr.visible = false; map.removeLayer(lyr.leafletLayer); }
    }
  });

  // 8 — Restore view (setView with WGS84 LatLng works for all CRS in Leaflet)
  try { map.setView([savedCenter.lat, savedCenter.lng], savedZoom); }
  catch(e){ map.fitBounds(US_BOUNDS); }

  renderLayerList();
  refreshTable();
  updateStatusLayers();
  updateZoomStatus();
}

// ---------- Save / Open Project ----------
function saveProject(){
  const c = map.getCenter();
  const data = {
    version: 1,
    view: { center: [c.lat, c.lng], zoom: map.getZoom() },
    bookmarks: bookmarks,
    layers: Object.values(layers).map(lyr => ({
      name: lyr.name, color: lyr.color, type: lyr.type, visible: lyr.visible, opacity: lyr.opacity,
      geojson: lyr.leafletLayer.toGeoJSON()
    }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'webgis-project.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openProject(file){
  const reader = new FileReader();
  reader.onload = function(evt){
    let data;
    try { data = JSON.parse(evt.target.result); }
    catch(err){ alert('That file is not a valid project JSON.'); return; }

    // Clear current state
    Object.keys(layers).forEach(id => removeLayer(id));
    clearSelection();
    sketchFeatureGroup.clearLayers();
    sketchLayerId = null; // re-registers lazily the next time something is drawn
    activeSketchLayerId = null; // clear active sketch layer

    bookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];
    renderCatalogBookmarks();

    (data.layers || []).forEach(entry => {
      const hasFeatures = entry.geojson && entry.geojson.features && entry.geojson.features.length > 0;
      if(!hasFeatures) return; // skip empty layers (e.g. an untouched default sketch layer)
      const id = loadGeoJSON(entry.name, entry.geojson, entry.color);
      const lyr = layers[id];
      if(lyr){
        lyr.opacity = entry.opacity ?? 1;
        lyr.type = entry.type || 'geojson';
        applyLayerStyle(lyr);
        if(entry.visible === false){
          lyr.visible = false;
          map.removeLayer(lyr.leafletLayer);
        }
      }
    });
    renderLayerList();

    if(data.view && data.view.center){
      map.setView(data.view.center, data.view.zoom || 12);
    }
  };
  reader.readAsText(file);
}

document.getElementById('project-file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if(file) openProject(file);
  e.target.value = '';
});

document.getElementById('qat-save')?.addEventListener('click', saveProject);
document.getElementById('qat-open')?.addEventListener('click', () => document.getElementById('project-file-input').click());

renderLayerList();
renderCatalogBookmarks();
updateStatusLayers();

/* =========================================================
   Browser-side autosave (IndexedDB)
   Persists the whole working session — layers, view, bookmarks —
   locally so closing the tab/browser doesn't lose anything. A layer
   only disappears once you explicitly remove it. This is separate
   from Save Project / Open Project above, which stay as an explicit
   file-based export/import for sharing or backing up outside the
   browser.
   ========================================================= */

const AUTOSAVE_DB_NAME = 'maplite-autosave';
const AUTOSAVE_DB_VERSION = 1;
const AUTOSAVE_DEBOUNCE_MS = 1200;
let _autosaveDb = null;

function openAutosaveDb(){
  if(_autosaveDb) return Promise.resolve(_autosaveDb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AUTOSAVE_DB_NAME, AUTOSAVE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains('layers')) db.createObjectStore('layers', { keyPath: 'id' });
      if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => { _autosaveDb = req.result; resolve(_autosaveDb); };
    req.onerror = () => reject(req.error);
  });
}

function idbRequest(req){
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll(storeName){
  const db = await openAutosaveDb();
  return idbRequest(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

async function idbPut(storeName, record){
  const db = await openAutosaveDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(storeName, key){
  const db = await openAutosaveDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClearAndPutAll(storeName, records){
  const db = await openAutosaveDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    records.forEach(r => store.put(r));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function dataUrlToBlob(dataUrl){
  const [meta, b64] = dataUrl.split(',');
  const mime = (meta.match(/data:(.*);base64/) || [, 'image/png'])[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Reverses the "FIELD op VALUE" string applyDefinitionQuery() writes to
// lyr.queryExpr, so a definition query can be reapplied after a restore.
function parseQueryExpr(expr){
  const m = String(expr).match(/^(.*?)\s+(!=|>=|<=|=|>|<|contains)\s+(.*)$/);
  return m ? { field: m[1], op: m[2], value: m[3] } : null;
}

function scheduleAutosave(){
  if(_autosaveRestoring) return; // don't resave partial state while startup restore is still running
  clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(persistAutosaveState, AUTOSAVE_DEBOUNCE_MS);
}

async function serializeLayerForAutosave(id, lyr){
  const base = {
    id, name: lyr.name, color: lyr.color, type: lyr.type, visible: lyr.visible,
    opacity: lyr.opacity, weight: lyr.weight, radius: lyr.radius,
    strokeColor: lyr.strokeColor, fillColor: lyr.fillColor,
    strokeOpacity: lyr.strokeOpacity, fillOpacity: lyr.fillOpacity, dashArray: lyr.dashArray,
    symbologyMode: lyr.symbologyMode, symbologyConfig: lyr.symbologyConfig,
    labelsOn: lyr.labelsOn, labelField: lyr.labelField, labelColor: lyr.labelColor,
    labelHaloColor: lyr.labelHaloColor, labelSize: lyr.labelSize, labelBold: lyr.labelBold,
    labelItalic: lyr.labelItalic, labelUppercase: lyr.labelUppercase, labelDirection: lyr.labelDirection,
    queryExpr: lyr.queryExpr, effects: lyr.effects,
  };

  if(lyr.type === 'raster'){
    if(lyr._sourceFileBlob){
      return { ...base, rasterKind: 'geotiff', fileBlob: lyr._sourceFileBlob, fileName: lyr._sourceFileName || 'raster.tif' };
    }
    if(lyr.leafletLayer instanceof L.ImageOverlay){
      const bounds = lyr.leafletLayer.getBounds();
      let imageBlob = null;
      try{ imageBlob = dataUrlToBlob(lyr.leafletLayer._url); }catch(e){}
      if(!imageBlob) return null;
      return {
        ...base, rasterKind: 'imageoverlay', imageBlob,
        bounds: [[bounds.getSouth(), bounds.getWest()], [bounds.getNorth(), bounds.getEast()]],
        rasterRender: lyr.rasterRender ? {
          kind: lyr.rasterRender.kind, width: lyr.rasterRender.width, height: lyr.rasterRender.height,
          grayscale: lyr.rasterRender.grayscale, minColor: lyr.rasterRender.minColor, maxColor: lyr.rasterRender.maxColor,
        } : null,
      };
    }
    return null; // unrecognized raster shape — skip rather than risk a broken record
  }

  return { ...base, geojson: lyr.leafletLayer.toGeoJSON() };
}

async function persistAutosaveState(){
  try{
    const records = (await Promise.all(
      Object.entries(layers).map(([id, lyr]) => serializeLayerForAutosave(id, lyr))
    )).filter(Boolean);
    await idbClearAndPutAll('layers', records);
    const c = map.getCenter();
    await idbPut('meta', { key: 'session', view: { center: [c.lat, c.lng], zoom: map.getZoom() }, bookmarks });
  }catch(e){
    console.warn('[autosave] failed to persist session:', e);
  }
}

async function restoreAutosavedLayer(rec){
  let id;
  if(rec.type === 'raster' && rec.rasterKind === 'geotiff' && rec.fileBlob){
    const file = new File([rec.fileBlob], rec.fileName || 'raster.tif');
    id = await openGeoTiffFile(file, rec.id);
  } else if(rec.type === 'raster' && rec.rasterKind === 'imageoverlay' && rec.imageBlob){
    const url = URL.createObjectURL(rec.imageBlob);
    const overlay = L.imageOverlay(url, rec.bounds, { opacity: rec.opacity ?? 1 });
    id = addLayerToRegistry(rec.name, overlay, null, 'raster', rec.id);
    if(rec.rasterRender) layers[id].rasterRender = rec.rasterRender;
  } else if(rec.geojson && rec.geojson.features && rec.geojson.features.length > 0){
    id = loadGeoJSON(rec.name, rec.geojson, rec.color, rec.id);
  }
  if(!id || !layers[id]) return;

  const lyr = layers[id];
  Object.assign(lyr, {
    opacity: rec.opacity, weight: rec.weight, radius: rec.radius,
    strokeColor: rec.strokeColor, fillColor: rec.fillColor,
    strokeOpacity: rec.strokeOpacity, fillOpacity: rec.fillOpacity, dashArray: rec.dashArray,
    symbologyMode: rec.symbologyMode, symbologyConfig: rec.symbologyConfig,
    labelField: rec.labelField, labelColor: rec.labelColor,
    labelHaloColor: rec.labelHaloColor, labelSize: rec.labelSize, labelBold: rec.labelBold,
    labelItalic: rec.labelItalic, labelUppercase: rec.labelUppercase, labelDirection: rec.labelDirection,
    effects: rec.effects || lyr.effects,
  });

  if(lyr.type !== 'raster') applyLayerStyle(lyr);
  if(lyr.symbologyMode && lyr.symbologyMode !== 'single') applyThematicStyle(lyr);
  if(rec.labelsOn) applyLabels(id); // sets lyr.labelsOn = true itself
  if(rec.queryExpr){
    const q = parseQueryExpr(rec.queryExpr);
    if(q) applyDefinitionQuery(id, q.field, q.op, q.value);
  }
  if(rec.visible === false){
    lyr.visible = false;
    map.removeLayer(lyr.leafletLayer);
  }
}

async function restoreAutosaveState(){
  clearTimeout(_autosaveTimer); // cancel whatever the initial empty-state renderLayerList() scheduled
  _autosaveRestoring = true;
  try{
    const [layerRecords, metaRecords] = await Promise.all([idbGetAll('layers'), idbGetAll('meta')]);
    if(layerRecords.length === 0) return;

    for(const rec of layerRecords){
      try{ await restoreAutosavedLayer(rec); }
      catch(e){ console.warn('[autosave] failed to restore layer', rec && rec.name, e); }
    }

    const session = metaRecords.find(m => m.key === 'session');
    if(session){
      if(Array.isArray(session.bookmarks)){ bookmarks = session.bookmarks; renderCatalogBookmarks(); }
      if(session.view && session.view.center) map.setView(session.view.center, session.view.zoom);
    }
    renderLayerList();
    refreshTable();
  }catch(e){
    console.warn('[autosave] failed to restore session:', e);
  }finally{
    _autosaveRestoring = false;
  }
}

// Best-effort flush so the last couple of seconds of edits aren't lost if
// the tab is closed before the debounce timer would otherwise have fired.
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden'){ clearTimeout(_autosaveTimer); persistAutosaveState(); }
});
window.addEventListener('beforeunload', () => { clearTimeout(_autosaveTimer); persistAutosaveState(); });

restoreAutosaveState();

// ---------- CRS Picker ----------
(function(){
  const dropdown = document.getElementById('crs-dropdown');
  const btn      = document.getElementById('status-crs');

  btn.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', () => dropdown.classList.remove('open'));

  dropdown.querySelectorAll('.crs-opt').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const newCrsKey = el.dataset.crs;
      if(newCrsKey === activeCRSKey){ dropdown.classList.remove('open'); return; }

      // Rebuild map canvas when the CRS changes
      rebuildMap(newCrsKey);

      activeCRSKey = newCrsKey;
      const def = CRS_DEFS[activeCRSKey];
      btn.textContent = 'CRS: ' + def.label;
      dropdown.querySelectorAll('.crs-opt').forEach(o => o.classList.remove('active'));
      el.classList.add('active');
      dropdown.classList.remove('open');
      document.getElementById('status-coords').textContent = def.isGeo
        ? 'Lon: —, Lat: —'
        : 'X: —, Y: —';
    });
  });
})();
updateSelectionStatus();

// =========================================================
// NEW SELECTION TOOLS
// =========================================================

function handleLassoSelect(lassoLayer){
  const lassoGeoJSON = lassoLayer.toGeoJSON();
  Object.values(layers).forEach(lyr => {
    if(!lyr.visible || !lyr.leafletLayer.eachLayer) return;
    lyr.leafletLayer.eachLayer(l => {
      let geom;
      try { geom = l.toGeoJSON(); } catch(err){ return; }
      let hit = false;
      try { hit = turf.booleanIntersects(lassoGeoJSON, geom); } catch(err){ hit = false; }
      if(hit && !selection.includes(l)){
        if(l.setStyle){
          originalStyles.set(l, { color: l.options.color, weight: l.options.weight, fillOpacity: l.options.fillOpacity, opacity: l.options.opacity, fillColor: l.options.fillColor });
          l.setStyle({ color: '#ffd54a', weight: (l.options.weight || 2) + 2, fillOpacity: 0.65, opacity: 1, fillColor: '#ffd54a' });
        }
        selection.push(l);
      }
    });
  });
  updateSelectionStatus();
  refreshTable();
}

function selectAll(){
  clearSelection();
  Object.values(layers).forEach(lyr => {
    if(!lyr.visible || !lyr.leafletLayer.eachLayer) return;
    lyr.leafletLayer.eachLayer(l => {
      if(!l.feature) return;
      if(l.setStyle){
        if(!originalStyles.has(l)){
          originalStyles.set(l, { color: l.options.color, weight: l.options.weight, fillOpacity: l.options.fillOpacity, opacity: l.options.opacity, fillColor: l.options.fillColor });
        }
        l.setStyle({ color: '#ffd54a', weight: (l.options.weight || 2) + 2, fillOpacity: 0.65, opacity: 1, fillColor: '#ffd54a' });
      }
      selection.push(l);
    });
  });
  updateSelectionStatus();
  refreshTable();
}

function selectAllInLayer(id){
  const lyr = layers[id];
  if(!lyr || !lyr.leafletLayer.eachLayer) return;
  clearSelection();
  lyr.leafletLayer.eachLayer(l => {
    if(!l.feature) return;
    if(l.setStyle){
      if(!originalStyles.has(l)){
        originalStyles.set(l, { color: l.options.color, weight: l.options.weight, fillOpacity: l.options.fillOpacity, opacity: l.options.opacity, fillColor: l.options.fillColor });
      }
      l.setStyle({ color: '#ffd54a', weight: (l.options.weight || 2) + 2, fillOpacity: 0.65, opacity: 1, fillColor: '#ffd54a' });
    }
    selection.push(l);
  });
  updateSelectionStatus();
  refreshTable();
}

function invertSelection(){
  const prevSet = new Set(selection);
  const toAdd = [];

  // Restore previously selected
  selection.forEach(l => {
    restoreFeatureStyle(l);
    originalStyles.delete(l);
  });
  selection = [];

  Object.values(layers).forEach(lyr => {
    if(!lyr.visible || !lyr.leafletLayer.eachLayer) return;
    lyr.leafletLayer.eachLayer(l => {
      if(!l.feature || prevSet.has(l)) return;
      if(l.setStyle){
        if(!originalStyles.has(l)){
          originalStyles.set(l, { color: l.options.color, weight: l.options.weight, fillOpacity: l.options.fillOpacity, opacity: l.options.opacity, fillColor: l.options.fillColor });
        }
        l.setStyle({ color: '#ffd54a', weight: (l.options.weight || 2) + 2, fillOpacity: 0.65, opacity: 1, fillColor: '#ffd54a' });
      }
      toAdd.push(l);
    });
  });
  selection = toAdd;
  updateSelectionStatus();
  refreshTable();
}

function deleteSelectedFeatures(){
  if(selection.length === 0) return;
  if(!confirm(`Delete ${selection.length} selected feature(s)?`)) return;
  selection.forEach(l => {
    Object.values(layers).forEach(lyr => {
      if(lyr.leafletLayer.hasLayer && lyr.leafletLayer.hasLayer(l)){
        lyr.leafletLayer.removeLayer(l);
        const idx = lyr.allFeatures.indexOf(l);
        if(idx >= 0) lyr.allFeatures.splice(idx, 1);
      }
    });
  });
  disableLayerEditing(selectedFeatureLayer);
  selectedFeatureLayer = null;
  selection = [];
  originalStyles.clear();
  updateSelectionStatus();
  renderLayerList();
  refreshTable();
}

// Splits a multi-part geometry into its individual single-part geometries.
// Returns null for geometries that are already single-part (nothing to do).
function explodeGeometry(geom){
  switch(geom.type){
    case 'MultiPoint':      return geom.coordinates.map(c => ({ type:'Point', coordinates:c }));
    case 'MultiLineString': return geom.coordinates.map(c => ({ type:'LineString', coordinates:c }));
    case 'MultiPolygon':    return geom.coordinates.map(c => ({ type:'Polygon', coordinates:c }));
    case 'GeometryCollection': return geom.geometries;
    default: return null;
  }
}

// Explode — split each selected multi-part feature (MultiPoint/MultiLineString/
// MultiPolygon/GeometryCollection) into separate single-part features in the
// same layer, copying its attributes onto every part.
function explodeSelectedFeatures(){
  if(selection.length === 0){ alert('Select one or more features first.'); return; }

  let explodedCount = 0, skippedCount = 0;
  const toRemove = [];
  const touchedLayerIds = new Set();

  selection.forEach(l => {
    const ownerId = findOwnerLayerId(l);
    if(!ownerId) return;
    const lyr = layers[ownerId];
    const geom = l.feature?.geometry;
    if(!geom){ skippedCount++; return; }
    const parts = explodeGeometry(geom);
    if(!parts || parts.length < 2){ skippedCount++; return; }

    const style = getLayerStyle(lyr);
    parts.forEach(partGeom => {
      const newFeature = { type:'Feature', geometry: partGeom, properties: { ...(l.feature.properties || {}) } };
      const newLayer = L.geoJSON(newFeature, {
        style,
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, style)
      }).getLayers()[0];
      newLayer.feature = newFeature;
      newLayer.bindPopup(popupHtml(newFeature.properties, lyr.popupFields));
      bindIdentify(newLayer);
      lyr.leafletLayer.addLayer(newLayer);
      explodedCount++;
    });
    toRemove.push({ lyr, layer: l });
    touchedLayerIds.add(ownerId);
  });

  toRemove.forEach(({ lyr, layer }) => {
    lyr.leafletLayer.removeLayer(layer);
    const idx = lyr.allFeatures.indexOf(layer);
    if(idx >= 0) lyr.allFeatures.splice(idx, 1);
  });

  clearSelection();
  renderLayerList();
  refreshTable();
  touchedLayerIds.forEach(id => syncLinkedFeatureClass(id));

  if(explodedCount){
    showGpkgToast(`Exploded into ${explodedCount} single-part feature(s)` + (skippedCount ? ` (${skippedCount} skipped — already single-part)` : ''));
  } else {
    alert('No multi-part features found in the selection to explode.');
  }
}

// =========================================================
// LAYER REORDER (Move Up / Move Down in Contents pane)
// =========================================================

function moveLayerUp(id){
  const ids = Object.keys(layers);
  const idx = ids.indexOf(id);
  if(idx < ids.length - 1){
    swapLayerOrder(id, ids[idx + 1]);
  }
}

function moveLayerDown(id){
  const ids = Object.keys(layers);
  const idx = ids.indexOf(id);
  if(idx > 0){
    swapLayerOrder(id, ids[idx - 1]);
  }
}

function swapLayerOrder(idA, idB){
  // Swap entries in the layers object by rebuilding it
  const keys = Object.keys(layers);
  const ia = keys.indexOf(idA), ib = keys.indexOf(idB);
  if(ia < 0 || ib < 0) return;
  keys[ia] = idB; keys[ib] = idA;
  const snapshot = {};
  keys.forEach(k => { snapshot[k] = layers[k]; });
  Object.keys(layers).forEach(k => delete layers[k]);
  Object.assign(layers, snapshot);

  // Re-add layers to map in new order so z-index reflects order
  Object.values(layers).forEach(lyr => {
    if(lyr.visible && map.hasLayer(lyr.leafletLayer)) lyr.leafletLayer.bringToFront();
  });
  renderLayerList();
}

// =========================================================
// KEYBOARD SHORTCUTS
// =========================================================

document.addEventListener('keydown', function(e){
  const tag = (e.target.tagName || '').toUpperCase();
  if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  // Escape — cancel active draw, then clear selection
  if(e.key === 'Escape'){
    if(activeDrawHandler){ stopActiveDraw(); return; }
    if(selection.length > 0) clearSelection();
    return;
  }

  // Delete / Backspace — delete selected features
  if((e.key === 'Delete' || e.key === 'Backspace') && selection.length > 0){
    e.preventDefault();
    deleteSelectedFeatures();
    return;
  }

  if(e.ctrlKey || e.metaKey){
    // Ctrl+A — select all
    if(e.key === 'a' || e.key === 'A'){
      e.preventDefault();
      selectAll();
      return;
    }
    return;
  }

  // Single-key tool shortcuts (no modifier)
  if(!e.altKey){
    switch(e.key.toLowerCase()){
      case 'p': setTool('pan'); break;
      case 'i': setTool('select'); break;
      case 'r': setTool('select-rect'); break;
      case 'l': setTool('select-lasso'); break;
      case 'n': setTool('point'); break;
    }
  }
});

// =========================================================
// ATTRIBUTE TABLE — sortable columns, click-to-select, CSV export
// =========================================================

// New table controls (export CSV and selected-only filter)
document.getElementById('table-export-csv').addEventListener('click', exportTableCSV);
document.getElementById('table-sel-only').addEventListener('change', refreshTable);

function exportTableCSV(){
  const rows = collectTableRows();
  if(!rows.allRows.length){ alert('No data to export.'); return; }
  const cols = rows.cols;
  const lines = [cols.map(c => JSON.stringify(c)).join(',')];
  rows.allRows.forEach(r => {
    lines.push(cols.map(c => {
      const v = c === 'layer' ? r.layerName : (r.props[c] ?? '');
      return JSON.stringify(String(v));
    }).join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = 'attribute-table.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function collectTableRows(){
  const selOnly = document.getElementById('table-sel-only')?.checked;
  const allRows = [];
  Object.entries(layers).forEach(([id, lyr]) => {
    if(tableFilterLayerId && id !== tableFilterLayerId) return;
    if(!lyr.leafletLayer.eachLayer) return;
    lyr.leafletLayer.eachLayer(l => {
      if(!l.feature) return;
      if(selOnly && !selection.includes(l)) return;
      allRows.push({ layerName: lyr.name, layerId: id, props: l.feature.properties || {}, leafletLayer: l });
    });
  });
  const cols = ['layer', ...new Set(allRows.flatMap(r => Object.keys(r.props)))];
  return { allRows, cols };
}

let tableSortCol = -1, tableSortDir = 1;

function refreshTable(){
  const dock = document.getElementById('table-dock');
  if(!dock.classList.contains('show')) return;

  const titleEl = document.getElementById('table-title');
  const clearBtn = document.getElementById('table-clear-filter');
  const exportBtn = document.getElementById('table-export-csv');
  const selWrap = document.getElementById('table-sel-filter-wrap');

  if(tableFilterLayerId && layers[tableFilterLayerId]){
    titleEl.textContent = 'Attribute Table — ' + layers[tableFilterLayerId].name;
    clearBtn.classList.add('visible');
  } else {
    titleEl.textContent = 'Attribute Table';
    clearBtn.classList.remove('visible');
  }
  exportBtn.classList.add('visible');
  selWrap.classList.add('visible');

  const { allRows, cols } = collectTableRows();
  const head = document.getElementById('table-head');
  const body = document.getElementById('table-body');

  if(allRows.length === 0){
    head.innerHTML = '<th>No features</th>';
    body.innerHTML = '';
    exportBtn.classList.remove('visible');
    return;
  }

  const renderRows = () => {
    let sorted = [...allRows];
    if(tableSortCol >= 0 && tableSortCol < cols.length){
      const colName = cols[tableSortCol];
      sorted.sort((a, b) => {
        const va = colName === 'layer' ? a.layerName : (a.props[colName] ?? '');
        const vb = colName === 'layer' ? b.layerName : (b.props[colName] ?? '');
        const na = parseFloat(va), nb = parseFloat(vb);
        if(!isNaN(na) && !isNaN(nb)) return tableSortDir * (na - nb);
        return tableSortDir * String(va).localeCompare(String(vb));
      });
    }
    body.innerHTML = sorted.map((r, i) => {
      const sel = selection.includes(r.leafletLayer);
      const cells = cols.map(c => {
        const v = c === 'layer' ? r.layerName : (r.props[c] ?? '');
        return `<td>${escapeHtml(String(v))}</td>`;
      }).join('');
      return `<tr data-idx="${i}" class="${sel ? 'tbl-selected' : ''}">${cells}</tr>`;
    }).join('');

    body.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', ev => {
        const row = sorted[parseInt(tr.dataset.idx)];
        if(!row) return;
        if(!ev.shiftKey) clearSelection();
        selectFeature(row.leafletLayer, { enableEdit: false });
        try{
          const c = row.leafletLayer.getLatLng ? row.leafletLayer.getLatLng()
            : row.leafletLayer.getBounds().getCenter();
          if(c && !map.getBounds().contains(c)) map.panTo(c);
        }catch(e){}
        body.querySelectorAll('tr').forEach(r2 => r2.classList.toggle('tbl-selected', selection.includes(sorted[parseInt(r2.dataset.idx)]?.leafletLayer)));
      });
    });
  };

  head.innerHTML = cols.map((c, i) => `<th data-ci="${i}" data-col="${escapeHtml(c)}">${escapeHtml(c)}</th>`).join('');
  head.querySelectorAll('th[data-ci]').forEach(th => {
    const ci = parseInt(th.dataset.ci);
    const colName = th.dataset.col;
    if(ci === tableSortCol) th.classList.add(tableSortDir === 1 ? 'sort-asc' : 'sort-desc');
    th.addEventListener('click', () => {
      if(tableSortCol === ci) tableSortDir *= -1;
      else { tableSortCol = ci; tableSortDir = 1; }
      head.querySelectorAll('th').forEach(h => h.classList.remove('sort-asc','sort-desc'));
      th.classList.add(tableSortDir === 1 ? 'sort-asc' : 'sort-desc');
      renderRows();
    });
  });

  renderRows();
}

/* ================================================================
   COLUMN RIGHT-CLICK CONTEXT MENU
   ================================================================ */

let _colCtxCleanup = null;

function openColumnContextMenu(colName, x, y) {
  const menu = document.getElementById('col-ctx-menu');
  menu.innerHTML = [
    `<div class="ctx-item" data-col-act="sort-asc"  data-col="${escapeHtml(colName)}">Sort Ascending ↑</div>`,
    `<div class="ctx-item" data-col-act="sort-desc" data-col="${escapeHtml(colName)}">Sort Descending ↓</div>`,
    `<div class="ctx-sep"></div>`,
    `<div class="ctx-item" data-col-act="statistics"  data-col="${escapeHtml(colName)}">Statistics…</div>`,
    `<div class="ctx-item" data-col-act="fieldcalc"   data-col="${escapeHtml(colName)}">Field Calculator…</div>`,
    `<div class="ctx-sep"></div>`,
    `<div class="ctx-item" data-col-act="select-by-field" data-col="${escapeHtml(colName)}">Select By Attribute (this field)…</div>`,
  ].join('');

  /* Tear down any previous context menu FIRST, then show this one */
  if(_colCtxCleanup) { _colCtxCleanup(); _colCtxCleanup = null; }

  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  menu.classList.add('show');

  const outsideClick = ev => { if(!menu.contains(ev.target)) close(); };
  function close(){
    menu.classList.remove('show');
    document.removeEventListener('mousedown', outsideClick);
    _colCtxCleanup = null;
  }
  document.addEventListener('mousedown', outsideClick);
  _colCtxCleanup = close;

  menu.querySelectorAll('.ctx-item[data-col-act]').forEach(item => {
    item.addEventListener('click', () => {
      close();
      handleColumnContextAction(item.dataset.colAct, item.dataset.col);
    });
  });
}

function handleColumnContextAction(action, colName) {
  const { cols } = collectTableRows();
  const ci = cols.indexOf(colName);
  switch(action) {
    case 'sort-asc':
      tableSortCol = ci >= 0 ? ci : tableSortCol;
      tableSortDir = 1;
      refreshTable();
      break;
    case 'sort-desc':
      tableSortCol = ci >= 0 ? ci : tableSortCol;
      tableSortDir = -1;
      refreshTable();
      break;
    case 'statistics':
      openColumnStatisticsPanel(colName);
      break;
    case 'fieldcalc':
      openFieldCalculatorPanel(colName);
      break;
    case 'select-by-field':
      if(typeof openSelectByAttribute === 'function') openSelectByAttribute(colName);
      break;
  }
}

/* ================================================================
   FIELD CALCULATOR PANEL
   ================================================================ */

const FIELD_CALC_PRESETS = [
  // ── Common ──────────────────────────────────────────────────────────
  { label: '── Common ──', category: true },
  { label: 'Copy existing field',         expr: '$value',
    desc: 'Return the current field value unchanged' },
  { label: 'Row number (1-based)',         expr: '$index + 1',
    desc: 'Sequential ID starting at 1' },
  { label: 'Null / empty check',          expr: '($value == null || $value === "") ? "N/A" : $value',
    desc: 'Replace null or blank with "N/A"' },
  { label: 'Default if null',             expr: '$value ?? 0',
    desc: 'Use 0 (or any default) when value is null' },

  // ── Math ────────────────────────────────────────────────────────────
  { label: '── Math ──', category: true },
  { label: 'Round (2 decimals)',           expr: 'Math.round($value * 100) / 100',
    desc: 'e.g. 3.14159 → 3.14' },
  { label: 'Round to whole number',        expr: 'Math.round($value)',
    desc: '' },
  { label: 'Absolute value',              expr: 'Math.abs($value)',
    desc: 'Always positive' },
  { label: 'Square root',                 expr: 'Math.sqrt($value)',
    desc: '' },
  { label: 'Power (square)',              expr: 'Math.pow($value, 2)',
    desc: '$value²' },
  { label: 'Natural log',                 expr: 'Math.log($value)',
    desc: 'ln($value)' },
  { label: 'Log base 10',                 expr: 'Math.log10($value)',
    desc: '' },
  { label: 'Multiply by constant',        expr: '$value * 1000',
    desc: 'Change 1000 to any factor' },
  { label: 'Divide by constant',          expr: '$value / 1000',
    desc: 'Change 1000 to any divisor' },
  { label: 'Sum two fields',              expr: '(+$props["field1"] || 0) + (+$props["field2"] || 0)',
    desc: 'Replace field1 / field2 with real field names' },
  { label: 'Difference of two fields',    expr: '$props["field1"] - $props["field2"]',
    desc: 'Replace field1 / field2 with real field names' },
  { label: 'Ratio of two fields (%)',     expr: '$props["field1"] / $props["field2"] * 100',
    desc: 'e.g. urban_pop / total_pop * 100' },
  { label: 'Clamp to range [0, 100]',    expr: 'Math.min(100, Math.max(0, $value))',
    desc: 'Forces value into 0–100' },
  { label: 'Normalize 0–1',              expr: '/* set min/max manually */ ($value - 0) / (100 - 0)',
    desc: 'Replace 0 and 100 with actual min/max' },

  // ── Conditional / Classify ───────────────────────────────────────────
  { label: '── Conditional / Classify ──', category: true },
  { label: 'If / else (numeric)',         expr: '$value > 100 ? "High" : "Low"',
    desc: 'Change threshold and labels as needed' },
  { label: 'Three-class reclassify',      expr: '$value < 33 ? "Low" : $value < 66 ? "Medium" : "High"',
    desc: 'Adjust thresholds to your data range' },
  { label: 'Reclassify to number',        expr: '$value < 33 ? 1 : $value < 66 ? 2 : 3',
    desc: 'Returns 1, 2, or 3 instead of labels' },
  { label: 'Flag outliers',              expr: 'Math.abs($value) > 1000 ? "Outlier" : "Normal"',
    desc: 'Replace 1000 with your threshold' },
  { label: 'Positive / Negative / Zero', expr: '$value > 0 ? "Positive" : $value < 0 ? "Negative" : "Zero"',
    desc: '' },
  { label: 'Match exact value',           expr: '$value === "California" ? "Pacific" : "Other"',
    desc: 'Replace field values with your own' },

  // ── String ───────────────────────────────────────────────────────────
  { label: '── String ──', category: true },
  { label: 'Uppercase',                   expr: 'String($value).toUpperCase()',
    desc: '' },
  { label: 'Lowercase',                   expr: 'String($value).toLowerCase()',
    desc: '' },
  { label: 'Title Case',                  expr: 'String($value).replace(/\\b\\w/g, c => c.toUpperCase())',
    desc: 'Capitalises first letter of every word' },
  { label: 'Trim whitespace',             expr: 'String($value).trim()',
    desc: '' },
  { label: 'Concatenate two fields',      expr: 'String($props["field1"]) + " " + String($props["field2"])',
    desc: 'Replace field1 / field2 with real field names' },
  { label: 'Pad number (3 digits)',        expr: 'String($value).padStart(3,"0")',
    desc: 'e.g. 7 → "007"' },
  { label: 'Extract first N characters',  expr: 'String($value).slice(0, 5)',
    desc: 'Change 5 to desired length' },
  { label: 'Find & replace (text)',       expr: 'String($value).replace("old", "new")',
    desc: 'Replaces first occurrence' },
  { label: 'Find & replace (all)',        expr: 'String($value).replaceAll("old", "new")',
    desc: 'Replaces every occurrence' },
  { label: 'String length',              expr: 'String($value).length',
    desc: 'Number of characters' },
  { label: 'Contains substring? (1/0)',  expr: 'String($value).includes("keyword") ? 1 : 0',
    desc: 'Replace keyword with search text' },
  { label: 'Extract number from string', expr: 'parseFloat(String($value).replace(/[^0-9.-]/g,""))',
    desc: 'Strips non-numeric characters' },

  // ── Spatial ──────────────────────────────────────────────────────────
  { label: '── Spatial ──', category: true },
  { label: 'Area (m²)',                   expr: 'turf.area(turf.feature($geom))',
    desc: 'Polygons only' },
  { label: 'Area (hectares)',             expr: 'turf.area(turf.feature($geom)) / 10000',
    desc: 'Polygons only' },
  { label: 'Area (km²)',                  expr: 'turf.area(turf.feature($geom)) / 1e6',
    desc: 'Polygons only' },
  { label: 'Perimeter / Length (m)',      expr: 'turf.length(turf.feature($geom), {units:"meters"})',
    desc: 'Polygons & Polylines' },
  { label: 'Perimeter / Length (km)',     expr: 'turf.length(turf.feature($geom), {units:"kilometers"})',
    desc: 'Polygons & Polylines' },
  { label: 'Population density (per km²)',expr: '$props["population"] / (turf.area(turf.feature($geom)) / 1e6)',
    desc: 'Replace "population" with the actual field name' },
  { label: 'Centroid Longitude',          expr: 'turf.centroid(turf.feature($geom)).geometry.coordinates[0]',
    desc: 'Polygons' },
  { label: 'Centroid Latitude',           expr: 'turf.centroid(turf.feature($geom)).geometry.coordinates[1]',
    desc: 'Polygons' },
  { label: 'Longitude (point)',           expr: '$geom.coordinates[0]',
    desc: 'Point layers only' },
  { label: 'Latitude (point)',            expr: '$geom.coordinates[1]',
    desc: 'Point layers only' },
  { label: 'Vertex count',               expr: '($geom.coordinates[0] || $geom.coordinates || []).length',
    desc: 'Number of vertices in the geometry' },

  // ── Date / Time ───────────────────────────────────────────────────────
  { label: '── Date / Time ──', category: true },
  { label: 'Current date (YYYY-MM-DD)',   expr: 'new Date().toISOString().slice(0,10)',
    desc: 'Stamps today\'s date on every row' },
  { label: 'Current timestamp',           expr: 'new Date().toISOString()',
    desc: 'Full ISO timestamp' },
  { label: 'Extract year from date field',expr: 'new Date($value).getFullYear()',
    desc: '$value must be a parseable date string' },
  { label: 'Age in years from date',      expr: 'Math.floor((Date.now() - new Date($value)) / 31557600000)',
    desc: 'e.g. years since construction date' },

  // ── Custom ────────────────────────────────────────────────────────────
  { label: '── Custom ──', category: true },
  { label: 'Write custom expression…',    expr: '',
    desc: 'Type your own JavaScript expression below' },
];

function closeFcModal() {
  document.getElementById('fc-modal-overlay').classList.remove('show');
}

document.getElementById('fc-modal-overlay').addEventListener('click', ev => {
  if(ev.target === ev.currentTarget) closeFcModal();
});

/* Delegated contextmenu on document — catches th[data-col] right-clicks
   regardless of table rebuilds or ancestor overflow clipping. */
document.addEventListener('contextmenu', ev => {
  const th = ev.target.closest('#table-head th[data-col]');
  if(!th) return;
  ev.preventDefault();
  openColumnContextMenu(th.dataset.col, ev.clientX, ev.clientY);
});

function openFieldCalculatorPanel(defaultField) {
  const lid = tableFilterLayerId;
  const layerEntries = Object.entries(layers).filter(([,l]) => l.allFeatures && l.allFeatures.length > 0);
  if(layerEntries.length === 0){ alert('No layers with features available.'); return; }

  const layerOptions = layerEntries.map(([id, l]) =>
    `<option value="${id}" ${id === lid ? 'selected' : ''}>${escapeHtml(l.name)}</option>`
  ).join('');

  const presetOptions = FIELD_CALC_PRESETS.map(p =>
    p.category
      ? `<option disabled>${escapeHtml(p.label)}</option>`
      : `<option value="${escapeHtml(p.expr)}" title="${escapeHtml(p.desc)}">${escapeHtml(p.label)}</option>`
  ).join('');

  const modal = document.getElementById('fc-modal');
  const overlay = document.getElementById('fc-modal-overlay');

  modal.innerHTML = `
    <div class="fc-modal-header">
      <span class="fc-modal-title">Field Calculator</span>
      <button class="close-x" onclick="closeFcModal()">&#x2715;</button>
    </div>
    <div class="fc-modal-body">
      <div>
        <div class="fc-label">Layer</div>
        <select class="fc-input" id="fc-layer">${layerOptions}</select>
      </div>
      <div>
        <div class="fc-label">Target Field</div>
        <div class="fc-row">
          <select class="fc-input" id="fc-field"></select>
          <input class="fc-input" id="fc-new-field" placeholder="or type new field name">
        </div>
      </div>
      <div>
        <div class="fc-label">Preset Expression</div>
        <select class="fc-input" id="fc-preset">
          <option value="">— pick a preset —</option>
          ${presetOptions}
        </select>
      </div>
      <div>
        <div class="fc-label">Expression</div>
        <textarea class="fc-input" id="fc-expr" rows="3" placeholder="e.g.  $value > 1000000 ? &quot;Large&quot; : &quot;Small&quot;" style="font-family:monospace;font-size:11px;resize:vertical"></textarea>
        <div class="fc-hint"><b>JavaScript</b> expression — must return a value. Variables: <code>$value</code> (selected field), <code>$props</code> (all attributes), <code>$geom</code> (GeoJSON geometry), <code>$index</code> (row #, 0-based), <code>turf</code> (Turf.js). Use <b>Preview</b> to test before applying.</div>
      </div>
      <div class="fc-btn-row">
        <button class="btn" id="fc-preview" style="flex:0 0 auto">Preview (3 rows)</button>
        <button class="btn primary" id="fc-apply" style="flex:1">Apply</button>
      </div>
      <div id="fc-preview-out" class="fc-preview-out" style="display:none"></div>
      <div id="fc-msg" class="fc-msg"></div>
    </div>`;

  overlay.classList.add('show');

  const fcLayer      = document.getElementById('fc-layer');
  const fcField      = document.getElementById('fc-field');
  const fcNewField   = document.getElementById('fc-new-field');
  const fcPreset     = document.getElementById('fc-preset');
  const fcExpr       = document.getElementById('fc-expr');
  const fcPreviewOut = document.getElementById('fc-preview-out');
  const fcMsg        = document.getElementById('fc-msg');

  function populateFields(layerId) {
    const lyr = layers[layerId];
    if(!lyr || !lyr.allFeatures || lyr.allFeatures.length === 0){ fcField.innerHTML = ''; return; }
    const sample = lyr.allFeatures[0].feature?.properties || {};
    const fieldNames = Object.keys(sample);
    fcField.innerHTML = fieldNames.map(f =>
      `<option value="${escapeHtml(f)}" ${f === defaultField ? 'selected' : ''}>${escapeHtml(f)}</option>`
    ).join('');
    if(defaultField && fieldNames.includes(defaultField)) fcField.value = defaultField;
  }
  populateFields(fcLayer.value);
  fcLayer.addEventListener('change', () => populateFields(fcLayer.value));

  fcPreset.addEventListener('change', () => {
    if(fcPreset.value) fcExpr.value = fcPreset.value;
  });

  function evalExpr(features, fieldName, expr, previewMode) {
    const fn = new Function('turf','$props','$geom','$index','$value',
      '"use strict"; return (' + expr + ');');
    const results = [];
    const errors  = [];
    features.forEach((leafletLayer, idx) => {
      const props = leafletLayer.feature?.properties || {};
      const geom  = leafletLayer.feature?.geometry  || {};
      const val   = props[fieldName];
      try {
        results.push({ leafletLayer, result: fn(turf, props, geom, idx, val) });
      } catch(e) {
        errors.push({ idx, msg: e.message });
      }
    });
    return { results, errors };
  }

  document.getElementById('fc-preview').addEventListener('click', () => {
    const layerId   = fcLayer.value;
    const fieldName = fcNewField.value.trim() || fcField.value;
    const expr      = fcExpr.value.trim();
    if(!fieldName || !expr){ fcPreviewOut.textContent = 'Set a field and expression first.'; return; }
    const lyr = layers[layerId];
    if(!lyr){ return; }
    const sample = lyr.allFeatures.slice(0, 3);
    const { results, errors } = evalExpr(sample, fieldName, expr, true);
    let out = results.map((r, i) => `Row ${i}: ${JSON.stringify(r.result)}`).join('\n');
    if(errors.length) out += '\nErrors: ' + errors.map(e => `row ${e.idx}: ${e.msg}`).join(', ');
    fcPreviewOut.textContent = out || '(no results)';
    fcPreviewOut.style.display = 'block';
    fcMsg.textContent = '';
  });

  document.getElementById('fc-apply').addEventListener('click', () => {
    const layerId   = fcLayer.value;
    const newField  = fcNewField.value.trim();
    const fieldName = newField || fcField.value;
    const expr      = fcExpr.value.trim();
    if(!fieldName){ fcMsg.style.color='var(--warn)'; fcMsg.textContent='Select or enter a target field.'; return; }
    if(!expr){ fcMsg.style.color='var(--warn)'; fcMsg.textContent='Enter an expression.'; return; }
    const lyr = layers[layerId];
    if(!lyr){ return; }
    const { results, errors } = evalExpr(lyr.allFeatures, fieldName, expr, false);
    results.forEach(r => {
      if(!r.leafletLayer.feature) r.leafletLayer.feature = { properties: {} };
      r.leafletLayer.feature.properties[fieldName] = r.result;
    });
    const errCount = errors.length;
    fcMsg.style.color = errCount ? 'var(--warn)' : 'var(--accent)';
    fcMsg.textContent = errCount
      ? `Applied to ${results.length} features; ${errCount} errors.`
      : `Applied to ${results.length} features.`;
    fcPreviewOut.style.display = 'none';
    fcPreviewOut.textContent = '';
    refreshTable();
  });
}

/* ================================================================
   COLUMN STATISTICS PANEL
   ================================================================ */

function openColumnStatisticsPanel(colName) {
  const lid = tableFilterLayerId;
  const layerEntries = Object.entries(layers).filter(([,l]) => l.allFeatures && l.allFeatures.length > 0);
  if(layerEntries.length === 0){ alert('No layers with features.'); return; }

  const layerId = lid && layers[lid] ? lid : layerEntries[0][0];
  const lyr = layers[layerId];
  const values = lyr.allFeatures.map(f => (f.feature?.properties || {})[colName]);

  const count    = values.length;
  const nonNull  = values.filter(v => v !== null && v !== undefined && v !== '').length;
  const nullCount = count - nonNull;
  const unique   = new Set(values.map(v => String(v))).size;

  const nums = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
  const isNumeric = nums.length > 0;

  let statsHTML = `
    <div class="fc-stats-grid">
      <span style="color:var(--text-faint)">Count</span>        <span>${count}</span>
      <span style="color:var(--text-faint)">Non-null</span>     <span>${nonNull}</span>
      <span style="color:var(--text-faint)">Null / empty</span> <span>${nullCount}</span>
      <span style="color:var(--text-faint)">Unique values</span><span>${unique}</span>`;

  if(isNumeric) {
    const sum    = nums.reduce((a, b) => a + b, 0);
    const mean   = sum / nums.length;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid    = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
    const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
    const std    = Math.sqrt(variance);
    statsHTML += `
      <span class="fc-stats-section">Numeric</span>
      <span style="color:var(--text-faint)">Min</span>    <span>${sorted[0].toLocaleString()}</span>
      <span style="color:var(--text-faint)">Max</span>    <span>${sorted[sorted.length-1].toLocaleString()}</span>
      <span style="color:var(--text-faint)">Sum</span>    <span>${sum.toLocaleString(undefined,{maximumFractionDigits:4})}</span>
      <span style="color:var(--text-faint)">Mean</span>   <span>${mean.toFixed(4)}</span>
      <span style="color:var(--text-faint)">Median</span> <span>${median.toFixed(4)}</span>
      <span style="color:var(--text-faint)">Std Dev</span><span>${std.toFixed(4)}</span>`;
  }

  const freq = {};
  values.forEach(v => { const k = String(v); freq[k] = (freq[k] || 0) + 1; });
  const topFive = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);
  statsHTML += `<span class="fc-stats-section">Most Frequent</span>`;
  topFive.forEach(([val, cnt]) => {
    statsHTML += `<span style="color:var(--text-faint)">${escapeHtml(val)}</span><span>${cnt}×</span>`;
  });
  statsHTML += '</div>';

  const modal = document.getElementById('fc-modal');
  const overlay = document.getElementById('fc-modal-overlay');

  modal.innerHTML = `
    <div class="fc-modal-header">
      <span class="fc-modal-title">Statistics — ${escapeHtml(colName)}</span>
      <button class="close-x" onclick="closeFcModal()">&#x2715;</button>
    </div>
    <div class="fc-modal-body">
      <div style="font-size:10.5px;color:var(--text-faint);margin-bottom:4px">Layer: <strong style="color:var(--text)">${escapeHtml(lyr.name)}</strong></div>
      ${statsHTML}
    </div>`;

  overlay.classList.add('show');
}

/* ================================================================
   RIBBON COMPACT MODE — collapses to icon-only when narrow
   ================================================================ */
(function(){
  const ribbonEl = document.getElementById('ribbon');
  const COMPACT_THRESHOLD = 700; // px — below this the ribbon compacts

  function applyRibbonMode(){
    const w = ribbonEl.getBoundingClientRect().width;
    ribbonEl.classList.toggle('ribbon-compact', w < COMPACT_THRESHOLD);
  }

  applyRibbonMode();
  new ResizeObserver(applyRibbonMode).observe(ribbonEl);
})();

/* ================================================================
   GEODATABASE — GeoPackage (.gpkg) support
   Uses sql.js (SQLite WASM) loaded lazily on first use.
   ================================================================ */

const gpkgDatabases = [];
let _sqlJs = null;

async function loadSqlJs(){
  if(_sqlJs) return _sqlJs;
  if(!window.initSqlJs){
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load sql.js from CDN'));
      document.head.appendChild(s);
    });
  }
  _sqlJs = await window.initSqlJs({
    locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
  });
  return _sqlJs;
}

/* ── Lazy CDN loaders ────────────────────────────────────────────── */

let _jsZip = null;
async function loadJSZip(){
  if(_jsZip) return _jsZip;
  if(!window.JSZip){
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load JSZip'));
      document.head.appendChild(s);
    });
  }
  _jsZip = window.JSZip;
  return _jsZip;
}

// GDAL compiled to WebAssembly — used only for real ESRI File Geodatabase (.gdb)
// import, since browsers have no native way to read that binary format and no
// other library here can parse it. Large (~tens of MB), so only fetched the
// first time the user actually tries to import a .gdb folder.
let _gdalJs = null;
const GDAL_JS_VERSION = '2.8.1';
async function loadGdalJs(onProgress){
  if(_gdalJs) return _gdalJs;
  if(!window.initGdalJs){
    if(onProgress) onProgress('Downloading GDAL (WebAssembly)… this is a one-time ~30MB fetch.');
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://cdn.jsdelivr.net/npm/gdal3.js@${GDAL_JS_VERSION}/dist/package/gdal3.js`;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load gdal3.js from CDN'));
      document.head.appendChild(s);
    });
  }
  if(onProgress) onProgress('Initializing GDAL…');
  _gdalJs = await window.initGdalJs({
    path: `https://cdn.jsdelivr.net/npm/gdal3.js@${GDAL_JS_VERSION}/dist/package`,
    useWorker: false
  });
  return _gdalJs;
}

let _shpJs = null;
async function loadShpJs(){
  if(_shpJs) return _shpJs;
  if(!window.shp){
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/shpjs@latest/dist/shp.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load shpjs'));
      document.head.appendChild(s);
    });
  }
  _shpJs = window.shp;
  return _shpJs;
}

/* ── Universal connect-file handler ──────────────────────────────── */

async function openConnectFile(file, fileHandle){
  const ext = file.name.split('.').pop().toLowerCase();
  const connectBtn = document.getElementById('catalog-add-db');
  const orig = connectBtn ? connectBtn.textContent : '';
  if(connectBtn){ connectBtn.textContent = 'Loading…'; connectBtn.disabled = true; }
  try {
    if(ext === 'gpkg')                       return await openGeoPackage(file, fileHandle);
    if(ext === 'zip')                        return await openZipConnect(file);
    if(ext === 'shp')                        return await openShpFile(file);
    if(ext === 'json' || ext === 'geojson')  return await openGeoJsonFile(file);
    if(['gdb','mdb','accdb','sde'].includes(ext)){
      showGdbExportGuide(ext);
      return;
    }
    alert(`Unsupported file format: .${ext}\n\nSupported: .gpkg  .zip (shapefile)  .shp  .geojson`);
  } catch(e){
    alert('Error opening file: ' + e.message);
  } finally {
    if(connectBtn){ connectBtn.textContent = orig; connectBtn.disabled = false; }
  }
}

function showGdbExportGuide(ext){
  const modal = document.createElement('div');
  modal.className = 'fc-modal-overlay show';
  modal.innerHTML = `
    <div class="fc-modal" style="width:420px;">
      <div class="fc-modal-header">
        <span class="fc-modal-title">ESRI Geodatabase — Export Required</span>
        <button class="btn" style="flex:none;padding:2px 8px;" onclick="this.closest('.fc-modal-overlay').remove()">✕</button>
      </div>
      <div class="fc-modal-body" style="line-height:1.6;">
        <p style="margin:0 0 10px;color:var(--text);">
          <strong>.${ext}</strong> files use a proprietary ESRI binary format that cannot be
          read directly in a web browser.
        </p>
        <p style="margin:0 0 8px;color:var(--text-faint);font-size:12px;">How to export your data:</p>
        <div class="gdb-guide-step"><span class="gdb-guide-num">1</span>
          Open your geodatabase in <strong>ArcGIS Pro</strong> or <strong>QGIS</strong>
        </div>
        <div class="gdb-guide-step"><span class="gdb-guide-num">2</span>
          Right-click the layer → <em>Export / Save Features As…</em>
        </div>
        <div class="gdb-guide-step"><span class="gdb-guide-num">3</span>
          Choose one of these formats:
          <ul style="margin:4px 0 0 16px;font-size:12px;">
            <li><strong>GeoPackage (.gpkg)</strong> — preserves all attributes &amp; layers</li>
            <li><strong>Shapefile (.shp / .zip)</strong> — widely supported</li>
            <li><strong>GeoJSON (.geojson)</strong> — small datasets</li>
          </ul>
        </div>
        <div class="gdb-guide-step"><span class="gdb-guide-num">4</span>
          Come back and use <strong>⬆ Connect</strong> to open the exported file
        </div>
        <button class="btn primary" style="width:100%;margin-top:14px;"
          onclick="this.closest('.fc-modal-overlay').remove()">Got it</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
}

async function openZipConnect(file){
  const JSZip = await loadJSZip();
  const buf   = await file.arrayBuffer();
  let zip;
  try { zip = await JSZip.loadAsync(buf); }
  catch(e){ alert('Cannot read zip: ' + e.message); return; }

  const entries = Object.keys(zip.files);
  const lower   = entries.map(f => f.toLowerCase());

  // ① GeoPackage inside zip
  const gpkgIdx = lower.findIndex(f => f.endsWith('.gpkg'));
  if(gpkgIdx !== -1){
    const data    = await zip.files[entries[gpkgIdx]].async('arraybuffer');
    const gpkgFile = new File([data], entries[gpkgIdx].split('/').pop());
    return openGeoPackage(gpkgFile);
  }

  // ② Shapefile inside zip  (shpjs handles the whole zip natively)
  if(lower.some(f => f.endsWith('.shp'))){
    return openShpZipBuffer(buf, file.name);
  }

  // ③ GeoJSON inside zip
  const jsonIdx = lower.findIndex(f => f.endsWith('.geojson') || (f.endsWith('.json') && !f.includes('package')));
  if(jsonIdx !== -1){
    const text = await zip.files[entries[jsonIdx]].async('text');
    try { loadGeoJSON(entries[jsonIdx].split('/').pop().replace(/\.\w+$/, ''), JSON.parse(text)); return; }
    catch(e){ alert('Invalid GeoJSON inside zip: ' + e.message); return; }
  }

  // ④ File Geodatabase inside zip — can't parse, guide the user
  if(lower.some(f => f.endsWith('.gdb') || f.includes('.gdb/'))){
    showGdbExportGuide('gdb');
    return;
  }

  alert('No supported GIS data found in this zip.\nLooking for: .gpkg, .shp, .geojson');
}

async function openShpZipBuffer(buf, name){
  const shp = await loadShpJs();
  let result;
  try { result = await shp(buf); }
  catch(e){ alert('Shapefile parse error: ' + e.message); return; }

  const collections = Array.isArray(result) ? result : [result];
  let loaded = 0;
  collections.forEach(fc => {
    if(!fc || !Array.isArray(fc.features) || !fc.features.length) return;
    loadGeoJSON(fc.fileName || name.replace(/\.zip$/i, ''), fc);
    loaded++;
  });
  if(!loaded) alert('Shapefile was read but contains no features.');
}

async function openShpFile(file){
  const shp = await loadShpJs();
  const buf = await file.arrayBuffer();
  try {
    const geoms = await shp.parseShp(buf);
    const fc = {
      type: 'FeatureCollection',
      features: geoms.map(g => ({ type: 'Feature', geometry: g, properties: {} }))
    };
    loadGeoJSON(file.name.replace(/\.shp$/i, ''), fc);
  } catch(e){ alert('Cannot parse .shp file: ' + e.message + '\n\nTip: zip the .shp with its .dbf and .prj files together for full attribute support.'); }
}

async function openGeoJsonFile(file){
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch(e){ alert('Invalid JSON: ' + e.message); return; }
  const name = file.name.replace(/\.\w+$/, '');
  if(data.type === 'FeatureCollection'){ loadGeoJSON(name, data); return; }
  if(data.type === 'Feature'){ loadGeoJSON(name, { type:'FeatureCollection', features:[data] }); return; }
  if(data.features){ loadGeoJSON(name, data); return; }
  alert('File does not appear to be a GeoJSON FeatureCollection.');
}

/* ── GeoPackage reader ───────────────────────────────────────────── */

async function openGeoPackage(file, fileHandle){
  try {
    const SQL = await loadSqlJs();
    const buf = await file.arrayBuffer();
    const db  = new SQL.Database(new Uint8Array(buf));

    // Verify GeoPackage by checking gpkg_contents table exists
    const check = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='gpkg_contents'");
    if(!check.length){ db.close(); alert('Not a valid GeoPackage file.'); return; }

    // Read feature classes — also try 'features' spelled with different data_type values
    const fcRes = db.exec(`
      SELECT c.table_name, c.identifier,
             g.column_name AS geom_col, g.geometry_type_name AS geom_type
      FROM gpkg_contents c
      LEFT JOIN gpkg_geometry_columns g ON c.table_name = g.table_name
      WHERE lower(c.data_type) IN ('features','feature','vector')
    `);

    // Also catch tables in gpkg_geometry_columns that might not be in gpkg_contents
    let extraGeomCols = [];
    try {
      const eg = db.exec(`SELECT table_name, column_name, geometry_type_name FROM gpkg_geometry_columns`);
      if(eg.length) extraGeomCols = eg[0].values.map(r => ({ table_name: r[0], column_name: r[1], geom_type: r[2] }));
    } catch(_){}

    const featureClasses = [];
    const seen = new Set();

    const addFc = (tableName, identifier, geomColHint, geomType, db_ref) => {
      if(seen.has(tableName)) return;
      seen.add(tableName);
      // Verify the table actually exists
      try { db_ref.exec(`SELECT 1 FROM "${tableName}" LIMIT 0`); } catch(_){ return; }
      let count = 0;
      try { count = db_ref.exec(`SELECT COUNT(*) FROM "${tableName}"`)[0]?.values[0]?.[0] ?? 0; } catch(_){}
      featureClasses.push({
        tableName,
        identifier: identifier || tableName,
        geomCol:    geomColHint || 'geom',
        geomType:   geomType   || 'GEOMETRY',
        count
      });
    };

    if(fcRes.length){
      const { columns, values } = fcRes[0];
      for(const row of values){
        const r = Object.fromEntries(columns.map((c,i) => [c, row[i]]));
        addFc(r.table_name, r.identifier, r.geom_col, r.geom_type, db);
      }
    }
    // Add any tables found only in gpkg_geometry_columns
    for(const e of extraGeomCols){
      addFc(e.table_name, e.table_name, e.column_name, e.geom_type, db);
    }

    gpkgDatabases.push({ name: file.name, db, featureClasses, collapsed: false, fileHandle: fileHandle || null });
    renderCatalogDatabases();
    showLeftTab('catalog');
    document.getElementById('left-panel').classList.remove('collapsed');
  } catch(e){
    throw e; // let openConnectFile handle the alert and button state
  }
}

function gpkgGeomIcon(type){
  const t = (type || '').toUpperCase();
  if(t.includes('POINT'))   return '◉';
  if(t.includes('LINE'))    return '〰';
  if(t.includes('POLYGON')) return '⬡';
  return '⬡';
}

// renderCatalogDatabases is defined further below (near the IIFE that wires up the buttons)

function detectGpkgGeomColumn(db, tableName, hint){
  // 1. Get all columns from pragma
  let cols = [];
  try {
    const p = db.exec(`PRAGMA table_info("${tableName}")`);
    if(p.length) cols = p[0].values.map(r => ({ name: r[1], type: (r[2]||'').toUpperCase() }));
  } catch(_){ return hint || null; }

  const colNames = cols.map(c => c.name);

  // 2. Try candidates in priority order: hint first, then common names
  const COMMON = ['geom','geometry','Shape','SHAPE','the_geom','wkb_geometry','geom_4326','shape','Geometry'];
  const candidates = [hint, ...COMMON].filter(Boolean).filter(c => colNames.includes(c));

  for(const name of candidates){
    try {
      const s = db.exec(`SELECT "${name}" FROM "${tableName}" WHERE "${name}" IS NOT NULL LIMIT 1`);
      if(!s.length || !s[0].values.length) continue;
      const v = s[0].values[0][0];
      const bytes = v instanceof Uint8Array ? v : (v && typeof v === 'object' ? new Uint8Array(Object.values(v)) : null);
      if(bytes && bytes.length >= 8 && bytes[0] === 0x47 && bytes[1] === 0x50) return name;
    } catch(_){}
  }

  // 3. Last resort: any BLOB column that has GP magic bytes
  const blobCols = cols.filter(c => c.type === 'BLOB' || c.type === '').map(c => c.name);
  for(const name of blobCols){
    if(candidates.includes(name)) continue; // already tried
    try {
      const s = db.exec(`SELECT "${name}" FROM "${tableName}" WHERE "${name}" IS NOT NULL LIMIT 1`);
      if(!s.length || !s[0].values.length) continue;
      const v = s[0].values[0][0];
      const bytes = v instanceof Uint8Array ? v : null;
      if(bytes && bytes.length >= 8 && bytes[0] === 0x47 && bytes[1] === 0x50) return name;
    } catch(_){}
  }

  return hint || null;
}

function addGpkgLayerToMap(di, fi){
  const gdb = gpkgDatabases[di];
  const fc  = gdb.featureClasses[fi];

  // Route ArcGIS REST entries separately
  if(fc.isArcGis || gdb.isArcGis){
    addArcGisLayerToMap(di, fi).catch(e => alert('ArcGIS load failed: ' + e.message));
    return;
  }

  // If the linked sketch layer is still live in memory, just re-select it
  if(fc.linkedLayerId && layers[fc.linkedLayerId]){
    activeSketchLayerId = fc.linkedLayerId;
    renderLayerList();
    return;
  }

  // Re-query geometry column from the live DB (don't trust cached fc.geomCol)
  let geomColFromDb = null;
  try {
    const safe = fc.tableName.replace(/'/g, "''");
    const gcRes = gdb.db.exec(`SELECT column_name FROM gpkg_geometry_columns WHERE table_name='${safe}' LIMIT 1`);
    if(gcRes.length && gcRes[0].values.length) geomColFromDb = gcRes[0].values[0][0];
  } catch(_){}

  const geomCol = detectGpkgGeomColumn(gdb.db, fc.tableName, geomColFromDb || fc.geomCol);

  if(!geomCol){
    alert(`Could not detect a geometry column in "${fc.tableName}".\nColumns found: ` +
      (() => { try { const p = gdb.db.exec(`PRAGMA table_info("${fc.tableName}")`); return p.length ? p[0].values.map(r=>r[1]).join(', ') : '(none)'; } catch(_){ return '(error)'; } })()
    );
    return;
  }

  // Get all non-geometry attribute columns
  let allCols = [];
  try {
    const p = gdb.db.exec(`PRAGMA table_info("${fc.tableName}")`);
    if(p.length) allCols = p[0].values.map(r => r[1]);
  } catch(e){ alert('Schema error: ' + e.message); return; }

  const attrCols = allCols.filter(c => c !== geomCol && c.toLowerCase() !== 'fid');

  // Count rows first for a useful error message
  let rowCount = 0;
  try {
    const cnt = gdb.db.exec(`SELECT COUNT(*) FROM "${fc.tableName}"`);
    rowCount = cnt[0]?.values[0]?.[0] ?? 0;
  } catch(_){}

  if(rowCount === 0){
    // Empty feature class — create a fresh editable sketch layer
    const layerId = createNewSketchLayer(fc.identifier);
    fc.linkedLayerId = layerId;
    renderCatalogDatabases();
    return;
  }

  // Select geometry + attributes
  const selectCols = [`"${geomCol}"`, ...attrCols.map(c => `"${c}"`)].join(', ');
  let res;
  try {
    res = gdb.db.exec(`SELECT ${selectCols} FROM "${fc.tableName}"`);
  } catch(e){ alert('Query error on "' + fc.tableName + '": ' + e.message + '\nColumns tried: ' + selectCols); return; }

  // Build GeoJSON features
  const features = [];
  let nullGeom = 0, badGeom = 0;
  for(const row of (res[0]?.values || [])){
    const raw = row[0];
    if(raw == null){ nullGeom++; continue; }
    // Pass raw directly — parseGpkgGeom handles Uint8Array, ArrayBuffer, and plain object
    const geom = parseGpkgGeom(raw);
    if(!geom){ badGeom++; continue; }
    const props = {};
    attrCols.forEach((c, i) => { props[c] = row[i + 1]; });
    features.push({ type:'Feature', geometry: geom, properties: props });
  }

  if(!features.length){
    alert(`"${fc.identifier}" has ${rowCount} row(s) but 0 valid geometries.\n` +
          `Geometry column used: "${geomCol}"\n` +
          `Null geometries: ${nullGeom}, Parse failures: ${badGeom}\n\n` +
          'The file may use a geometry encoding not yet supported.');
    return;
  }

  // Link the newly created map layer back to this feature class — without this,
  // edits made after reopening a GeoPackage have no linked layer to sync into,
  // so the Save icon (and geodatabase-level Save/Export) silently find nothing.
  const layerId = loadGeoJSON(fc.identifier, { type:'FeatureCollection', features });
  fc.linkedLayerId = layerId;
  renderCatalogDatabases();
}

/* ── GPKG WKB Geometry Parser ────────────────────────────────────── */

function parseGpkgGeom(input){
  // Normalise input to a Uint8Array so byteOffset is always 0
  let bytes;
  if(input instanceof Uint8Array){
    bytes = input;
  } else if(input instanceof ArrayBuffer){
    bytes = new Uint8Array(input);
  } else if(ArrayBuffer.isView(input)){
    bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else if(input && typeof input === 'object'){
    bytes = new Uint8Array(Object.values(input));
  } else {
    return null;
  }
  if(bytes.length < 8) return null;
  // Magic: 'G'=0x47 'P'=0x50
  if(bytes[0] !== 0x47 || bytes[1] !== 0x50) return null;
  const flags = bytes[3];
  if((flags >> 4) & 1) return null;                          // empty geometry flag
  const envType  = (flags >> 1) & 7;
  const envBytes = [0, 32, 48, 48, 64][Math.min(envType, 4)];
  const wkbStart = 8 + envBytes;
  if(bytes.length <= wkbStart) return null;
  // parseWkb gets a DataView of just the WKB portion
  return parseWkb(new DataView(bytes.buffer, bytes.byteOffset + wkbStart, bytes.length - wkbStart));
}

function parseWkb(view){
  let off = 0;
  const le = () => view.getUint8(off++) === 1;
  function rU32(l){ const v = view.getUint32(off, l); off += 4; return v; }
  function rF64(l){ const v = view.getFloat64(off, l); off += 8; return v; }

  function readGeom(){
    const litEnd = le();
    let type = rU32(litEnd);
    // EWKB Z/M flags
    const hasZ = !!(type & 0x80000000);
    const hasM = !!(type & 0x40000000);
    type = type & 0x0FFFFFFF;
    // ISO WKB 2.5D types (1001-1007, 2001-2007, 3001-3007)
    if(type > 1000) type = ((type - 1) % 1000) + 1;
    const dim = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);

    function pt(){ const x=rF64(litEnd), y=rF64(litEnd); off += (dim-2)*8; return [x,y]; }
    function ring(){ const n=rU32(litEnd); const c=[]; for(let i=0;i<n;i++) c.push(pt()); return c; }

    switch(type){
      case 1: return { type:'Point',           coordinates: pt() };
      case 2: { const n=rU32(litEnd); const c=[]; for(let i=0;i<n;i++) c.push(pt()); return { type:'LineString', coordinates:c }; }
      case 3: { const n=rU32(litEnd); const r=[]; for(let i=0;i<n;i++) r.push(ring()); return { type:'Polygon', coordinates:r }; }
      case 4: { const n=rU32(litEnd); const c=[]; for(let i=0;i<n;i++){ off+=5; c.push(pt()); } return { type:'MultiPoint', coordinates:c }; }
      case 5: { const n=rU32(litEnd); const ls=[]; for(let i=0;i<n;i++){ off+=5; const m=rU32(litEnd); const c=[]; for(let j=0;j<m;j++) c.push(pt()); ls.push(c); } return { type:'MultiLineString', coordinates:ls }; }
      case 6: { const n=rU32(litEnd); const ps=[]; for(let i=0;i<n;i++){ off+=5; const m=rU32(litEnd); const r=[]; for(let j=0;j<m;j++) r.push(ring()); ps.push(r); } return { type:'MultiPolygon', coordinates:ps }; }
      case 7: { const n=rU32(litEnd); const gs=[]; for(let i=0;i<n;i++) gs.push(readGeom()); return { type:'GeometryCollection', geometries:gs }; }
      default: return null;
    }
  }

  try { return readGeom(); } catch(_){ return null; }
}

/* ── Write SQLite bytes to a FileSystemFileHandle ────────────────── */

// Per-handle write queue — prevents concurrent createWritable() calls on the same file
const _gpkgWriteQueues = new WeakMap();

async function saveGpkgToHandle(db, fileHandle){
  const prev = _gpkgWriteQueues.get(fileHandle) || Promise.resolve();
  const next = prev.then(async () => {
    // Export is called here (not at queue time) so it always captures the latest DB state
    const bytes    = db.export();
    const writable = await fileHandle.createWritable();
    await writable.write(bytes);
    await writable.close();
  });
  // Store the chain; silence rejections on the queued copy so the chain keeps moving
  _gpkgWriteQueues.set(fileHandle, next.catch(e => console.warn('GPKG write error:', e.message)));
  return next; // caller can still .catch() for its own error handling
}

/* ── Create new in-memory GeoPackage ─────────────────────────────── */

async function createNewGeoPackage(name, fileHandle){
  const SQL = await loadSqlJs();
  const db  = new SQL.Database();
  db.exec(`
    PRAGMA application_id = 1196444487;
    PRAGMA user_version   = 10200;
    CREATE TABLE gpkg_spatial_ref_sys(
      srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY,
      organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL,
      definition TEXT NOT NULL, description TEXT);
    INSERT INTO gpkg_spatial_ref_sys VALUES
      ('Undefined cartesian SRS',-1,'NONE',-1,'undefined',''),
      ('Undefined geographic SRS',0,'NONE',0,'undefined',''),
      ('WGS 84 geodetic',4326,'EPSG',4326,
       'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]','');
    CREATE TABLE gpkg_contents(
      table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL,
      identifier TEXT, description TEXT DEFAULT '',
      last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      min_x REAL, min_y REAL, max_x REAL, max_y REAL,
      srs_id INTEGER REFERENCES gpkg_spatial_ref_sys(srs_id));
    CREATE TABLE gpkg_geometry_columns(
      table_name TEXT NOT NULL, column_name TEXT NOT NULL,
      geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL,
      z TINYINT NOT NULL, m TINYINT NOT NULL,
      CONSTRAINT pk_geom_cols PRIMARY KEY(table_name,column_name));
    CREATE TABLE gpkg_extensions(
      table_name TEXT, column_name TEXT, extension_name TEXT NOT NULL,
      definition TEXT NOT NULL, scope TEXT NOT NULL);
  `);

  const dbName = name.toLowerCase().endsWith('.gpkg') ? name : name + '.gpkg';

  // Write the empty file to disk immediately if we have a handle
  if(fileHandle) await saveGpkgToHandle(db, fileHandle);

  gpkgDatabases.push({ name: dbName, db, fileHandle: fileHandle || null,
                        featureClasses: [], collapsed: false });
  renderCatalogDatabases();
  showLeftTab('catalog');
  document.getElementById('left-panel').classList.remove('collapsed');
}

/* ── Add feature class to an existing GeoPackage ─────────────────── */

function createFeatureClassInGpkg(dbIdx, fcName, geomType){
  const gdb = gpkgDatabases[dbIdx];
  const safeTable = fcName.replace(/[^a-zA-Z0-9_]/g, '_');
  const gpkgGeomType = { point:'POINT', line:'LINESTRING', polygon:'POLYGON' }[geomType] || geomType.toUpperCase();

  // Create the feature table
  gdb.db.exec(`
    CREATE TABLE IF NOT EXISTS "${safeTable}" (
      fid INTEGER PRIMARY KEY AUTOINCREMENT,
      geom BLOB,
      name TEXT,
      description TEXT
    );
    INSERT INTO gpkg_contents(table_name,data_type,identifier,srs_id)
      VALUES('${safeTable}','features','${safeTable}',4326);
    INSERT INTO gpkg_geometry_columns(table_name,column_name,geometry_type_name,srs_id,z,m)
      VALUES('${safeTable}','geom','${gpkgGeomType}',4326,0,0);
  `);

  // Create a linked sketch layer on the map
  const typeLabel = { point:'Points', line:'Lines', polygon:'Polygons' }[geomType] || geomType;
  const layerId = createNewSketchLayer(`${fcName} (${typeLabel})`);

  gdb.featureClasses.push({
    tableName:    safeTable,
    identifier:   fcName,
    geomCol:      'geom',
    geomType:     gpkgGeomType,
    count:        0,
    linkedLayerId: layerId
  });

  // Auto-save schema change to disk if file handle exists; otherwise let the
  // user know the layer only lives in-memory until they export it.
  if(gdb.fileHandle){
    saveGpkgToHandle(gdb.db, gdb.fileHandle)
      .then(() => showGpkgToast(`Layer "${fcName}" added & saved to ${gdb.name}`))
      .catch(e => console.warn('saveGpkgToHandle after add FC:', e.message));
  } else {
    showGpkgToast(`Layer "${fcName}" added — use ⬇ Export to save ${gdb.name}`);
  }

  renderCatalogDatabases();
}

/* ── Sync a sketch layer's features into its linked GeoPackage table ─ */

function syncLinkedFeatureClass(layerId){
  scheduleAutosave(); // geometry edits (vertex drag, move) land here even when nothing else re-renders the layer list
  if(!layerId || !layers[layerId]) return false;
  const lyr = layers[layerId];
  let synced = false;

  gpkgDatabases.forEach(gdb => {
    gdb.featureClasses.forEach(fc => {
      if(fc.linkedLayerId !== layerId) return;
      synced = true;

      // 1. Collect all property keys + infer their best SQL type
      const RESERVED = new Set(['fid', 'geom', 'geometry']);
      const keyTypes = new Map(); // key → 'INTEGER'|'REAL'|'TEXT'
      lyr.allFeatures.forEach(l => {
        const props = l.feature?.properties;
        if(!props) return;
        Object.entries(props).forEach(([k, v]) => {
          if(RESERVED.has(k.toLowerCase())) return;
          const cur = keyTypes.get(k) || 'INTEGER';
          if(v === null || v === undefined){ /* keep current type guess */ }
          else if(typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v)))){
            const n = Number(v);
            const needsReal = !Number.isInteger(n);
            if(cur === 'INTEGER' && needsReal) keyTypes.set(k, 'REAL');
            else if(cur === 'INTEGER')          keyTypes.set(k, 'INTEGER');
            else if(cur === 'REAL')             keyTypes.set(k, 'REAL');
          } else {
            keyTypes.set(k, 'TEXT'); // any non-numeric value forces TEXT
          }
          if(!keyTypes.has(k)) keyTypes.set(k, cur);
        });
      });
      // Ensure every key has a type
      lyr.allFeatures.forEach(l => {
        const props = l.feature?.properties || {};
        Object.keys(props).forEach(k => { if(!RESERVED.has(k.toLowerCase()) && !keyTypes.has(k)) keyTypes.set(k, 'TEXT'); });
      });

      // 2. Find existing table columns
      let existingCols = new Map(); // name → type
      try {
        const p = gdb.db.exec(`PRAGMA table_info("${fc.tableName}")`);
        if(p.length) p[0].values.forEach(r => existingCols.set(r[1], r[2]));
      } catch(e){ console.warn('syncLinkedFeatureClass PRAGMA failed:', e.message); return; }

      // 3. Add missing columns with correct type
      keyTypes.forEach((type, key) => {
        if(!existingCols.has(key)){
          try {
            gdb.db.exec(`ALTER TABLE "${fc.tableName}" ADD COLUMN "${key.replace(/"/g,'""')}" ${type}`);
            existingCols.set(key, type);
          } catch(e){ console.warn('ADD COLUMN failed for', key, ':', e.message); }
        }
      });

      // 4. Attribute columns in stable order (skip geom/fid/geometry)
      const attrCols = [...existingCols.keys()].filter(c => !RESERVED.has(c.toLowerCase()) && c !== 'fid');

      // 5. Clear existing rows
      try { gdb.db.exec(`DELETE FROM "${fc.tableName}"`); }
      catch(e){ console.warn('DELETE failed:', e.message); }

      const colList = `"geom",${attrCols.map(c => `"${c.replace(/"/g,'""')}"`).join(',')}`;
      const holders = `?,${attrCols.map(() => '?').join(',')}`;
      let stmt;
      try { stmt = gdb.db.prepare(`INSERT INTO "${fc.tableName}"(${colList}) VALUES(${holders})`); }
      catch(e){ console.warn('prepare failed:', e.message); return; }

      // 6. Insert all features; track bounding box for gpkg_contents
      let count = 0;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      lyr.allFeatures.forEach(l => {
        // Prefer the live Leaflet geometry — a vertex/marker drag updates the
        // layer's latlngs immediately but never touches the cached l.feature copy.
        const geom = (l.toGeoJSON ? l.toGeoJSON().geometry : null) || l.feature?.geometry;
        if(!geom) return;
        if(l.feature) l.feature.geometry = geom; // keep the cache in sync too (exports, heatmaps, etc.)
        const wkb = encodeGpkgWkb(geom);
        if(!wkb) return;

        // Compute bounding box contribution from this geometry
        const coords = flatCoords(geom);
        coords.forEach(([x, y]) => {
          if(x < minX) minX = x; if(x > maxX) maxX = x;
          if(y < minY) minY = y; if(y > maxY) maxY = y;
        });

        const props = l.feature?.properties || {};
        const colType = existingCols;
        const values = [wkb, ...attrCols.map(c => {
          const v = props[c];
          if(v === undefined || v === null) return null;
          const t = colType.get(c) || 'TEXT';
          if(t === 'INTEGER') return parseInt(v, 10) || 0;
          if(t === 'REAL')    return parseFloat(v) || 0;
          return String(v);
        })];

        try { stmt.run(values); count++; }
        catch(e){ console.warn('INSERT failed:', e.message); }
      });
      stmt.free();
      fc.count = count;

      // 7. Update gpkg_contents with real bounding box + last_change timestamp
      if(count > 0 && isFinite(minX)){
        const ts = new Date().toISOString().replace('T', 'T').replace(/\.\d+Z$/, 'Z');
        const tbl = fc.tableName.replace(/'/g,"''");
        try {
          gdb.db.exec(
            `UPDATE gpkg_contents SET min_x=${minX},min_y=${minY},max_x=${maxX},max_y=${maxY},` +
            `last_change='${ts}' WHERE table_name='${tbl}'`
          );
        } catch(e){ console.warn('gpkg_contents update failed:', e.message); }
      }

      if(gdb.fileHandle){
        saveGpkgToHandle(gdb.db, gdb.fileHandle).catch(e =>
          console.warn('saveGpkgToHandle failed:', e.message)
        );
      }
    });
  });

  return synced;
}

/* ── Manually commit a layer's current edits (geometry + attributes) ── */

function commitLayerEdits(id){
  const lyr = layers[id];
  if(!lyr) return;

  // Pull the latest geometry off every feature — this is what actually captures
  // vertex/marker drags made while the Edit tool's per-feature editing is enabled,
  // since dragging never touches the cached feature.geometry on its own.
  lyr.allFeatures.forEach(l => {
    if(l.toGeoJSON && l.feature) l.feature.geometry = l.toGeoJSON().geometry;
  });

  const synced = syncLinkedFeatureClass(id);
  renderLayerList();
  refreshTable();
  showGpkgToast(synced
    ? `"${lyr.name}" saved`
    : `"${lyr.name}" has no linked geodatabase layer — use Catalog ▸ Add Feature Class to persist it`);
}

// Returns all [lng, lat] coordinate pairs from any GeoJSON geometry
function flatCoords(geom){
  if(!geom) return [];
  const c = geom.coordinates;
  switch(geom.type){
    case 'Point':                return [c];
    case 'LineString':           return c;
    case 'MultiPoint':           return c;
    case 'Polygon':              return c.flat(1);
    case 'MultiLineString':      return c.flat(1);
    case 'MultiPolygon':         return c.flat(2);
    case 'GeometryCollection':   return (geom.geometries || []).flatMap(flatCoords);
    default: return [];
  }
}

/* ── Sync + save/export GeoPackage ───────────────────────────────── */

async function exportGpkgFile(dbIdx){
  const gdb = gpkgDatabases[dbIdx];

  // Sync all linked sketch layers into their SQLite tables before export
  gdb.featureClasses.forEach(fc => {
    if(fc.linkedLayerId) syncLinkedFeatureClass(fc.linkedLayerId);
  });

  if(gdb.fileHandle){
    // Save directly to the file on disk
    try {
      await saveGpkgToHandle(gdb.db, gdb.fileHandle);
      showGpkgToast(`Saved — ${gdb.name}`);
    } catch(e){
      alert('Save failed: ' + e.message + '\n\nFalling back to download.');
      gpkgDownload(gdb);
    }
  } else {
    gpkgDownload(gdb);
  }
  renderCatalogDatabases();
}

function gpkgDownload(gdb){
  const bytes = gdb.db.export();
  const blob  = new Blob([bytes], { type: 'application/geopackage+sqlite3' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url; a.download = gdb.name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── Analysis: Export a layer to KML / KMZ ───────────────────────────── */

function gpkgCoordsToKml(coords){
  return coords.map(c => c.slice(0, 2).join(',')).join(' ');
}

function kmlPolygonRings(rings){
  const [outer, ...holes] = rings;
  return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${gpkgCoordsToKml(outer)}</coordinates></LinearRing></outerBoundaryIs>` +
    holes.map(h => `<innerBoundaryIs><LinearRing><coordinates>${gpkgCoordsToKml(h)}</coordinates></LinearRing></innerBoundaryIs>`).join('') +
    `</Polygon>`;
}

function geometryToKml(geom){
  if(!geom) return '';
  switch(geom.type){
    case 'Point':
      return `<Point><coordinates>${geom.coordinates.slice(0, 2).join(',')}</coordinates></Point>`;
    case 'MultiPoint':
      return `<MultiGeometry>${geom.coordinates.map(c => `<Point><coordinates>${c.slice(0,2).join(',')}</coordinates></Point>`).join('')}</MultiGeometry>`;
    case 'LineString':
      return `<LineString><tessellate>1</tessellate><coordinates>${gpkgCoordsToKml(geom.coordinates)}</coordinates></LineString>`;
    case 'MultiLineString':
      return `<MultiGeometry>${geom.coordinates.map(ls => `<LineString><tessellate>1</tessellate><coordinates>${gpkgCoordsToKml(ls)}</coordinates></LineString>`).join('')}</MultiGeometry>`;
    case 'Polygon':
      return kmlPolygonRings(geom.coordinates);
    case 'MultiPolygon':
      return `<MultiGeometry>${geom.coordinates.map(kmlPolygonRings).join('')}</MultiGeometry>`;
    case 'GeometryCollection':
      return `<MultiGeometry>${(geom.geometries || []).map(geometryToKml).join('')}</MultiGeometry>`;
    default:
      return '';
  }
}

function featureToKmlPlacemark(feature, idx){
  const props = feature.properties || {};
  const name = props.name || props.NAME || props.Name || props.id || `Feature ${idx + 1}`;
  const extendedData = Object.keys(props).length
    ? `<ExtendedData>${Object.entries(props).map(([k, v]) =>
        `<Data name="${escapeHtml(k)}"><value>${escapeHtml(v)}</value></Data>`).join('')}</ExtendedData>`
    : '';
  return `<Placemark><name>${escapeHtml(String(name))}</name>${extendedData}${geometryToKml(feature.geometry)}</Placemark>`;
}

function geojsonToKml(features, docName){
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${escapeHtml(docName)}</name>
${features.map((f, i) => featureToKmlPlacemark(f, i)).join('\n')}
</Document>
</kml>`;
}

async function exportLayerToKml(layerName, feats, format){
  const kml = geojsonToKml(feats, layerName || 'layer');
  const safeName = (layerName || 'layer').replace(/[^\w.-]+/g, '_');
  if(format === 'kmz'){
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    zip.file('doc.kml', kml);
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, safeName + '.kmz');
  } else {
    downloadBlob(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), safeName + '.kml');
  }
}

function showGpkgToast(msg){
  let t = document.getElementById('gpkg-toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'gpkg-toast';
    t.className = 'gpkg-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}

/* ── GeoJSON → GPKG WKB encoder ──────────────────────────────────── */

function encodeGpkgWkb(geom){
  if(!geom) return null;
  const bytes = [];

  function u8(v){ bytes.push(v & 0xFF); }
  function u32(v){ bytes.push(v&0xFF,(v>>8)&0xFF,(v>>16)&0xFF,(v>>24)&0xFF); }
  function f64(v){
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, true);
    b.forEach(x => bytes.push(x));
  }
  function wkbHeader(type){ u8(1); u32(type); }
  function pt(c){ f64(c[0]); f64(c[1]); }
  function ring(r){ u32(r.length); r.forEach(pt); }

  function writeGeom(g){
    if(!g) return;
    switch(g.type){
      case 'Point':            wkbHeader(1); pt(g.coordinates); break;
      case 'LineString':       wkbHeader(2); u32(g.coordinates.length); g.coordinates.forEach(pt); break;
      case 'Polygon':          wkbHeader(3); u32(g.coordinates.length); g.coordinates.forEach(ring); break;
      case 'MultiPoint':       wkbHeader(4); u32(g.coordinates.length); g.coordinates.forEach(c =>{ wkbHeader(1); pt(c); }); break;
      case 'MultiLineString':  wkbHeader(5); u32(g.coordinates.length); g.coordinates.forEach(ls =>{ wkbHeader(2); u32(ls.length); ls.forEach(pt); }); break;
      case 'MultiPolygon':     wkbHeader(6); u32(g.coordinates.length); g.coordinates.forEach(poly =>{ wkbHeader(3); u32(poly.length); poly.forEach(ring); }); break;
      case 'GeometryCollection': wkbHeader(7); u32(g.geometries.length); g.geometries.forEach(writeGeom); break;
    }
  }
  writeGeom(geom);

  // GPKG binary header: magic 'GP', version=0, flags=0x01(LE, no envelope, not empty), srs_id=4326(LE)
  const header = [0x47,0x50,0x00,0x01,0xE6,0x10,0x00,0x00];
  return new Uint8Array([...header, ...bytes]);
}

/* ── Modal dialogs for create GDB / create feature class ─────────── */

function showCreateGdbModal(){
  const overlay = document.getElementById('gdb-create-overlay');
  if(overlay){ overlay.classList.add('show'); return; }

  const div = document.createElement('div');
  div.id = 'gdb-create-overlay';
  div.className = 'fc-modal-overlay show';
  div.innerHTML = `
    <div class="fc-modal" style="width:320px;">
      <div class="fc-modal-header">
        <span class="fc-modal-title">New Geodatabase</span>
        <button class="btn" id="gdb-create-close" type="button" style="flex:none;padding:2px 8px;">✕</button>
      </div>
      <div class="fc-modal-body">
        <div><div class="fc-label">Database Name</div>
          <input class="fc-input" id="gdb-create-name" type="text" placeholder="e.g. MyData" autocomplete="off">
        </div>
        <div class="fc-btn-row">
          <button class="btn" id="gdb-create-cancel" type="button">Cancel</button>
          <button class="btn primary" id="gdb-create-ok" type="button">Create</button>
        </div>
        <div id="gdb-create-msg" class="fc-msg"></div>
      </div>
    </div>`;
  document.body.appendChild(div);

  const close = () => div.classList.remove('show');
  div.querySelector('#gdb-create-close').addEventListener('click', close);
  div.querySelector('#gdb-create-cancel').addEventListener('click', close);
  div.addEventListener('click', e => { if(e.target === div) close(); });

  div.querySelector('#gdb-create-ok').addEventListener('click', async () => {
    const name = div.querySelector('#gdb-create-name').value.trim();
    const msg  = div.querySelector('#gdb-create-msg');
    if(!name){ msg.style.color='var(--danger)'; msg.textContent='Enter a name.'; return; }
    msg.textContent = '';

    const dbName = name.toLowerCase().endsWith('.gpkg') ? name : name + '.gpkg';
    let fileHandle = null;
    if(window.showSaveFilePicker){
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: dbName,
          types: [{ description: 'GeoPackage Database', accept: { 'application/geopackage+sqlite3': ['.gpkg'] } }]
        });
      } catch(e){
        if(e.name === 'AbortError') return; // user cancelled the picker — don't create
        // Other errors (e.g. security): fall through with no handle
      }
    }

    try {
      await createNewGeoPackage(name, fileHandle);
      div.querySelector('#gdb-create-name').value = '';
      close();
    } catch(e){
      msg.style.color = 'var(--danger)';
      msg.textContent = 'Error: ' + e.message;
    }
  });

  div.querySelector('#gdb-create-name').addEventListener('keydown', e => {
    if(e.key === 'Enter') div.querySelector('#gdb-create-ok').click();
  });
}

function showCreateFcModal(dbIdx){
  const existing = document.getElementById('gdb-fc-overlay');
  if(existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'gdb-fc-overlay';
  div.className = 'fc-modal-overlay show';
  div.innerHTML = `
    <div class="fc-modal" style="width:320px;">
      <div class="fc-modal-header">
        <span class="fc-modal-title">New Feature Class</span>
        <button class="btn" id="gdb-fc-close" type="button" style="flex:none;padding:2px 8px;">✕</button>
      </div>
      <div class="fc-modal-body">
        <div><div class="fc-label">Feature Class Name</div>
          <input class="fc-input" id="gdb-fc-name" type="text" placeholder="e.g. Cities" autocomplete="off">
        </div>
        <div><div class="fc-label">Geometry Type</div>
          <div class="gdb-geom-btns">
            <button class="gdb-geom-btn active" data-geom="point"   type="button">◉ Point</button>
            <button class="gdb-geom-btn"         data-geom="line"    type="button">〰 Line</button>
            <button class="gdb-geom-btn"         data-geom="polygon" type="button">⬡ Polygon</button>
          </div>
        </div>
        <div class="fc-btn-row">
          <button class="btn" id="gdb-fc-cancel" type="button">Cancel</button>
          <button class="btn primary" id="gdb-fc-ok" type="button">Create &amp; Add to Map</button>
        </div>
        <div id="gdb-fc-msg" class="fc-msg"></div>
      </div>
    </div>`;
  document.body.appendChild(div);

  let selectedGeom = 'point';
  div.querySelectorAll('.gdb-geom-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      div.querySelectorAll('.gdb-geom-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedGeom = btn.dataset.geom;
    });
  });

  const close = () => div.remove();
  div.querySelector('#gdb-fc-close').addEventListener('click', close);
  div.querySelector('#gdb-fc-cancel').addEventListener('click', close);
  div.addEventListener('click', e => { if(e.target === div) close(); });

  div.querySelector('#gdb-fc-ok').addEventListener('click', () => {
    const name = div.querySelector('#gdb-fc-name').value.trim();
    const msg  = div.querySelector('#gdb-fc-msg');
    if(!name){ msg.style.color='var(--danger)'; msg.textContent='Enter a name.'; return; }
    try {
      createFeatureClassInGpkg(dbIdx, name, selectedGeom);
      close();
    } catch(e){
      msg.style.color = 'var(--danger)';
      msg.textContent = 'Error: ' + e.message;
    }
  });

  div.querySelector('#gdb-fc-name').addEventListener('keydown', e => {
    if(e.key === 'Enter') div.querySelector('#gdb-fc-ok').click();
  });
}

/* ── renderCatalogDatabases ──────────────────────────────────────── */

function renderCatalogDatabases(){
  const el = document.getElementById('catalog-databases');
  if(!el) return;
  if(!gpkgDatabases.length){
    el.innerHTML = '<div class="cat-db-empty">No databases connected</div>';
    return;
  }
  el.innerHTML = gpkgDatabases.map((gdb, di) => {
    const icon   = gdb.isArcGis ? '🌐' : '📦';
    // Any non-ArcGIS GeoPackage can keep growing — new or previously-opened —
    // as long as we have its sqlite handle in memory.
    const actions = gdb.isArcGis ? '' : (gdb.fileHandle
      ? `<button class="cat-db-export" data-di="${di}" title="Save to disk" type="button">💾</button>`
      : `<button class="cat-db-export" data-di="${di}" title="Export .gpkg" type="button">⬇</button>`);
    const addFcBtn = (!gdb.isArcGis) ? `
      <div class="cat-db-add-fc-row">
        <button class="cat-db-add-fc" data-di="${di}" type="button">+ Add Feature Class</button>
      </div>` : '';

    return `
    <div class="cat-db-block">
      <div class="cat-db-header" data-di="${di}">
        <span class="cat-db-toggle">${gdb.collapsed ? '▸' : '▾'}</span>
        <span class="cat-db-icon">${icon}</span>
        <span class="cat-db-name" title="${escapeHtml(gdb.name)}">${escapeHtml(gdb.name)}</span>
        ${actions}
        <button class="cat-db-del" data-di="${di}" title="Remove" type="button">&times;</button>
      </div>
      <div class="cat-db-children" ${gdb.collapsed ? 'style="display:none"' : ''}>
        ${gdb.featureClasses.length
          ? gdb.featureClasses.map((fc, fi) => `
            <div class="cat-fc-row">
              <span class="cat-fc-icon">${gpkgGeomIcon(fc.geomType)}</span>
              <span class="cat-fc-name" title="${escapeHtml(fc.identifier)}">${escapeHtml(fc.identifier)}</span>
              <span class="cat-fc-count">${fc.count || ''}</span>
              <button class="cat-fc-add" data-di="${di}" data-fi="${fi}" title="Add to Map" type="button">+</button>
            </div>`).join('')
          : '<div class="cat-db-empty">No layers found</div>'
        }
        ${addFcBtn}
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.cat-db-header').forEach(hdr => {
    hdr.addEventListener('click', e => {
      if(e.target.closest('.cat-db-del') || e.target.closest('.cat-db-export')) return;
      const di = parseInt(hdr.dataset.di);
      gpkgDatabases[di].collapsed = !gpkgDatabases[di].collapsed;
      renderCatalogDatabases();
    });
  });
  el.querySelectorAll('.cat-db-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const di = parseInt(btn.dataset.di);
      if(gpkgDatabases[di].db) gpkgDatabases[di].db.close();
      gpkgDatabases.splice(di, 1);
      renderCatalogDatabases();
    });
  });
  el.querySelectorAll('.cat-db-export').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); exportGpkgFile(parseInt(btn.dataset.di)); });
  });
  el.querySelectorAll('.cat-fc-add').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      addGpkgLayerToMap(parseInt(btn.dataset.di), parseInt(btn.dataset.fi));
    });
  });
  el.querySelectorAll('.cat-db-add-fc').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); showCreateFcModal(parseInt(btn.dataset.di)); });
  });
}

/* ── ArcGIS REST Feature Service connection ───────────────────────── */

function showArcGisConnectModal(){
  const existing = document.getElementById('arcgis-connect-overlay');
  if(existing){ existing.classList.add('show'); return; }

  const div = document.createElement('div');
  div.id = 'arcgis-connect-overlay';
  div.className = 'fc-modal-overlay show';
  div.innerHTML = `
    <div class="fc-modal" style="width:420px;">
      <div class="fc-modal-header">
        <span class="fc-modal-title">Connect to ArcGIS Feature Service</span>
        <button class="btn" id="arcgis-close" type="button" style="flex:none;padding:2px 8px;">✕</button>
      </div>
      <div class="fc-modal-body">
        <div class="fc-label">Feature Service URL</div>
        <input class="fc-input" id="arcgis-url" type="url" autocomplete="off"
          placeholder="https://services.arcgis.com/…/FeatureServer">
        <div style="font-size:11px;color:var(--text-faint);margin:4px 0 10px;">
          Paste a FeatureServer or MapServer URL from ArcGIS Online or ArcGIS Server.
          The service must be publicly accessible (or you must be logged in).
        </div>
        <div class="fc-btn-row">
          <button class="btn" id="arcgis-cancel" type="button">Cancel</button>
          <button class="btn primary" id="arcgis-ok" type="button">Connect</button>
        </div>
        <div id="arcgis-msg" class="fc-msg"></div>
      </div>
    </div>`;
  document.body.appendChild(div);

  const close = () => div.classList.remove('show');
  div.querySelector('#arcgis-close').addEventListener('click', close);
  div.querySelector('#arcgis-cancel').addEventListener('click', close);
  div.addEventListener('click', e => { if(e.target === div) close(); });

  const okBtn = div.querySelector('#arcgis-ok');
  const msgEl = div.querySelector('#arcgis-msg');

  const doConnect = async () => {
    const url = div.querySelector('#arcgis-url').value.trim().replace(/\/+$/, '');
    if(!url){ msgEl.style.color='var(--danger)'; msgEl.textContent='Enter a URL.'; return; }
    msgEl.style.color = 'var(--text-faint)';
    msgEl.textContent = 'Connecting…';
    okBtn.disabled = true;
    try {
      await connectArcGisService(url);
      close();
    } catch(e){
      msgEl.style.color = 'var(--danger)';
      msgEl.textContent = 'Error: ' + e.message;
    } finally {
      okBtn.disabled = false;
    }
  };

  okBtn.addEventListener('click', doConnect);
  div.querySelector('#arcgis-url').addEventListener('keydown', e => { if(e.key === 'Enter') doConnect(); });
}

function esriGeomType(esriType){
  if(!esriType) return 'GEOMETRY';
  const t = esriType.replace('esriGeometry','').toUpperCase();
  if(t === 'POINT' || t === 'MULTIPOINT') return 'POINT';
  if(t === 'POLYLINE') return 'LINESTRING';
  if(t === 'POLYGON') return 'POLYGON';
  return t || 'GEOMETRY';
}

async function connectArcGisService(serviceUrl){
  const metaUrl = serviceUrl + '?f=json';
  const res = await fetch(metaUrl);
  if(!res.ok) throw new Error('HTTP ' + res.status + ' from ' + metaUrl);
  const meta = await res.json();
  if(meta.error) throw new Error(meta.error.message || JSON.stringify(meta.error));

  const featureClasses = [];

  if(Array.isArray(meta.layers) && meta.layers.length){
    // FeatureServer / MapServer with sub-layers
    meta.layers.forEach(l => {
      featureClasses.push({
        tableName:  String(l.id),
        identifier: l.name || String(l.id),
        geomType:   esriGeomType(l.geometryType),
        count:      '',
        arcGisUrl:  serviceUrl + '/' + l.id,
        isArcGis:   true,
        linkedLayerId: null
      });
    });
  } else if(meta.type === 'Feature Layer' || meta.geometryType){
    // Single Feature Layer URL
    featureClasses.push({
      tableName:  '0',
      identifier: meta.name || 'Layer',
      geomType:   esriGeomType(meta.geometryType),
      count:      meta.count ?? '',
      arcGisUrl:  serviceUrl,
      isArcGis:   true,
      linkedLayerId: null
    });
  } else {
    throw new Error('The URL does not point to an ArcGIS Feature Service or Map Service.');
  }

  const displayName = meta.serviceDescription || meta.name ||
    serviceUrl.split('/').slice(-3).join('/');

  gpkgDatabases.push({ name: displayName, db: null, featureClasses, collapsed: false, isArcGis: true });
  renderCatalogDatabases();
  showLeftTab('catalog');
  document.getElementById('left-panel').classList.remove('collapsed');
}

async function addArcGisLayerToMap(di, fi){
  const gdb = gpkgDatabases[di];
  const fc  = gdb.featureClasses[fi];

  // Collect all features with pagination (ArcGIS caps results per request)
  const allFeatures = [];
  let offset = 0;
  const batchSize = 1000;

  // Check if the service supports pagination
  const metaRes = await fetch(fc.arcGisUrl + '?f=json').then(r => r.json()).catch(() => ({}));
  const supportsPagination = metaRes.advancedQueryCapabilities?.supportsPagination
    || metaRes.supportedQueryFormats?.toLowerCase().includes('geojson');

  while(true){
    let queryUrl = fc.arcGisUrl +
      `/query?where=1%3D1&outFields=*&f=geojson&outSR=4326&resultRecordCount=${batchSize}`;
    if(offset > 0) queryUrl += `&resultOffset=${offset}`;

    let data;
    try {
      const r = await fetch(queryUrl);
      if(!r.ok) throw new Error('HTTP ' + r.status);
      data = await r.json();
    } catch(e){
      // If pagination params are rejected, fall back to single request without offset
      if(offset > 0) break;
      throw e;
    }

    if(data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    const batch = data.features || [];
    allFeatures.push(...batch);
    if(batch.length < batchSize || !supportsPagination) break;
    offset += batchSize;
  }

  if(!allFeatures.length){
    alert(`"${fc.identifier}" returned no features.`);
    return;
  }

  loadGeoJSON(fc.identifier, { type: 'FeatureCollection', features: allFeatures });
  fc.count = allFeatures.length;
  renderCatalogDatabases();
}

/* ── Wire up catalog buttons ─────────────────────────────────────── */
(function(){
  const connectBtn = document.getElementById('catalog-add-db');
  const newBtn     = document.getElementById('catalog-new-db');
  const arcGisBtn  = document.getElementById('catalog-esri-btn');
  const fileInput  = document.getElementById('db-file-input');

  if(connectBtn && fileInput){
    connectBtn.addEventListener('click', async () => {
      // Prefer the File System Access API so a re-opened .gpkg keeps a writable
      // handle (lets users keep adding layers to it and save straight back to disk).
      if(window.showOpenFilePicker){
        try {
          const [handle] = await window.showOpenFilePicker({
            types: [{ description: 'GIS data', accept: {
              'application/geopackage+sqlite3': ['.gpkg'],
              'application/zip': ['.zip'],
              'application/octet-stream': ['.shp'],
              'application/geo+json': ['.geojson', '.json']
            }}]
          });
          const file = await handle.getFile();
          openConnectFile(file, handle);
          return;
        } catch(e){
          if(e.name === 'AbortError') return; // user cancelled the picker
          // Other errors: fall back to the classic file input below
        }
      }
      fileInput.click();
    });
    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if(file) openConnectFile(file);
      fileInput.value = '';
    });
  }
  if(newBtn)    newBtn.addEventListener('click', showCreateGdbModal);
  if(arcGisBtn) arcGisBtn.addEventListener('click', showArcGisConnectModal);

  renderCatalogDatabases();
})();

/* ── Import a real ESRI File Geodatabase (.gdb) folder → GeoPackage ───
   Browsers can't read the FileGDB binary format natively, so this loads
   GDAL compiled to WebAssembly (gdal3.js) on first use and runs its
   OpenFileGDB driver + ogr2ogr entirely client-side. Used by the
   "GDB to GPKG" tool under the Analysis tab. ─────────────────────────── */

// File extensions/names that only ever show up inside a real ESRI File
// Geodatabase folder. Matching on these (rather than trusting the exact
// string shape of webkitRelativePath, which can vary by browser/OS) is far
// more robust — it still works even if relative-path prefixing is missing
// or unexpected.
const GDB_INTERNAL_FILE_RE = /\.(gdbtable|gdbtablx|gdbindexes|spx|freelist|horizon|atx)$/i;

async function convertGdbFolderToGpkg(fileList, onProgress){
  const files = Array.from(fileList);

  const gdbFiles = files.filter(f =>
    GDB_INTERNAL_FILE_RE.test(f.name) || f.name.toLowerCase() === 'gdb' || f.name.toLowerCase() === 'timestamps'
  );
  if(!gdbFiles.length){
    // Surface exactly what was picked up so this is diagnosable instead of a
    // dead end — the folder picker can hand back unexpected paths/names
    // depending on browser and OS.
    const sample = files.slice(0, 8).map(f => f.webkitRelativePath || f.name).join(', ');
    throw new Error(
      `That folder doesn't look like an ESRI File Geodatabase — expected files like "a00000001.gdbtable" inside it.\n\n` +
      `Files actually received (${files.length} total): ${sample || '(none)'}` +
      (files.length > 8 ? ', …' : '')
    );
  }

  const firstPath = gdbFiles[0].webkitRelativePath || gdbFiles[0].name;
  const gdbFolderName = firstPath.split(/[\\/]/).find(seg => /\.gdb$/i.test(seg)) || firstPath.split(/[\\/]/)[0] || 'converted.gdb';

  const Gdal = await loadGdalJs(onProgress);

  // Handing GDAL a loose array of files opens each .gdbtable as its OWN
  // separate one-layer dataset instead of recognizing them as one folder —
  // a real File Geodatabase can have dozens of feature classes, so that
  // would silently drop everything except whichever table sorts first.
  // Zipping the files (preserving the .gdb folder name inside the archive)
  // and opening via GDAL's /vsizip/ virtual filesystem makes it see the
  // whole thing as a single directory dataset with every layer intact.
  if(onProgress) onProgress('Packaging geodatabase…');
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  for(const f of gdbFiles){
    zip.file(`${gdbFolderName}/${f.name}`, await f.arrayBuffer());
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipFile = new File([zipBlob], gdbFolderName + '.zip');

  if(onProgress) onProgress('Reading geodatabase…');
  const { datasets, errors } = await Gdal.open(zipFile, [], ['vsizip']);
  if(!datasets || !datasets.length){
    throw new Error((errors && errors.map(e => e.message).filter(Boolean).join('; ')) || 'GDAL could not open this folder as a File Geodatabase.');
  }

  if(onProgress) onProgress('Converting to GeoPackage…');
  const outName = gdbFolderName.replace(/\.gdb$/i, '') + '.gpkg';
  const output = await Gdal.ogr2ogr(datasets[0], ['-f', 'GPKG']);
  const bytes = await Gdal.getFileBytes(output);
  try { await Gdal.close(datasets[0]); } catch(_){}

  downloadBlob(new Blob([bytes], { type: 'application/geopackage+sqlite3' }), outName);
  // Also load the converted result straight into the Catalog so it's immediately usable.
  await openGeoPackage(new File([bytes], outName), null);

  return { gdbFolderName, outName };
}

/* ── Catalog right-click context menu ──────────────────────────────── */
(function(){
  let ctxMenu = null;
  function closeCatalogCtx(){ if(ctxMenu){ ctxMenu.remove(); ctxMenu = null; } }

  const catEl = document.getElementById('catalog-databases');
  if(!catEl) return;

  catEl.addEventListener('contextmenu', e => {
    const header = e.target.closest('.cat-db-header');
    if(!header) return;
    e.preventDefault();
    e.stopPropagation();
    const di  = parseInt(header.dataset.di);
    const gdb = gpkgDatabases[di];
    if(!gdb || gdb.isArcGis) return;

    closeCatalogCtx();
    ctxMenu = document.createElement('div');
    ctxMenu.className = 'cat-ctx-menu';
    ctxMenu.style.cssText = `left:${e.clientX}px;top:${e.clientY}px`;
    ctxMenu.innerHTML = `<div class="cat-ctx-item" data-action="add-fc">+ Add Feature Layer</div>`;
    document.body.appendChild(ctxMenu);

    ctxMenu.querySelector('.cat-ctx-item').addEventListener('mousedown', e => {
      e.stopPropagation(); // prevent the document mousedown from removing the menu first
      closeCatalogCtx();
      showCreateFcModal(di);
    });
    document.addEventListener('mousedown', closeCatalogCtx, { once: true });
  });
})();

/* ── Contact Author (status bar) ──────────────────────────────────────
   No backend on this static site, so submissions go straight to
   Formspree's AJAX endpoint, which emails the form owner directly — no
   email client opens for the visitor. Formspree requires a form to be
   created at https://formspree.io/forms first; replace YOUR_FORM_ID below
   with the ID from that form's endpoint URL (https://formspree.io/f/XXXXXXX). */
const CONTACT_FORM_ENDPOINT = 'https://formspree.io/f/mnjkkjrj';

function showContactAuthorModal(){
  const existing = document.getElementById('contact-author-overlay');
  if(existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'contact-author-overlay';
  div.className = 'fc-modal-overlay show';
  div.innerHTML = `
    <div class="fc-modal" style="width:360px;">
      <div class="fc-modal-header">
        <span class="fc-modal-title">Contact the Author</span>
        <button class="btn" id="contact-author-close" type="button" style="flex:none;padding:2px 8px;">✕</button>
      </div>
      <div class="fc-modal-body">
        <div><div class="fc-label">Your Name</div>
          <input class="fc-input" id="contact-author-name" type="text" placeholder="Jane Doe" autocomplete="name">
        </div>
        <div><div class="fc-label">Your Email <span style="text-transform:none;">(optional, so I can reply)</span></div>
          <input class="fc-input" id="contact-author-email" type="email" placeholder="jane@example.com" autocomplete="email">
        </div>
        <div><div class="fc-label">Message</div>
          <textarea class="fc-input" id="contact-author-message" rows="5" placeholder="What's on your mind?" style="resize:vertical;font-family:var(--ui);"></textarea>
        </div>
        <span class="fc-hint">Sent directly — no email app opens on your end.</span>
        <div class="fc-btn-row">
          <button class="btn" id="contact-author-cancel" type="button">Cancel</button>
          <button class="btn primary" id="contact-author-send" type="button">✉ Send</button>
        </div>
        <div id="contact-author-msg" class="fc-msg"></div>
      </div>
    </div>`;
  document.body.appendChild(div);

  const close = () => div.remove();
  div.querySelector('#contact-author-close').addEventListener('click', close);
  div.querySelector('#contact-author-cancel').addEventListener('click', close);
  div.addEventListener('click', e => { if(e.target === div) close(); });

  div.querySelector('#contact-author-send').addEventListener('click', async () => {
    const name = div.querySelector('#contact-author-name').value.trim();
    const email = div.querySelector('#contact-author-email').value.trim();
    const message = div.querySelector('#contact-author-message').value.trim();
    const msgEl = div.querySelector('#contact-author-msg');
    const sendBtn = div.querySelector('#contact-author-send');

    if(!name || !message){
      msgEl.textContent = 'Please enter your name and a message.';
      msgEl.className = 'fc-msg err';
      return;
    }

    sendBtn.disabled = true;
    msgEl.textContent = 'Sending…';
    msgEl.className = 'fc-msg';

    try{
      const resp = await fetch(CONTACT_FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          name, email: email || '(not provided)', message,
          _subject: `MapLite — message from ${name}`,
        }),
      });
      const data = await resp.json().catch(() => ({}));

      if(!resp.ok){
        const detail = Array.isArray(data.errors) ? data.errors.map(e => e.message).join(', ') : data.error;
        msgEl.textContent = detail || 'Could not deliver the message — please try again.';
        msgEl.className = 'fc-msg err';
        return;
      }

      msgEl.textContent = 'Message sent — thank you!';
      msgEl.className = 'fc-msg ok';
      div.querySelector('#contact-author-name').value = '';
      div.querySelector('#contact-author-email').value = '';
      div.querySelector('#contact-author-message').value = '';
      setTimeout(close, 1800);
    }catch(err){
      msgEl.textContent = 'Could not send — please try again in a moment.';
      msgEl.className = 'fc-msg err';
      console.error('[contact author] send failed:', err);
    }finally{
      sendBtn.disabled = false;
    }
  });
}

document.getElementById('status-contact-author')?.addEventListener('click', showContactAuthorModal);