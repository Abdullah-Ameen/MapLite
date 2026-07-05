// =====================================================================
// PRINT LAYOUT MODULE
// Requires: html2canvas (CDN), jsPDF (window.jspdf), script.js globals
// =====================================================================

const PAGE_SIZES = {
  'letter-land': { w: 1056, h: 816 },
  'letter-port': { w: 816,  h: 1056 },
  'a4-land':     { w: 1123, h: 794 },
  'a4-port':     { w: 794,  h: 1123 },
};

let currentPageSize   = 'letter-land';
let selectedLayoutEl  = null;
let layoutMapSnapshot = null;
let _ltElCounter      = 0;

// Drag state
let _dragEl = null, _dragOffX = 0, _dragOffY = 0;
// Resize state
let _rzEl = null, _rzX0 = 0, _rzY0 = 0, _rzW0 = 0, _rzH0 = 0;

// -----------------------------------------------------------------------
// Open / Close
// -----------------------------------------------------------------------
async function openLayoutView() {
  // Capture map BEFORE overlay covers it
  try {
    const c = await html2canvas(document.getElementById('map'), {
      useCORS: true, allowTaint: true, scale: 1, logging: false,
    });
    layoutMapSnapshot = c.toDataURL('image/jpeg', 0.92);
  } catch(e) {
    layoutMapSnapshot = null;
  }

  document.getElementById('layout-overlay').style.display = 'flex';
  applyPageSize(currentPageSize);
  selectLayoutEl(null);
}

function closeLayoutView() {
  selectLayoutEl(null);
  document.getElementById('layout-overlay').style.display = 'none';
}

// -----------------------------------------------------------------------
// Page size
// -----------------------------------------------------------------------
function applyPageSize(key) {
  const ps = PAGE_SIZES[key];
  if (!ps) return;
  currentPageSize = key;
  const page = document.getElementById('layout-page');
  page.style.width  = ps.w + 'px';
  page.style.height = ps.h + 'px';
  scaleLayoutPage();
}

function scaleLayoutPage() {
  const wrap = document.getElementById('layout-canvas-wrap');
  const page = document.getElementById('layout-page');
  if (!wrap || !page) return;
  const ps      = PAGE_SIZES[currentPageSize];
  const avW     = wrap.clientWidth  - 72;
  const avH     = wrap.clientHeight - 72;
  const scale   = Math.min(avW / ps.w, avH / ps.h, 1);
  const scaledW = ps.w * scale;
  const scaledH = ps.h * scale;
  // transform-origin: top left so the math is straightforward
  page.style.transformOrigin = 'top left';
  page.style.transform       = `scale(${scale})`;
  // Explicit margins to truly center; CSS transform doesn't change layout box size
  page.style.marginLeft      = Math.max(36, (wrap.clientWidth  - scaledW) / 2) + 'px';
  page.style.marginTop       = Math.max(36, (wrap.clientHeight - scaledH) / 2) + 'px';
  page.style.marginBottom    = Math.max(36, (wrap.clientHeight - scaledH) / 2) + 'px';
}

// -----------------------------------------------------------------------
// Add element
// -----------------------------------------------------------------------
function addLayoutEl(type) {
  const page = document.getElementById('layout-page');
  const ps   = PAGE_SIZES[currentPageSize];

  const el = document.createElement('div');
  el.className      = 'layout-el';
  el.dataset.elId   = ++_ltElCounter;
  el.dataset.elType = type;

  const defaults = {
    'map-frame':   { w: Math.round(ps.w * .64), h: Math.round(ps.h * .76), x: 18, y: 54 },
    'legend':      { w: 186, h: 220, x: ps.w - 206, y: 54 },
    'title':       { w: Math.round(ps.w * .58), h: 48, x: Math.round(ps.w * .21), y: 7 },
    'north-arrow': { w: 76, h: 76, x: ps.w - 98, y: ps.h - 98 },
    'scale-bar':   { w: 244, h: 44, x: 18, y: ps.h - 58 },
    'text':        { w: 200, h: 80, x: 38, y: 38 },
  };
  const d = defaults[type] || { w: 200, h: 100, x: 40, y: 40 };
  _setElGeometry(el, d.x, d.y, d.w, d.h);

  el.innerHTML = _buildElInner(type);

  const rh = _makeResizeHandle();
  el.appendChild(rh);

  el.addEventListener('mousedown', _elMouseDown);
  page.appendChild(el);
  selectLayoutEl(el);

  if (type === 'map-frame') _fillMapFrame(el);
  if (type === 'scale-bar') _fillScaleBar(el);
}

