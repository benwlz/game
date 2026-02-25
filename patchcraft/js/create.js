/**
 * PatchCraft — Creation Editor (v2)
 * mm-based coordinates, user-controlled zoom, compact layout.
 */
(() => {
  renderNav('create');

  // ---- State ----
  let currentStep = 1;
  let selectedCarrier = null;
  let currentSide = 'front';
  let frontPatches = [];   // { id, patchId, x(mm), y(mm), rotation(deg) }
  let backPatches  = [];
  let selectedPlacedId = null;
  let undoStack = [];
  let patchIdCounter = 0;

  // Zoom: scale = px per mm
  let scale = 2;
  const SCALE_MIN = 0.5;
  const SCALE_MAX = 6;
  const THUMB_SCALE = 2;  // fixed scale for thumbnails

  // ---- DOM refs ----
  const stepsBar      = document.getElementById('steps-bar');
  const sidebar1      = document.getElementById('sidebar-step1');
  const sidebar2      = document.getElementById('sidebar-step2');
  const sidebar3      = document.getElementById('sidebar-step3');
  const main1         = document.getElementById('main-step1');
  const main2         = document.getElementById('main-step2');
  const main3         = document.getElementById('main-step3');
  const carrierList   = document.getElementById('carrier-list');
  const patchList     = document.getElementById('patch-list');
  const catFilters    = document.getElementById('cat-filters');
  const colorFilters  = document.getElementById('color-filters');
  const canvasViewport = document.getElementById('canvas-viewport');
  const canvasArea    = document.getElementById('canvas-area');
  const carrierImg    = document.getElementById('carrier-img');
  const patchZone     = document.getElementById('patch-zone');
  const priceBar      = document.getElementById('price-bar');
  const priceTotal    = document.getElementById('price-total');
  const btnFront      = document.getElementById('btn-front');
  const btnBack       = document.getElementById('btn-back');
  const btnPrev       = document.getElementById('btn-prev');
  const btnNext       = document.getElementById('btn-next');
  const btnClearSide  = document.getElementById('btn-clear-side');
  const btnUndo       = document.getElementById('btn-undo');
  const zoomSlider    = document.getElementById('zoom-slider');
  const zoomPct       = document.getElementById('zoom-pct');
  const btnZoomIn     = document.getElementById('btn-zoom-in');
  const btnZoomOut    = document.getElementById('btn-zoom-out');
  const btnZoomFit    = document.getElementById('btn-zoom-fit');

  // ================
  // Zoom
  // ================
  function calcFitScale() {
    if (!selectedCarrier || !canvasViewport) return 2;
    const vw = canvasViewport.clientWidth - 32;
    const vh = canvasViewport.clientHeight - 32;
    const sw = vw / selectedCarrier.realWidth;
    const sh = vh / selectedCarrier.realHeight;
    return Math.min(sw, sh, SCALE_MAX);
  }

  function setScale(s, preserveCenter) {
    s = Math.max(SCALE_MIN, Math.min(SCALE_MAX, s));
    const oldScale = scale;
    scale = s;
    const pct = Math.round((scale / calcFitScale()) * 100);
    zoomPct.textContent = pct + '%';
    zoomSlider.value = pct;
    applyScale(oldScale, preserveCenter);
  }

  function applyScale(oldScale, preserveCenter) {
    if (!selectedCarrier) return;
    const c = selectedCarrier;
    const w = c.realWidth * scale;
    const h = c.realHeight * scale;
    canvasArea.style.width = w + 'px';
    canvasArea.style.height = h + 'px';

    // Patch zone
    const area = currentSide === 'front' ? c.patchArea : c.backPatchArea;
    patchZone.style.left   = (area.x * scale) + 'px';
    patchZone.style.top    = (area.y * scale) + 'px';
    patchZone.style.width  = (area.w * scale) + 'px';
    patchZone.style.height = (area.h * scale) + 'px';

    // Scrollable when zoomed beyond viewport
    const vw = canvasViewport.clientWidth;
    const vh = canvasViewport.clientHeight;
    canvasViewport.classList.toggle('scrollable', w > vw - 32 || h > vh - 32);

    renderPlacedPatches();
  }

  function zoomFit() {
    const fitS = calcFitScale();
    setScale(fitS);
  }

  // Zoom controls
  btnZoomIn.addEventListener('click', () => setScale(scale * 1.2, true));
  btnZoomOut.addEventListener('click', () => setScale(scale / 1.2, true));
  btnZoomFit.addEventListener('click', zoomFit);

  zoomSlider.addEventListener('input', () => {
    const fitS = calcFitScale();
    const pct = parseInt(zoomSlider.value);
    setScale(fitS * pct / 100, true);
  });

  // Mouse wheel zoom on canvas
  canvasViewport?.addEventListener('wheel', e => {
    if (!selectedCarrier || currentStep !== 2) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    setScale(scale * factor, true);
  }, { passive: false });

  // ================
  // Step Navigation
  // ================
  function goToStep(step) {
    currentStep = step;
    stepsBar.querySelectorAll('.step-item').forEach(el => {
      const s = +el.dataset.step;
      el.classList.toggle('active', s === step);
      el.classList.toggle('done', s < step);
    });
    sidebar1.classList.toggle('hidden', step !== 1);
    sidebar2.classList.toggle('hidden', step !== 2);
    sidebar3.classList.toggle('hidden', step !== 3);
    main1.classList.toggle('hidden', step !== 1);
    main2.classList.toggle('hidden', step !== 2);
    main3.classList.toggle('hidden', step !== 3);
    priceBar.style.display = step >= 1 && selectedCarrier ? '' : 'none';
    btnPrev.style.display = step > 1 ? '' : 'none';
    btnNext.textContent = step === 3 ? 'Add to Cart' : 'Next Step';

    if (step === 2) setupEditor();
    if (step === 3) buildSummary();
    updatePrice();
  }

  btnNext.addEventListener('click', () => {
    if (currentStep === 1) {
      if (!selectedCarrier) return showToast('Please select a carrier first', 'error');
      goToStep(2);
    } else if (currentStep === 2) {
      if (frontPatches.length === 0 && backPatches.length === 0)
        return showToast('Add at least one patch', 'error');
      goToStep(3);
    } else if (currentStep === 3) {
      addToCart();
    }
  });
  btnPrev.addEventListener('click', () => { if (currentStep > 1) goToStep(currentStep - 1); });

  // ================
  // Step 1: Choose Carrier
  // ================
  function renderCarriers() {
    const carriers = DB.Carriers.getActive();
    carrierList.innerHTML = '';
    carriers.forEach(c => {
      const el = document.createElement('div');
      el.className = 'carrier-option' + (selectedCarrier?.id === c.id ? ' selected' : '');
      el.innerHTML = `
        <img src="${c.frontImage}" alt="${c.name}">
        <div class="info">
          <div class="co-name">${c.name}</div>
          <div class="co-meta">${c.nameZh || ''} · ${c.realWidth}×${c.realHeight}mm</div>
        </div>
        <div class="co-price">${fmtPrice(c.price)}</div>`;
      el.addEventListener('click', () => {
        selectedCarrier = c;
        frontPatches = []; backPatches = []; undoStack = [];
        renderCarriers();
        main1.innerHTML = `<div style="text-align:center">
          <img src="${c.frontImage}" style="max-height:260px;border-radius:var(--radius);margin-bottom:12px" alt="${c.name}">
          <h3>${c.name}</h3>
          <p style="color:var(--text-light);font-size:0.9rem">${c.realWidth}×${c.realHeight}mm · ${fmtPrice(c.price)}</p>
        </div>`;
        priceBar.style.display = '';
        updatePrice();
      });
      carrierList.appendChild(el);
    });
  }
  renderCarriers();

  // ================
  // Step 2: Editor
  // ================
  function setupEditor() {
    if (!selectedCarrier) return;
    carrierImg.src = currentSide === 'front' ? selectedCarrier.frontImage : selectedCarrier.backImage;
    // Initial fit
    requestAnimationFrame(() => {
      zoomFit();
      renderPatchSidebar();
      updateSideToggle();
    });
  }

  function updateSideToggle() {
    btnFront.classList.toggle('active', currentSide === 'front');
    btnBack.classList.toggle('active', currentSide === 'back');
  }
  btnFront.addEventListener('click', () => { currentSide = 'front'; selectedPlacedId = null; setupEditor(); });
  btnBack.addEventListener('click', () => { currentSide = 'back'; selectedPlacedId = null; setupEditor(); });

  btnClearSide.addEventListener('click', () => {
    saveUndo();
    if (currentSide === 'front') frontPatches = []; else backPatches = [];
    renderPlacedPatches(); updatePrice();
    showToast('Cleared ' + currentSide + ' side');
  });

  btnUndo.addEventListener('click', () => {
    if (undoStack.length === 0) return;
    const state = undoStack.pop();
    frontPatches = state.front; backPatches = state.back;
    renderPlacedPatches(); updatePrice();
  });

  function saveUndo() {
    undoStack.push({ front: JSON.parse(JSON.stringify(frontPatches)), back: JSON.parse(JSON.stringify(backPatches)) });
    if (undoStack.length > 30) undoStack.shift();
  }

  // ---- Patch sidebar ----
  let activeCat = 'all', activeColor = 'all';

  function renderPatchSidebar() {
    const patches = DB.Patches.getActive();
    const cats = ['all', ...new Set(patches.map(p => p.category))];
    catFilters.innerHTML = cats.map(c =>
      `<span class="chip ${activeCat === c ? 'active' : ''}" data-cat="${c}">${c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}</span>`
    ).join('');
    catFilters.querySelectorAll('.chip').forEach(el =>
      el.addEventListener('click', () => { activeCat = el.dataset.cat; renderPatchSidebar(); }));

    const colors = ['all', ...new Set(patches.map(p => p.color))];
    colorFilters.innerHTML = colors.map(c =>
      `<span class="chip ${activeColor === c ? 'active' : ''}" data-color="${c}">${c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}</span>`
    ).join('');
    colorFilters.querySelectorAll('.chip').forEach(el =>
      el.addEventListener('click', () => { activeColor = el.dataset.color; renderPatchSidebar(); }));

    let filtered = patches;
    if (activeCat !== 'all') filtered = filtered.filter(p => p.category === activeCat);
    if (activeColor !== 'all') filtered = filtered.filter(p => p.color === activeColor);

    patchList.innerHTML = '';
    filtered.forEach(p => {
      const el = document.createElement('div');
      el.className = 'patch-item';
      el.draggable = true;
      el.dataset.patchId = p.id;
      el.innerHTML = `<img src="${p.image}" alt="${p.name}"><div class="pi-name">${p.name}</div><div class="pi-price">${fmtPrice(p.price)}</div>`;

      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', p.id);
        e.dataTransfer.effectAllowed = 'copy';
        const ghost = document.createElement('img');
        ghost.src = p.image;
        ghost.style.width = (p.realWidth * scale) + 'px';
        ghost.style.height = (p.realHeight * scale) + 'px';
        ghost.style.position = 'absolute'; ghost.style.top = '-9999px';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, (p.realWidth * scale) / 2, (p.realHeight * scale) / 2);
        setTimeout(() => ghost.remove(), 0);
      });

      // Touch support
      let touchGhost = null;
      el.addEventListener('touchstart', e => {
        const touch = e.touches[0];
        touchGhost = document.createElement('div');
        touchGhost.className = 'drag-ghost';
        touchGhost.innerHTML = `<img src="${p.image}" style="width:${p.realWidth * scale}px;height:${p.realHeight * scale}px">`;
        document.body.appendChild(touchGhost);
        touchGhost.style.left = (touch.clientX - (p.realWidth * scale)/2) + 'px';
        touchGhost.style.top  = (touch.clientY - (p.realHeight * scale)/2) + 'px';
      }, { passive: true });
      el.addEventListener('touchmove', e => {
        if (!touchGhost) return; e.preventDefault();
        const touch = e.touches[0];
        touchGhost.style.left = (touch.clientX - (p.realWidth * scale)/2) + 'px';
        touchGhost.style.top  = (touch.clientY - (p.realHeight * scale)/2) + 'px';
      }, { passive: false });
      el.addEventListener('touchend', e => {
        if (!touchGhost) return;
        const touch = e.changedTouches[0];
        const rect = canvasArea.getBoundingClientRect();
        const xPx = touch.clientX - rect.left;
        const yPx = touch.clientY - rect.top;
        if (xPx >= 0 && yPx >= 0 && xPx <= rect.width && yPx <= rect.height) {
          const xMm = xPx / scale - p.realWidth / 2;
          const yMm = yPx / scale - p.realHeight / 2;
          tryPlacePatch(p.id, xMm, yMm);
        }
        touchGhost.remove(); touchGhost = null;
      });

      patchList.appendChild(el);
    });
  }

  // ---- Drop on canvas ----
  canvasArea.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  canvasArea.addEventListener('drop', e => {
    e.preventDefault();
    const patchId = e.dataTransfer.getData('text/plain');
    if (!patchId) return;
    const patch = DB.Patches.getById(patchId);
    if (!patch) return;
    const rect = canvasArea.getBoundingClientRect();
    const xMm = (e.clientX - rect.left) / scale - patch.realWidth / 2;
    const yMm = (e.clientY - rect.top) / scale - patch.realHeight / 2;
    tryPlacePatch(patchId, xMm, yMm);
  });

  // Deselect
  canvasArea.addEventListener('mousedown', e => {
    if (e.target === carrierImg || e.target === canvasArea || e.target === patchZone) {
      selectedPlacedId = null; renderPlacedPatches();
    }
  });

  // ================
  // Placement, Collision, Render (all in mm)
  // ================
  function currentPatches() { return currentSide === 'front' ? frontPatches : backPatches; }
  function setCurrentPatches(arr) { if (currentSide === 'front') frontPatches = arr; else backPatches = arr; }

  function getZone() {
    const area = currentSide === 'front' ? selectedCarrier.patchArea : selectedCarrier.backPatchArea;
    return { x: area.x, y: area.y, w: area.w, h: area.h };
  }

  function tryPlacePatch(patchId, xMm, yMm, rotation = 0) {
    const patch = DB.Patches.getById(patchId);
    if (!patch) return false;
    const pw = patch.realWidth, ph = patch.realHeight;
    const zone = getZone();

    // Clamp to zone (mm)
    xMm = Math.max(zone.x, Math.min(xMm, zone.x + zone.w - pw));
    yMm = Math.max(zone.y, Math.min(yMm, zone.y + zone.h - ph));

    const newP = { id: 'pp' + (++patchIdCounter), patchId, x: xMm, y: yMm, rotation };

    // Collision check (mm)
    const existing = currentPatches();
    for (const ep of existing) {
      const epData = DB.Patches.getById(ep.patchId);
      if (!epData) continue;
      if (collides(newP, patch, ep, epData)) {
        showToast('Patches cannot overlap!', 'error');
        return false;
      }
    }

    saveUndo();
    existing.push(newP);
    setCurrentPatches(existing);
    selectedPlacedId = newP.id;
    renderPlacedPatches(); updatePrice();
    return true;
  }

  // OBB collision (mm space)
  function collides(a, aData, b, bData) {
    const GAP = 1; // 1mm gap
    return checkOBB(
      { cx: a.x + aData.realWidth/2, cy: a.y + aData.realHeight/2, hw: aData.realWidth/2 + GAP, hh: aData.realHeight/2 + GAP, angle: a.rotation || 0 },
      { cx: b.x + bData.realWidth/2, cy: b.y + bData.realHeight/2, hw: bData.realWidth/2 + GAP, hh: bData.realHeight/2 + GAP, angle: b.rotation || 0 }
    );
  }

  function checkOBB(a, b) {
    function corners(box) {
      const c = Math.cos(box.angle * Math.PI / 180), s = Math.sin(box.angle * Math.PI / 180);
      return [
        { x: box.cx + c*box.hw - s*box.hh, y: box.cy + s*box.hw + c*box.hh },
        { x: box.cx - c*box.hw - s*box.hh, y: box.cy - s*box.hw + c*box.hh },
        { x: box.cx - c*box.hw + s*box.hh, y: box.cy - s*box.hw - c*box.hh },
        { x: box.cx + c*box.hw + s*box.hh, y: box.cy + s*box.hw - c*box.hh },
      ];
    }
    function axes(cs) {
      return [{ x: cs[1].x-cs[0].x, y: cs[1].y-cs[0].y }, { x: cs[3].x-cs[0].x, y: cs[3].y-cs[0].y }];
    }
    function project(cs, ax) {
      let mn = Infinity, mx = -Infinity;
      for (const c of cs) { const p = c.x*ax.x + c.y*ax.y; mn = Math.min(mn, p); mx = Math.max(mx, p); }
      return { min: mn, max: mx };
    }
    const cA = corners(a), cB = corners(b);
    for (const ax of [...axes(cA), ...axes(cB)]) {
      const pA = project(cA, ax), pB = project(cB, ax);
      if (pA.max < pB.min || pB.max < pA.min) return false;
    }
    return true;
  }

  function isInZone(xMm, yMm, pw, ph, rotation) {
    const zone = getZone();
    const cx = xMm + pw/2, cy = yMm + ph/2;
    const cos = Math.cos(rotation * Math.PI / 180), sin = Math.sin(rotation * Math.PI / 180);
    const hw = pw/2, hh = ph/2;
    const corners = [
      { x: cx + cos*hw - sin*hh, y: cy + sin*hw + cos*hh },
      { x: cx - cos*hw - sin*hh, y: cy - sin*hw + cos*hh },
      { x: cx - cos*hw + sin*hh, y: cy - sin*hw - cos*hh },
      { x: cx + cos*hw + sin*hh, y: cy + sin*hw - cos*hh },
    ];
    return corners.every(c => c.x >= zone.x && c.x <= zone.x + zone.w && c.y >= zone.y && c.y <= zone.y + zone.h);
  }

  // ---- Render placed patches (mm → px via scale) ----
  function renderPlacedPatches() {
    canvasArea.querySelectorAll('.placed-patch').forEach(el => el.remove());
    const patches = currentPatches();
    patches.forEach(pp => {
      const pd = DB.Patches.getById(pp.patchId);
      if (!pd) return;
      const el = document.createElement('div');
      el.className = 'placed-patch' + (pp.id === selectedPlacedId ? ' selected' : '');
      el.dataset.ppId = pp.id;
      el.style.left = (pp.x * scale) + 'px';
      el.style.top = (pp.y * scale) + 'px';
      el.style.width = (pd.realWidth * scale) + 'px';
      el.style.height = (pd.realHeight * scale) + 'px';
      el.style.transform = `rotate(${pp.rotation || 0}deg)`;
      el.innerHTML = `<img src="${pd.image}" alt="${pd.name}"><div class="rotate-handle"></div><div class="delete-handle">&times;</div>`;
      canvasArea.appendChild(el);

      // Select + drag
      el.addEventListener('mousedown', e => {
        if (e.target.classList.contains('rotate-handle') || e.target.classList.contains('delete-handle')) return;
        e.stopPropagation(); selectedPlacedId = pp.id; renderPlacedPatches();
        startDrag(pp, pd, e);
      });
      // Delete
      el.querySelector('.delete-handle').addEventListener('click', e => {
        e.stopPropagation(); saveUndo();
        setCurrentPatches(currentPatches().filter(p => p.id !== pp.id));
        selectedPlacedId = null; renderPlacedPatches(); updatePrice();
      });
      // Rotate
      el.querySelector('.rotate-handle').addEventListener('mousedown', e => { e.stopPropagation(); startRotate(pp, pd, e); });

      // Touch
      el.addEventListener('touchstart', e => {
        if (e.target.classList.contains('rotate-handle')) { e.stopPropagation(); startRotateTouch(pp, pd, e); return; }
        if (e.target.classList.contains('delete-handle')) return;
        e.stopPropagation(); selectedPlacedId = pp.id; renderPlacedPatches();
        startDragTouch(pp, pd, e);
      }, { passive: false });
    });
  }

  // ---- Drag (mm) ----
  function startDrag(pp, pd, downE) {
    const startX = downE.clientX, startY = downE.clientY;
    const origX = pp.x, origY = pp.y;
    saveUndo();
    function onMove(e) {
      const dx = (e.clientX - startX) / scale; // delta in mm
      const dy = (e.clientY - startY) / scale;
      let nx = origX + dx, ny = origY + dy;
      const zone = getZone();
      if (!pp.rotation) {
        nx = Math.max(zone.x, Math.min(nx, zone.x + zone.w - pd.realWidth));
        ny = Math.max(zone.y, Math.min(ny, zone.y + zone.h - pd.realHeight));
      }
      // Collision
      const others = currentPatches().filter(p => p.id !== pp.id);
      let hit = false;
      for (const ep of others) { const epd = DB.Patches.getById(ep.patchId); if (epd && collides({...pp, x:nx, y:ny}, pd, ep, epd)) { hit = true; break; } }
      if (!hit && isInZone(nx, ny, pd.realWidth, pd.realHeight, pp.rotation||0)) {
        pp.x = nx; pp.y = ny;
        const el = canvasArea.querySelector(`[data-pp-id="${pp.id}"]`);
        if (el) { el.style.left = (nx * scale) + 'px'; el.style.top = (ny * scale) + 'px'; }
      }
    }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startDragTouch(pp, pd, e) {
    e.preventDefault();
    const touch = e.touches[0];
    const startX = touch.clientX, startY = touch.clientY;
    const origX = pp.x, origY = pp.y;
    saveUndo();
    function onMove(e) {
      const t = e.touches[0];
      const dx = (t.clientX - startX) / scale, dy = (t.clientY - startY) / scale;
      let nx = origX + dx, ny = origY + dy;
      const zone = getZone();
      if (!pp.rotation) {
        nx = Math.max(zone.x, Math.min(nx, zone.x + zone.w - pd.realWidth));
        ny = Math.max(zone.y, Math.min(ny, zone.y + zone.h - pd.realHeight));
      }
      const others = currentPatches().filter(p => p.id !== pp.id);
      let hit = false;
      for (const ep of others) { const epd = DB.Patches.getById(ep.patchId); if (epd && collides({...pp, x:nx, y:ny}, pd, ep, epd)) { hit = true; break; } }
      if (!hit && isInZone(nx, ny, pd.realWidth, pd.realHeight, pp.rotation||0)) {
        pp.x = nx; pp.y = ny;
        const el = canvasArea.querySelector(`[data-pp-id="${pp.id}"]`);
        if (el) { el.style.left = (nx * scale) + 'px'; el.style.top = (ny * scale) + 'px'; }
      }
    }
    function onEnd() { document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd); }
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  // ---- Rotate ----
  function startRotate(pp, pd, downE) {
    downE.preventDefault();
    const cxMm = pp.x + pd.realWidth/2, cyMm = pp.y + pd.realHeight/2;
    const rect = canvasArea.getBoundingClientRect();
    const cxPx = rect.left + cxMm * scale, cyPx = rect.top + cyMm * scale;
    const origRot = pp.rotation || 0;
    const startA = Math.atan2(downE.clientY - cyPx, downE.clientX - cxPx);
    saveUndo();
    function onMove(e) {
      const a = Math.atan2(e.clientY - cyPx, e.clientX - cxPx);
      let nr = origRot + (a - startA) * 180 / Math.PI;
      nr = ((nr % 360) + 360) % 360;
      const others = currentPatches().filter(p => p.id !== pp.id);
      let hit = false;
      for (const ep of others) { const epd = DB.Patches.getById(ep.patchId); if (epd && collides({...pp, rotation:nr}, pd, ep, epd)) { hit = true; break; } }
      if (!hit && isInZone(pp.x, pp.y, pd.realWidth, pd.realHeight, nr)) {
        pp.rotation = nr;
        const el = canvasArea.querySelector(`[data-pp-id="${pp.id}"]`);
        if (el) el.style.transform = `rotate(${nr}deg)`;
      }
    }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startRotateTouch(pp, pd, e) {
    e.preventDefault();
    const cxMm = pp.x + pd.realWidth/2, cyMm = pp.y + pd.realHeight/2;
    const rect = canvasArea.getBoundingClientRect();
    const cxPx = rect.left + cxMm * scale, cyPx = rect.top + cyMm * scale;
    const origRot = pp.rotation || 0;
    const t0 = e.touches[0];
    const startA = Math.atan2(t0.clientY - cyPx, t0.clientX - cxPx);
    saveUndo();
    function onMove(e) {
      const t = e.touches[0];
      const a = Math.atan2(t.clientY - cyPx, t.clientX - cxPx);
      let nr = origRot + (a - startA) * 180 / Math.PI;
      nr = ((nr % 360) + 360) % 360;
      const others = currentPatches().filter(p => p.id !== pp.id);
      let hit = false;
      for (const ep of others) { const epd = DB.Patches.getById(ep.patchId); if (epd && collides({...pp, rotation:nr}, pd, ep, epd)) { hit = true; break; } }
      if (!hit && isInZone(pp.x, pp.y, pd.realWidth, pd.realHeight, nr)) {
        pp.rotation = nr;
        const el = canvasArea.querySelector(`[data-pp-id="${pp.id}"]`);
        if (el) el.style.transform = `rotate(${nr}deg)`;
      }
    }
    function onEnd() { document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd); }
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  // ================
  // Price
  // ================
  function updatePrice() {
    let total = selectedCarrier ? selectedCarrier.price : 0;
    [...frontPatches, ...backPatches].forEach(pp => { const p = DB.Patches.getById(pp.patchId); if (p) total += p.price; });
    priceTotal.textContent = fmtPrice(total);
  }

  // ================
  // Step 3: Summary & Cart
  // ================
  function buildSummary() {
    const previewDiv = document.getElementById('preview-images');
    const detailsDiv = document.getElementById('summary-details');
    previewDiv.innerHTML = '';

    ['front', 'back'].forEach(side => {
      const patches = side === 'front' ? frontPatches : backPatches;
      const c = selectedCarrier;
      const s = THUMB_SCALE;
      const w = c.realWidth * s, h = c.realHeight * s;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = side === 'front' ? c.frontImage : c.backImage;
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        let done = 0;
        if (patches.length === 0) return;
        patches.forEach(pp => {
          const pd = DB.Patches.getById(pp.patchId);
          if (!pd) { done++; return; }
          const pi = new Image(); pi.src = pd.image;
          pi.onload = () => {
            const pw = pd.realWidth * s, ph = pd.realHeight * s;
            ctx.save(); ctx.translate(pp.x * s + pw/2, pp.y * s + ph/2);
            ctx.rotate((pp.rotation||0) * Math.PI / 180);
            ctx.drawImage(pi, -pw/2, -ph/2, pw, ph);
            ctx.restore(); done++;
          };
        });
      };
      const thumbDiv = document.createElement('div');
      thumbDiv.className = 'thumb';
      thumbDiv.innerHTML = `<div style="text-align:center;padding:4px;font-size:0.7rem;color:var(--text-light)">${side === 'front' ? 'Front' : 'Back'}</div>`;
      canvas.style.width = Math.min(w, 220) + 'px'; canvas.style.height = 'auto';
      thumbDiv.appendChild(canvas);
      previewDiv.appendChild(thumbDiv);
    });

    const allP = [...frontPatches, ...backPatches];
    const lines = allP.map(pp => { const p = DB.Patches.getById(pp.patchId); return p ? `<tr><td class="label">${p.name} (${p.nameZh||''})</td><td class="value">${fmtPrice(p.price)}</td></tr>` : ''; }).join('');
    const cPrice = selectedCarrier.price;
    const pPrice = allP.reduce((s, pp) => { const p = DB.Patches.getById(pp.patchId); return s + (p ? p.price : 0); }, 0);
    detailsDiv.innerHTML = `<table class="summary-table">
      <tr><td class="label">Carrier: ${selectedCarrier.name}</td><td class="value">${fmtPrice(cPrice)}</td></tr>
      ${lines}
      <tr><td colspan="2"><hr class="divider"></td></tr>
      <tr><td class="label"><strong>Total</strong></td><td class="value summary-total">${fmtPrice(cPrice + pPrice)}</td></tr>
    </table>`;

    document.getElementById('summary-content').innerHTML = `
      <p style="font-size:0.85rem;color:var(--text-light);margin-bottom:8px">${selectedCarrier.name} + ${allP.length} patch${allP.length !== 1 ? 'es' : ''}</p>
      <p style="font-size:0.85rem;color:var(--text-light)">Front: ${frontPatches.length} · Back: ${backPatches.length}</p>`;
  }

  function addToCart() {
    const design = DB.Designs.add({
      carrierId: selectedCarrier.id,
      frontPatches: JSON.parse(JSON.stringify(frontPatches)),
      backPatches: JSON.parse(JSON.stringify(backPatches)),
      thumbnail: null
    });
    generateThumbnail('front').then(url => { DB.Designs.update(design.id, { thumbnail: url }); });
    DB.Cart.add({ designId: design.id, quantity: 1 });
    showToast('Design added to cart!');
    setTimeout(() => window.location.href = 'cart.html', 1000);
  }

  function generateThumbnail(side) {
    return new Promise(resolve => {
      const c = selectedCarrier;
      const s = THUMB_SCALE;
      const w = c.realWidth * s, h = c.realHeight * s;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const img = new Image(); img.src = side === 'front' ? c.frontImage : c.backImage;
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        const patches = side === 'front' ? frontPatches : backPatches;
        let done = 0;
        if (patches.length === 0) { resolve(canvas.toDataURL('image/png')); return; }
        patches.forEach(pp => {
          const pd = DB.Patches.getById(pp.patchId);
          if (!pd) { done++; if (done === patches.length) resolve(canvas.toDataURL('image/png')); return; }
          const pi = new Image(); pi.src = pd.image;
          pi.onload = () => {
            const pw = pd.realWidth * s, ph = pd.realHeight * s;
            ctx.save(); ctx.translate(pp.x * s + pw/2, pp.y * s + ph/2);
            ctx.rotate((pp.rotation||0) * Math.PI / 180);
            ctx.drawImage(pi, -pw/2, -ph/2, pw, ph); ctx.restore();
            done++; if (done === patches.length) resolve(canvas.toDataURL('image/png'));
          };
          pi.onerror = () => { done++; if (done === patches.length) resolve(canvas.toDataURL('image/png')); };
        });
      };
      img.onerror = () => resolve(null);
    });
  }

  // ---- Init ----
  goToStep(1);
  window.addEventListener('resize', () => { if (currentStep === 2 && selectedCarrier) zoomFit(); });
})();