function _setElGeometry(el, x, y, w, h) {
  el.style.left   = x + 'px';
  el.style.top    = y + 'px';
  el.style.width  = w + 'px';
  el.style.height = h + 'px';
}

function _makeResizeHandle() {
  const rh = document.createElement('div');
  rh.className = 'el-resize-se';
  rh.addEventListener('mousedown', _rzMouseDown);
  return rh;
}

// -----------------------------------------------------------------------
// Element inner HTML
// -----------------------------------------------------------------------
function _buildElInner(type) {
  switch (type) {
    case 'map-frame':
      return `<div class="el-placeholder">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="1"/>
        <circle cx="8" cy="9" r="2"/><path d="M3 17l5-5 4 3 4-4 5 5"/></svg>
        <span>Capturing map…</span></div>`;

    case 'legend':
      return _buildLegendInner();

    case 'title':
      return `<div class="el-title" contenteditable="true" spellcheck="false">Map Title</div>`;

    case 'north-arrow':
      return `<div class="el-north-arrow">
        <svg viewBox="0 0 80 90" xmlns="http://www.w3.org/2000/svg">
          <text x="40" y="12" text-anchor="middle" font-size="14" font-weight="bold"
                font-family="Georgia,serif" fill="#1a1a1a">N</text>
          <polygon points="40,18 46,56 40,50 34,56" fill="#1a1a1a"/>
          <polygon points="40,81 46,54 40,60 34,54" fill="#999"/>
          <circle cx="40" cy="55" r="5.5" fill="#fff" stroke="#1a1a1a" stroke-width="1.5"/>
          <circle cx="40" cy="81" r="2.5" fill="#aaa"/>
        </svg></div>`;

    case 'scale-bar':
      return `<div class="el-scale-bar-wrap">
        <div class="el-scale-bar-inner">
          <div class="el-scale-segs"></div>
          <div class="el-scale-lbl">—</div>
        </div></div>`;

    case 'text':
      return `<div class="el-text" contenteditable="true" spellcheck="false">Click to add text</div>`;

    default:
      return '';
  }
}

// -----------------------------------------------------------------------
// Map Frame
// -----------------------------------------------------------------------
function _fillMapFrame(el) {
  if (layoutMapSnapshot) {
    _setMapImg(el, layoutMapSnapshot);
  }
  // else placeholder stays; Refresh button will capture with overlay hidden
}

function _setMapImg(el, src) {
  const img = document.createElement('img');
  img.src = src;
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;position:absolute;inset:0;';

  el.innerHTML = '';
  el.appendChild(img);

  // Refresh button
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'el-map-refresh';
  btn.title = 'Refresh map capture';
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor"
    fill="none" stroke-width="2"><path d="M4 12a8 8 0 018-8 8 8 0 015.7 2.4L20 3v6h-6
    l2.5-2.5A6 6 0 106 12"/></svg>`;
  btn.addEventListener('click', e => { e.stopPropagation(); _refreshMapFrame(el); });

  el.appendChild(btn);
  el.appendChild(_makeResizeHandle());
}

async function _refreshMapFrame(frameEl) {
  const overlay = document.getElementById('layout-overlay');
  overlay.style.visibility = 'hidden';
  // Two animation frames so browser actually repaints without overlay
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    const c = await html2canvas(document.getElementById('map'), {
      useCORS: true, allowTaint: true, scale: 1, logging: false,
    });
    layoutMapSnapshot = c.toDataURL('image/jpeg', 0.92);
    _setMapImg(frameEl, layoutMapSnapshot);
  } catch(e) { console.warn('Map capture failed:', e); }
  overlay.style.visibility = '';
}

// -----------------------------------------------------------------------
// Legend
// -----------------------------------------------------------------------
function _buildLegendInner() {
  const lyrList = typeof layers !== 'undefined'
    ? Object.values(layers).filter(l => l.visible)
    : [];

  if (!lyrList.length) {
    return `<div class="el-legend"><div class="el-legend-title">Legend</div>
      <p style="color:#999;font-size:11px;margin:8px 0">No visible layers</p></div>`;
  }

  const esc = typeof escapeHtml === 'function' ? escapeHtml : s => String(s);
  let rows = '';

  lyrList.forEach(lyr => {
    if (lyr.symbologyConfig?.entries?.length) {
      rows += `<div class="el-legend-layer-name">${esc(lyr.name)}</div>`;
      lyr.symbologyConfig.entries.forEach(e => {
        const radius = lyr.type === 'point' ? '50%' : '2px';
        rows += `<div class="el-legend-row">
          <div class="el-legend-swatch" style="background:${e.color};border-radius:${radius}"></div>
          <span>${esc(String(e.value ?? e.label ?? ''))}</span></div>`;
      });
    } else {
      const col    = lyr.color || '#3da7e0';
      const radius = lyr.type === 'point' ? '50%' : '2px';
      rows += `<div class="el-legend-row">
        <div class="el-legend-swatch" style="background:${col};border-radius:${radius}"></div>
        <span>${esc(lyr.name)}</span></div>`;
    }
  });

  return `<div class="el-legend"><div class="el-legend-title">Legend</div>${rows}</div>`;
}

// -----------------------------------------------------------------------
// Scale bar
// -----------------------------------------------------------------------
function _fillScaleBar(el) {
  try {
    const center = map.getCenter();
    const zoom   = map.getZoom();
    const mPerPx = (156543.03392 * Math.cos(center.lat * Math.PI / 180)) / Math.pow(2, zoom);
    const { value, unit, px } = _niceScale(mPerPx * 200, mPerPx);

    const segsEl = el.querySelector('.el-scale-segs');
    const lblEl  = el.querySelector('.el-scale-lbl');

    if (segsEl) {
      segsEl.style.width = px + 'px';
      segsEl.innerHTML = '';
      for (let i = 0; i < 4; i++) {
        const s = document.createElement('div');
        s.className = 'el-scale-seg';
        s.style.cssText = `width:${px/4}px;height:100%;background:${i%2===0?'#111':'#fff'};`;
        segsEl.appendChild(s);
      }
    }
    if (lblEl) lblEl.textContent = `0    ${value/2} ${unit}    ${value} ${unit}`;
  } catch(e) { /* map may not be ready */ }
}

function _niceScale(distM, mPerPx) {
  const nice = [1,2,5,10,20,50,100,200,500,1000,2000,5000,10000,20000,50000,100000,500000,1000000];
  let unit = 'm', div = 1;
  if (distM > 900) { unit = 'km'; div = 1000; }
  const du  = distM / div;
  const val = nice.find(v => v >= du * 0.55) || nice[nice.length - 1];
  const px  = Math.round((val * div) / mPerPx);
  return { value: val, unit, px };
}

// -----------------------------------------------------------------------
// Drag
// -----------------------------------------------------------------------
function _getPageScale() {
  const t = document.getElementById('layout-page').style.transform;
  const m = t.match(/scale\(([^)]+)\)/);
  return m ? parseFloat(m[1]) : 1;
}

function _elMouseDown(e) {
  if (e.target.classList.contains('el-resize-se'))   return;
  if (e.target.classList.contains('el-map-refresh'))  return;
  if (e.target.getAttribute('contenteditable') === 'true') return;
  const el    = e.currentTarget;
  const scale = _getPageScale();
  _dragEl   = el;
  _dragOffX = (e.clientX - el.getBoundingClientRect().left) / scale;
  _dragOffY = (e.clientY - el.getBoundingClientRect().top)  / scale;
  selectLayoutEl(el);
  e.preventDefault();
}

// -----------------------------------------------------------------------
// Resize
// -----------------------------------------------------------------------
function _rzMouseDown(e) {
  e.stopPropagation();
  _rzEl = e.currentTarget.parentElement;
  _rzX0 = e.clientX;
  _rzY0 = e.clientY;
  _rzW0 = parseInt(_rzEl.style.width)  || _rzEl.offsetWidth;
  _rzH0 = parseInt(_rzEl.style.height) || _rzEl.offsetHeight;
  selectLayoutEl(_rzEl);
  e.preventDefault();
}

document.addEventListener('mousemove', e => {
  if (_dragEl) {
    const page  = document.getElementById('layout-page');
    const rect  = page.getBoundingClientRect();
    const scale = _getPageScale();
    const ps    = PAGE_SIZES[currentPageSize];
    const elW   = parseInt(_dragEl.style.width)  || 60;
    const elH   = parseInt(_dragEl.style.height) || 30;
    let nx = (e.clientX - rect.left) / scale - _dragOffX;
    let ny = (e.clientY - rect.top)  / scale - _dragOffY;
    nx = Math.max(0, Math.min(nx, ps.w - elW));
    ny = Math.max(0, Math.min(ny, ps.h - elH));
    _dragEl.style.left = nx + 'px';
    _dragEl.style.top  = ny + 'px';
    _syncPropsXY();
  }
  if (_rzEl) {
    const scale = _getPageScale();
    _rzEl.style.width  = Math.max(50,  _rzW0 + (e.clientX - _rzX0) / scale) + 'px';
    _rzEl.style.height = Math.max(28,  _rzH0 + (e.clientY - _rzY0) / scale) + 'px';
    _syncPropsXY();
  }
});

document.addEventListener('mouseup', () => { _dragEl = null; _rzEl = null; });

// -----------------------------------------------------------------------
// Select
// -----------------------------------------------------------------------
function selectLayoutEl(el) {
  // Remove any existing delete button
  document.querySelectorAll('.el-del-btn').forEach(b => b.remove());

  if (selectedLayoutEl) selectedLayoutEl.classList.remove('selected');
  selectedLayoutEl = el;

  if (el) {
    el.classList.add('selected');
    const delBtn = document.createElement('button');
    delBtn.type      = 'button';
    delBtn.className = 'el-del-btn';
    delBtn.title     = 'Delete element';
    delBtn.textContent = '✕';
    delBtn.addEventListener('mousedown', e => e.stopPropagation()); // don't trigger drag
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      el.remove();
      selectLayoutEl(null);
    });
    el.appendChild(delBtn);
  }

  updatePropsPanel(el);
}

// -----------------------------------------------------------------------
// Properties panel
// -----------------------------------------------------------------------
function updatePropsPanel(el) {
  const body = document.getElementById('layout-props-body');
  if (!body) return;

  if (!el) {
    body.innerHTML = '<p class="lp-empty">Click an element to select it and edit properties here.</p>';
    return;
  }

  const type = el.dataset.elType;
  const x = Math.round(parseFloat(el.style.left))   || 0;
  const y = Math.round(parseFloat(el.style.top))    || 0;
  const w = Math.round(parseFloat(el.style.width))  || el.offsetWidth;
  const h = Math.round(parseFloat(el.style.height)) || el.offsetHeight;

  const bStyle = el.dataset.borderStyle || 'none';
  const bColor = el.dataset.borderColor || '#000000';

  // Type-specific section
  let extra = '';

  if (type === 'title' || type === 'text') {
    const inner = el.querySelector('[contenteditable]');
    const fc = inner?.style.color      || (type === 'title' ? '#1a1a1a' : '#333333');
    const fs = parseInt(inner?.style.fontSize) || (type === 'title' ? 28 : 13);
    const fw = inner?.style.fontWeight === '700' || inner?.style.fontWeight === 'bold';
    const fi = inner?.style.fontStyle  === 'italic';
    const ta = inner?.style.textAlign  || 'center';
    const ff = inner?.style.fontFamily || (type === 'title' ? 'Georgia,serif' : "'Segoe UI',sans-serif");

    const ffOpts = [
      ['Georgia,serif',               'Georgia'],
      ["'Times New Roman',serif",     'Times New Roman'],
      ['Arial,sans-serif',            'Arial'],
      ["'Segoe UI',sans-serif",       'Segoe UI'],
      ["'Courier New',monospace",     'Courier New'],
    ].map(([v, l]) => `<option value="${v}" ${ff.includes(v.split(',')[0].replace(/'/g,''))?'selected':''}>${l}</option>`).join('');

    extra = `
      <div class="lp-section">Text</div>
      <div class="lp-row"><label>Font</label>
        <select class="lp-sel" id="lp-ff">${ffOpts}</select></div>
      <div class="lp-row"><label>Size / Color</label>
        <input type="number" class="lp-num" id="lp-fs" value="${fs}" min="6" max="200" style="width:52px;flex:0 0 52px">
        <input type="color" class="lp-color" id="lp-fc" value="${fc}">
      </div>
      <div class="lp-row lp-btn-row" style="gap:4px">
        <button type="button" class="lp-toggle ${fw?'active':''}" id="lp-bold" title="Bold"><b>B</b></button>
        <button type="button" class="lp-toggle ${fi?'active':''}" id="lp-italic" title="Italic"><i>I</i></button>
        <span style="flex:1"></span>
        <button type="button" class="lp-toggle ${ta==='left'?'active':''}"   id="lp-al" title="Left align"  style="font-size:10px">◧</button>
        <button type="button" class="lp-toggle ${ta==='center'?'active':''}" id="lp-ac" title="Center"      style="font-size:10px">▣</button>
        <button type="button" class="lp-toggle ${ta==='right'?'active':''}"  id="lp-ar" title="Right align" style="font-size:10px">◨</button>
      </div>`;
  }

  if (type === 'legend') {
    extra = `<div class="lp-section">Legend</div>
      <button type="button" class="lp-action-btn" id="lp-legend-refresh">↺  Refresh from Layers</button>`;
  }

  if (type === 'map-frame') {
    extra = `<div class="lp-section">Map</div>
      <button type="button" class="lp-action-btn" id="lp-map-refresh">↺  Refresh Map Capture</button>`;
  }

  if (type === 'scale-bar') {
    extra = `<div class="lp-section">Scale Bar</div>
      <button type="button" class="lp-action-btn" id="lp-scale-refresh">↺  Recalculate Scale</button>`;
  }

  body.innerHTML = `
    <div class="lp-section">Position &amp; Size</div>
    <div class="lp-row"><label>X (px)</label><input type="number" class="lp-num" id="lp-x" value="${x}"></div>
    <div class="lp-row"><label>Y (px)</label><input type="number" class="lp-num" id="lp-y" value="${y}"></div>
    <div class="lp-row"><label>W (px)</label><input type="number" class="lp-num" id="lp-w" value="${w}"></div>
    <div class="lp-row"><label>H (px)</label><input type="number" class="lp-num" id="lp-h" value="${h}"></div>
    <div class="lp-section">Border</div>
    <div class="lp-row"><label>Style</label>
      <select class="lp-sel" id="lp-border">
        <option value="none"   ${bStyle==='none'  ?'selected':''}>None</option>
        <option value="thin"   ${bStyle==='thin'  ?'selected':''}>Hairline</option>
        <option value="normal" ${bStyle==='normal'?'selected':''}>1 pt</option>
        <option value="thick"  ${bStyle==='thick' ?'selected':''}>2 pt</option>
      </select>
      <input type="color" class="lp-color" id="lp-bcolor" value="${bColor}">
    </div>
    ${extra}
    <button type="button" class="lp-delete-btn" id="lp-delete">✕  Remove Element</button>`;

  // Geometry
  body.querySelectorAll('#lp-x,#lp-y,#lp-w,#lp-h').forEach(inp => {
    inp.addEventListener('input', () => {
      if (!selectedLayoutEl) return;
      _setElGeometry(
        selectedLayoutEl,
        parseInt(body.querySelector('#lp-x').value) || 0,
        parseInt(body.querySelector('#lp-y').value) || 0,
        Math.max(30, parseInt(body.querySelector('#lp-w').value) || 60),
        Math.max(20, parseInt(body.querySelector('#lp-h').value) || 30),
      );
    });
  });

  // Border
  const _applyBorder = () => {
    if (!selectedLayoutEl) return;
    const bs = body.querySelector('#lp-border')?.value || 'none';
    const bc = body.querySelector('#lp-bcolor')?.value || '#000';
    selectedLayoutEl.dataset.borderStyle = bs;
    selectedLayoutEl.dataset.borderColor = bc;
    const w = { none: 0, thin: 0.5, normal: 1, thick: 2 }[bs] || 0;
    selectedLayoutEl.style.border = bs === 'none' ? 'none' : `${w}px solid ${bc}`;
  };
  body.querySelector('#lp-border')?.addEventListener('change', _applyBorder);
  body.querySelector('#lp-bcolor')?.addEventListener('input',  _applyBorder);

  // Text styling
  if (type === 'title' || type === 'text') {
    const _applyText = () => {
      const inner = selectedLayoutEl?.querySelector('[contenteditable]');
      if (!inner) return;
      inner.style.color      = body.querySelector('#lp-fc')?.value    || '#000';
      inner.style.fontSize   = (body.querySelector('#lp-fs')?.value || 14) + 'px';
      inner.style.fontFamily = body.querySelector('#lp-ff')?.value    || '';
      inner.style.fontWeight = body.querySelector('#lp-bold')?.classList.contains('active')   ? '700'    : '400';
      inner.style.fontStyle  = body.querySelector('#lp-italic')?.classList.contains('active') ? 'italic' : 'normal';
      const active = ['#lp-al','#lp-ac','#lp-ar'].find(id => body.querySelector(id)?.classList.contains('active'));
      inner.style.textAlign  = active === '#lp-al' ? 'left' : active === '#lp-ar' ? 'right' : 'center';
    };
    ['#lp-fc','#lp-fs','#lp-ff'].forEach(id => {
      body.querySelector(id)?.addEventListener('input',  _applyText);
      body.querySelector(id)?.addEventListener('change', _applyText);
    });
    ['#lp-bold','#lp-italic'].forEach(id => {
      body.querySelector(id)?.addEventListener('click', () => {
        body.querySelector(id).classList.toggle('active'); _applyText();
      });
    });
    ['#lp-al','#lp-ac','#lp-ar'].forEach(id => {
      body.querySelector(id)?.addEventListener('click', () => {
        ['#lp-al','#lp-ac','#lp-ar'].forEach(b => body.querySelector(b)?.classList.remove('active'));
        body.querySelector(id)?.classList.add('active');
        _applyText();
      });
    });
  }

  // Legend refresh
  body.querySelector('#lp-legend-refresh')?.addEventListener('click', () => {
    if (!selectedLayoutEl) return;
    selectedLayoutEl.innerHTML = _buildLegendInner();
    selectedLayoutEl.appendChild(_makeResizeHandle());
  });

  // Map refresh
  body.querySelector('#lp-map-refresh')?.addEventListener('click', () => {
    if (selectedLayoutEl) _refreshMapFrame(selectedLayoutEl);
  });

  // Scale bar recalculate
  body.querySelector('#lp-scale-refresh')?.addEventListener('click', () => {
    if (selectedLayoutEl) _fillScaleBar(selectedLayoutEl);
  });

  // Delete
  body.querySelector('#lp-delete')?.addEventListener('click', () => {
    selectedLayoutEl?.remove();
    selectLayoutEl(null);
  });
}

function _syncPropsXY() {
  const body = document.getElementById('layout-props-body');
  if (!body || !selectedLayoutEl) return;
  const map = { 'lp-x':'left','lp-y':'top','lp-w':'width','lp-h':'height' };
  Object.entries(map).forEach(([id, prop]) => {
    const inp = body.querySelector('#' + id);
    if (inp) inp.value = Math.round(parseFloat(selectedLayoutEl.style[prop])) || 0;
  });
}

// -----------------------------------------------------------------------
// Export helpers
// -----------------------------------------------------------------------
async function _prepareExport() {
  const page = document.getElementById('layout-page');

  // Hide selection chrome
  const prev = selectedLayoutEl;
  if (selectedLayoutEl) selectedLayoutEl.classList.remove('selected');
  page.querySelectorAll('.el-resize-se,.el-map-refresh,.el-del-btn').forEach(e => e.style.visibility = 'hidden');

  // Temporarily remove CSS transform so html2canvas renders at true pixel size
  const savedTransform = page.style.transform;
  const savedMarginTop = page.style.marginTop;
  page.style.transform = 'none';
  page.style.marginTop = '0';

  let canvas;
  try {
    canvas = await html2canvas(page, {
      scale: 2.5,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
  } finally {
    page.style.transform = savedTransform;
    page.style.marginTop = savedMarginTop;
    page.querySelectorAll('.el-resize-se,.el-map-refresh,.el-del-btn').forEach(e => e.style.visibility = '');
    if (prev) prev.classList.add('selected');
  }
  return canvas;
}

async function exportLayoutPNG() {
  try {
    const btn = document.getElementById('lt-export-png');
    const orig = btn.textContent;
    btn.textContent = 'Exporting…'; btn.disabled = true;
    const canvas = await _prepareExport();
    const a = document.createElement('a');
    a.download = 'map-layout.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
    btn.textContent = orig; btn.disabled = false;
  } catch(e) { alert('PNG export failed: ' + e.message); }
}

async function exportLayoutPDF() {
  if (!window.jspdf) { alert('jsPDF library not loaded — check CDN connectivity.'); return; }
  try {
    const btn = document.getElementById('lt-export-pdf');
    const orig = btn.textContent;
    btn.textContent = 'Exporting…'; btn.disabled = true;

    const canvas  = await _prepareExport();
    const { jsPDF } = window.jspdf;
    const ps  = PAGE_SIZES[currentPageSize];
    const fmt = (ps.w === 1056 || ps.w === 816) ? 'letter' : 'a4';
    const ori = ps.w > ps.h ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation: ori, unit: 'pt', format: fmt });
    const pw  = doc.internal.pageSize.getWidth();
    const ph  = doc.internal.pageSize.getHeight();
    doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pw, ph);
    doc.save('map-layout.pdf');

    btn.textContent = orig; btn.disabled = false;
  } catch(e) { alert('PDF export failed: ' + e.message); }
}

// -----------------------------------------------------------------------
// Init
// -----------------------------------------------------------------------
(function initLayout() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bindLayoutUI);
  } else {
    _bindLayoutUI();
  }
})();

function _bindLayoutUI() {
  const overlay = document.getElementById('layout-overlay');
  if (!overlay) return;

  // Click blank page → deselect
  document.getElementById('layout-page')?.addEventListener('mousedown', e => {
    if (e.target.id === 'layout-page') selectLayoutEl(null);
  });

  document.getElementById('lt-close')?.addEventListener('click', closeLayoutView);
  document.getElementById('lt-page-size')?.addEventListener('change', e => applyPageSize(e.target.value));
  document.getElementById('lt-export-png')?.addEventListener('click', exportLayoutPNG);
  document.getElementById('lt-export-pdf')?.addEventListener('click', exportLayoutPDF);

  overlay.querySelectorAll('[data-lt-add]').forEach(btn => {
    btn.addEventListener('click', () => addLayoutEl(btn.dataset.ltAdd));
  });

  // Keyboard: Delete/Backspace removes selected element; Escape deselects
  document.addEventListener('keydown', e => {
    if (overlay.style.display !== 'flex') return;
    if (document.activeElement?.getAttribute('contenteditable') === 'true') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLayoutEl) {
      selectedLayoutEl.remove();
      selectLayoutEl(null);
      e.preventDefault();
    }
    if (e.key === 'Escape') selectLayoutEl(null);
  });

  window.addEventListener('resize', scaleLayoutPage);
}
