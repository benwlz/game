/**
 * PatchCraft — Creation Editor
 * Handles the 3-step creation flow with drag/drop, rotation, collision detection.
 */
(() => {
  renderNav('create');

  // ---- State ----
  let currentStep = 1;
  let selectedCarrier = null;
  let currentSide = 'front'; // 'front' | 'back'
  let frontPatches = [];     // [{ id, patchId, x, y, rotation }]
  let backPatches  = [];
  let selectedPlacedId = null;
  let undoStack = [];
  const MM_TO_PX = 1.5;     // 1mm = 1.5px on screen
  let patchIdCounter = 0;

  // ---- DOM refs ----
  const stepsBar     = document.getElementById('steps-bar');
  const sidebar1     = document.getElementById('sidebar-step1');
  const sidebar2     = document.getElementById('sidebar-step2');
  const sidebar3     = document.getElementById('sidebar-step3');
  const main1        = document.getElementById('main-step1');
  const main2        = document.getElementById('main-step2');
  const main3        = document.getElementById('main-step3');
  const carrierList  = document.getElementById('carrier-list');
  const patchList    = document.getElementById('patch-list');
  const catFilters   = document.getElementById('cat-filters');
  const colorFilters = document.getElementById('color-filters');
  const canvasArea   = document.getElementById('canvas-area');
  const carrierImg   = document.getElementById('carrier-img');
  const patchZone    = document.getElementById('patch-zone');
  const priceBar     = document.getElementById('price-bar');
  const priceTotal   = document.getElementById('price-total');
  const btnFront     = document.getElementById('btn-front');
  const btnBack      = document.getElementById('btn-back');
  const btnPrev      = document.getElementById('btn-prev');
  const btnNext      = document.getElementById('btn-next');
  const btnClearSide = document.getElementById('btn-clear-side');
  const btnUndo      = document.getElementById('btn-undo');

  // ==========================
  // Step Navigation
  // ==========================
  function goToStep(step) {
    currentStep = step;
    // Update steps bar
    stepsBar.querySelectorAll('.step-item').forEach(el => {
      const s = +el.dataset.step;
      el.classList.toggle('active', s === step);
      el.classList.toggle('done', s < step);
    });
    // Toggle panels
    sidebar1.classList.toggle('hidden', step !== 1);
    sidebar2.classList.toggle('hidden', step !== 2);
    sidebar3.classList.toggle('hidden', step !== 3);
    main1.classList.toggle('hidden', step !== 1);
    main2.classList.toggle('hidden', step !== 2);
    main3.classList.toggle('hidden', step !== 3);
    // Price bar
    priceBar.style.display = step >= 2 ? '' : 'none';
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
        return showToast('Add at least one patch to your design', 'error');
      goToStep(3);
    } else if (currentStep === 3) {
      addToCart();
    }
  });

  btnPrev.addEventListener('click', () => {
    if (currentStep > 1) goToStep(currentStep - 1);
  });

  // ==========================
  // Step 1: Choose Carrier
  // ==========================
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
        frontPatches = [];
        backPatches = [];
        undoStack = [];
        renderCarriers();
        // Show preview in main area
        main1.innerHTML = `<div style="text-align:center">
          <img src="${c.frontImage}" style="max-height:300px;border-radius:var(--radius);margin-bottom:16px" alt="${c.name}">
          <h3>${c.name}</h3>
          <p style="color:var(--text-light)">${c.realWidth}×${c.realHeight}mm · ${fmtPrice(c.price)}</p>
        </div>`;
        priceBar.style.display = '';
        updatePrice();
      });
      carrierList.appendChild(el);
    });
  }
  renderCarriers();

  // ==========================
  // Step 2: Editor Setup
  // ==========================
  function setupEditor() {
    if (!selectedCarrier) return;
    const c = selectedCarrier;
    const w = c.realWidth * MM_TO_PX;
    const h = c.realHeight * MM_TO_PX;

    canvasArea.style.width = w + 'px';
    canvasArea.style.height = h + 'px';
    carrierImg.src = currentSide === 'front' ? c.frontImage : c.backImage;

    // Patch zone
    const area = currentSide === 'front' ? c.patchArea : c.backPatchArea;
    patchZone.style.left   = (area.x * MM_TO_PX) + 'px';
    patchZone.style.top    = (area.y * MM_TO_PX) + 'px';
    patchZone.style.width  = (area.w * MM_TO_PX) + 'px';
    patchZone.style.height = (area.h * MM_TO_PX) + 'px';

    renderPlacedPatches();
    renderPatchSidebar();
    updateSideToggle();
  }

  // Side toggle
  function updateSideToggle() {
    btnFront.classList.toggle('active', currentSide === 'front');
    btnBack.classList.toggle('active', currentSide === 'back');
  }
  btnFront.addEventListener('click', () => { currentSide = 'front'; selectedPlacedId = null; setupEditor(); });
  btnBack.addEventListener('click', () => { currentSide = 'back'; selectedPlacedId = null; setupEditor(); });

  // Clear side
  btnClearSide.addEventListener('click', () => {
    saveUndo();
    if (currentSide === 'front') frontPatches = [];
    else backPatches = [];
    renderPlacedPatches();
    updatePrice();
    showToast('Cleared ' + currentSide + ' side');
  });

  // Undo
  btnUndo.addEventListener('click', () => {
    if (undoStack.length === 0) return;
    const state = undoStack.pop();
    frontPatches = state.front;
    backPatches = state.back;
    renderPlacedPatches();
    updatePrice();
  });

  function saveUndo() {
    undoStack.push({
      front: JSON.parse(JSON.stringify(frontPatches)),
      back: JSON.parse(JSON.stringify(backPatches))
    });
    if (undoStack.length > 30) undoStack.shift();
  }

  // ---- Patch sidebar rendering ----
  let activeCat = 'all';
  let activeColor = 'all';

  function renderPatchSidebar() {
    const patches = DB.Patches.getActive();
    // Categories
    const cats = ['all', ...new Set(patches.map(p => p.category))];
    catFilters.innerHTML = cats.map(c =>
      `<span class="chip ${activeCat === c ? 'active' : ''}" data-cat="${c}">${c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}</span>`
    ).join('');
    catFilters.querySelectorAll('.chip').forEach(el =>
      el.addEventListener('click', () => { activeCat = el.dataset.cat; renderPatchSidebar(); })
    );

    // Colors
    const colors = ['all', ...new Set(patches.map(p => p.color))];
    colorFilters.innerHTML = colors.map(c =>
      `<span class="chip ${activeColor === c ? 'active' : ''}" data-color="${c}">${c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}</span>`
    ).join('');
    colorFilters.querySelectorAll('.chip').forEach(el =>
      el.addEventListener('click', () => { activeColor = el.dataset.color; renderPatchSidebar(); })
    );

    // Filter
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

      // Drag from sidebar
      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', p.id);
        e.dataTransfer.effectAllowed = 'copy';
        // Create ghost
        const ghost = document.createElement('img');
        ghost.src = p.image;
        ghost.style.width = (p.realWidth * MM_TO_PX) + 'px';
        ghost.style.height = (p.realHeight * MM_TO_PX) + 'px';
        ghost.style.position = 'absolute';
        ghost.style.top = '-9999px';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, (p.realWidth * MM_TO_PX) / 2, (p.realHeight * MM_TO_PX) / 2);
        setTimeout(() => ghost.remove(), 0);
      });

      // Touch drag for mobile
      let touchGhost = null;
      el.addEventListener('touchstart', e => {
        const touch = e.touches[0];
        touchGhost = document.createElement('div');
        touchGhost.className = 'drag-ghost';
        touchGhost.innerHTML = `<img src="${p.image}" style="width:${p.realWidth * MM_TO_PX}px;height:${p.realHeight * MM_TO_PX}px">`;
        document.body.appendChild(touchGhost);
        touchGhost.style.left = (touch.clientX - (p.realWidth * MM_TO_PX)/2) + 'px';
        touchGhost.style.top  = (touch.clientY - (p.realHeight * MM_TO_PX)/2) + 'px';
        touchGhost._patchId = p.id;
      }, { passive: true });

      el.addEventListener('touchmove', e => {
        if (!touchGhost) return;
        e.preventDefault();
        const touch = e.touches[0];
        touchGhost.style.left = (touch.clientX - (p.realWidth * MM_TO_PX)/2) + 'px';
        touchGhost.style.top  = (touch.clientY - (p.realHeight * MM_TO_PX)/2) + 'px';
      }, { passive: false });

      el.addEventListener('touchend', e => {
        if (!touchGhost) return;
        const touch = e.changedTouches[0];
        const rect = canvasArea.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) {
          tryPlacePatch(p.id, x - (p.realWidth * MM_TO_PX)/2, y - (p.realHeight * MM_TO_PX)/2);
        }
        touchGhost.remove();
        touchGhost = null;
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
    const x = e.clientX - rect.left - (patch.realWidth * MM_TO_PX) / 2;
    const y = e.clientY - rect.top - (patch.realHeight * MM_TO_PX) / 2;
    tryPlacePatch(patchId, x, y);
  });

  // Deselect on click outside
  canvasArea.addEventListener('mousedown', e => {
    if (e.target === carrierImg || e.target === canvasArea || e.target === patchZone) {
      selectedPlacedId = null;
      renderPlacedPatches();
    }
  });

  // ==========================
  // Placement, Collision, Render
  // ==========================
  function currentPatches() { return currentSide === 'front' ? frontPatches : backPatches; }
  function setCurrentPatches(arr) {
    if (currentSide === 'front') frontPatches = arr;
    else backPatches = arr;
  }

  function tryPlacePatch(patchId, x, y, rotation = 0, skipUndo = false) {
    const patch = DB.Patches.getById(patchId);
    if (!patch) return false;
    const w = patch.realWidth * MM_TO_PX;
    const h = patch.realHeight * MM_TO_PX;
    const area = currentSide === 'front' ? selectedCarrier.patchArea : selectedCarrier.backPatchArea;
    const zoneX = area.x * MM_TO_PX;
    const zoneY = area.y * MM_TO_PX;
    const zoneW = area.w * MM_TO_PX;
    const zoneH = area.h * MM_TO_PX;

    // Clamp to patch zone
    x = Math.max(zoneX, Math.min(x, zoneX + zoneW - w));
    y = Math.max(zoneY, Math.min(y, zoneY + zoneH - h));

    const newPatch = { id: 'pp' + (++patchIdCounter), patchId, x, y, rotation, w, h };

    // Check collision with existing patches
    const existing = currentPatches();
    for (const ep of existing) {
      const epData = DB.Patches.getById(ep.patchId);
      if (!epData) continue;
      const ew = epData.realWidth * MM_TO_PX;
      const eh = epData.realHeight * MM_TO_PX;
      if (checkCollisionOBB(
        { cx: x + w/2, cy: y + h/2, hw: w/2, hh: h/2, angle: rotation },
        { cx: ep.x + ew/2, cy: ep.y + eh/2, hw: ew/2, hh: eh/2, angle: ep.rotation || 0 }
      )) {
        showToast('Patches cannot overlap!', 'error');
        return false;
      }
    }

    if (!skipUndo) saveUndo();
    existing.push(newPatch);
    setCurrentPatches(existing);
    selectedPlacedId = newPatch.id;
    renderPlacedPatches();
    updatePrice();
    return true;
  }

  // OBB collision detection (Separating Axis Theorem)
  function checkCollisionOBB(a, b) {
    const GAP = 2; // small gap to prevent visual touching
    function getCorners(box) {
      const cos = Math.cos(box.angle * Math.PI / 180);
      const sin = Math.sin(box.angle * Math.PI / 180);
      const hw = box.hw + GAP, hh = box.hh + GAP;
      return [
        { x: box.cx + cos*hw - sin*hh, y: box.cy + sin*hw + cos*hh },
        { x: box.cx - cos*hw - sin*hh, y: box.cy - sin*hw + cos*hh },
        { x: box.cx - cos*hw + sin*hh, y: box.cy - sin*hw - cos*hh },
        { x: box.cx + cos*hw + sin*hh, y: box.cy + sin*hw - cos*hh },
      ];
    }
    function getAxes(corners) {
      return [
        { x: corners[1].x - corners[0].x, y: corners[1].y - corners[0].y },
        { x: corners[3].x - corners[0].x, y: corners[3].y - corners[0].y },
      ];
    }
    function project(corners, axis) {
      let min = Infinity, max = -Infinity;
      for (const c of corners) {
        const p = c.x * axis.x + c.y * axis.y;
        min = Math.min(min, p);
        max = Math.max(max, p);
      }
      return { min, max };
    }
    const cornersA = getCorners(a), cornersB = getCorners(b);
    const axes = [...getAxes(cornersA), ...getAxes(cornersB)];
    for (const axis of axes) {
      const pA = project(cornersA, axis);
      const pB = project(cornersB, axis);
      if (pA.max < pB.min || pB.max < pA.min) return false;
    }
    return true;
  }

  // Check if patch stays within the zone after move/rotate
  function isInZone(px, py, pw, ph, rotation) {
    const area = currentSide === 'front' ? selectedCarrier.patchArea : selectedCarrier.backPatchArea;
    const zoneX = area.x * MM_TO_PX;
    const zoneY = area.y * MM_TO_PX;
    const zoneW = area.w * MM_TO_PX;
    const zoneH = area.h * MM_TO_PX;

    // Get rotated corners
    const cx = px + pw/2, cy = py + ph/2;
    const cos = Math.cos(rotation * Math.PI / 180);
    const sin = Math.sin(rotation * Math.PI / 180);
    const hw = pw/2, hh = ph/2;
    const corners = [
      { x: cx + cos*hw - sin*hh, y: cy + sin*hw + cos*hh },
      { x: cx - cos*hw - sin*hh, y: cy - sin*hw + cos*hh },
      { x: cx - cos*hw + sin*hh, y: cy - sin*hw - cos*hh },
      { x: cx + cos*hw + sin*hh, y: cy + sin*hw - cos*hh },
    ];
    return corners.every(c =>
      c.x >= zoneX && c.x <= zoneX + zoneW &&
      c.y >= zoneY && c.y <= zoneY + zoneH
    );
  }

  // ---- Render placed patches ----
  function renderPlacedPatches() {
    // Remove old
    canvasArea.querySelectorAll('.placed-patch').forEach(el => el.remove());
    const patches = currentPatches();
    patches.forEach(pp => {
      const patchData = DB.Patches.getById(pp.patchId);
      if (!patchData) return;
      const w = patchData.realWidth * MM_TO_PX;
      const h = patchData.realHeight * MM_TO_PX;
      const el = document.createElement('div');
      el.className = 'placed-patch' + (pp.id === selectedPlacedId ? ' selected' : '');
      el.dataset.ppId = pp.id;
      el.style.left = pp.x + 'px';
      el.style.top = pp.y + 'px';
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.style.transform = `rotate(${pp.rotation || 0}deg)`;
      el.innerHTML = `
        <img src="${patchData.image}" alt="${patchData.name}">
        <div class="rotate-handle"></div>
        <div class="delete-handle">&times;</div>`;
      canvasArea.appendChild(el);

      // Select on click
      el.addEventListener('mousedown', e => {
        if (e.target.classList.contains('rotate-handle') || e.target.classList.contains('delete-handle')) return;
        e.stopPropagation();
        selectedPlacedId = pp.id;
        renderPlacedPatches();
        // Start drag
        startDragPlaced(pp, e);
      });

      // Delete
      el.querySelector('.delete-handle').addEventListener('click', e => {
        e.stopPropagation();
        saveUndo();
        setCurrentPatches(currentPatches().filter(p => p.id !== pp.id));
        selectedPlacedId = null;
        renderPlacedPatches();
        updatePrice();
      });

      // Rotate
      el.querySelector('.rotate-handle').addEventListener('mousedown', e => {
        e.stopPropagation();
        startRotate(pp, e);
      });

      // Touch support for placed patches
      el.addEventListener('touchstart', e => {
        if (e.target.classList.contains('rotate-handle')) {
          e.stopPropagation();
          startRotateTouch(pp, e);
          return;
        }
        if (e.target.classList.contains('delete-handle')) return;
        e.stopPropagation();
        selectedPlacedId = pp.id;
        renderPlacedPatches();
        startDragPlacedTouch(pp, e);
      }, { passive: false });
    });
  }

  // ---- Drag placed patch ----
  function startDragPlaced(pp, downEvent) {
    const patchData = DB.Patches.getById(pp.patchId);
    if (!patchData) return;
    const w = patchData.realWidth * MM_TO_PX;
    const h = patchData.realHeight * MM_TO_PX;
    const startX = downEvent.clientX;
    const startY = downEvent.clientY;
    const origX = pp.x, origY = pp.y;
    saveUndo();

    function onMove(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let nx = origX + dx;
      let ny = origY + dy;

      // Clamp to zone
      const area = currentSide === 'front' ? selectedCarrier.patchArea : selectedCarrier.backPatchArea;
      const zoneX = area.x * MM_TO_PX, zoneY = area.y * MM_TO_PX;
      const zoneW = area.w * MM_TO_PX, zoneH = area.h * MM_TO_PX;

      if (pp.rotation === 0 || !pp.rotation) {
        nx = Math.max(zoneX, Math.min(nx, zoneX + zoneW - w));
        ny = Math.max(zoneY, Math.min(ny, zoneY + zoneH - h));
      }

      // Check collision with others
      const others = currentPatches().filter(p => p.id !== pp.id);
      let collides = false;
      for (const ep of others) {
        const epData = DB.Patches.getById(ep.patchId);
        if (!epData) continue;
        const ew = epData.realWidth * MM_TO_PX;
        const eh = epData.realHeight * MM_TO_PX;
        if (checkCollisionOBB(
          { cx: nx + w/2, cy: ny + h/2, hw: w/2, hh: h/2, angle: pp.rotation || 0 },
          { cx: ep.x + ew/2, cy: ep.y + eh/2, hw: ew/2, hh: eh/2, angle: ep.rotation || 0 }
        )) { collides = true; break; }
      }

      if (!collides && isInZone(nx, ny, w, h, pp.rotation || 0)) {
        pp.x = nx;
        pp.y = ny;
        const el = canvasArea.querySelector(`[data-pp-id="${pp.id}"]`);
        if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px'; }
      }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Touch drag for placed
  function startDragPlacedTouch(pp, e) {
    e.preventDefault();
    const patchData = DB.Patches.getById(pp.patchId);
    if (!patchData) return;
    const w = patchData.realWidth * MM_TO_PX;
    const h = patchData.realHeight * MM_TO_PX;
    const touch = e.touches[0];
    const startX = touch.clientX, startY = touch.clientY;
    const origX = pp.x, origY = pp.y;
    saveUndo();

    function onMove(e) {
      const t = e.touches[0];
      const dx = t.clientX - startX, dy = t.clientY - startY;
      let nx = origX + dx, ny = origY + dy;
      const area = currentSide === 'front' ? selectedCarrier.patchArea : selectedCarrier.backPatchArea;
      const zoneX = area.x * MM_TO_PX, zoneY = area.y * MM_TO_PX;
      const zoneW = area.w * MM_TO_PX, zoneH = area.h * MM_TO_PX;
      if (!pp.rotation) {
        nx = Math.max(zoneX, Math.min(nx, zoneX + zoneW - w));
        ny = Math.max(zoneY, Math.min(ny, zoneY + zoneH - h));
      }
      const others = currentPatches().filter(p => p.id !== pp.id);
      let collides = false;
      for (const ep of others) {
        const epData = DB.Patches.getById(ep.patchId);
        if (!epData) continue;
        const ew = epData.realWidth * MM_TO_PX, eh = epData.realHeight * MM_TO_PX;
        if (checkCollisionOBB(
          { cx: nx+w/2, cy: ny+h/2, hw: w/2, hh: h/2, angle: pp.rotation||0 },
          { cx: ep.x+ew/2, cy: ep.y+eh/2, hw: ew/2, hh: eh/2, angle: ep.rotation||0 }
        )) { collides = true; break; }
      }
      if (!collides && isInZone(nx, ny, w, h, pp.rotation||0)) {
        pp.x = nx; pp.y = ny;
        const el = canvasArea.querySelector(`[data-pp-id="${pp.id}"]`);
        if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px'; }
      }
    }
    function onEnd() {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    }
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  // ---- Rotation ----
  function startRotate(pp, downEvent) {
    downEvent.preventDefault();
    const patchData = DB.Patches.getById(pp.patchId);
    if (!patchData) return;
    const w = patchData.realWidth * MM_TO_PX;
    const h = patchData.realHeight * MM_TO_PX;
    const cx = pp.x + w/2;
    const cy = pp.y + h/2;
    const origRotation = pp.rotation || 0;
    const startAngle = Math.atan2(downEvent.clientY - (canvasArea.getBoundingClientRect().top + cy),
                                  downEvent.clientX - (canvasArea.getBoundingClientRect().left + cx));
    saveUndo();

    function onMove(e) {
      const rect = canvasArea.getBoundingClientRect();
      const angle = Math.atan2(e.clientY - (rect.top + cy), e.clientX - (rect.left + cx));
      let newRot = origRotation + (angle - startAngle) * 180 / Math.PI;
      newRot = ((newRot % 360) + 360) % 360;

      // Check collision with others
      const others = currentPatches().filter(p => p.id !== pp.id);
      let collides = false;
      for (const ep of others) {
        const epData = DB.Patches.getById(ep.patchId);
        if (!epData) continue;
        const ew = epData.realWidth * MM_TO_PX, eh = epData.realHeight * MM_TO_PX;
        if (checkCollisionOBB(
          { cx: pp.x+w/2, cy: pp.y+h/2, hw: w/2, hh: h/2, angle: newRot },
          { cx: ep.x+ew/2, cy: ep.y+eh/2, hw: ew/2, hh: eh/2, angle: ep.rotation||0 }
        )) { collides = true; break; }
      }

      if (!collides && isInZone(pp.x, pp.y, w, h, newRot)) {
        pp.rotation = newRot;
        const el = canvasArea.querySelector(`[data-pp-id="${pp.id}"]`);
        if (el) el.style.transform = `rotate(${newRot}deg)`;
      }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startRotateTouch(pp, e) {
    e.preventDefault();
    const patchData = DB.Patches.getById(pp.patchId);
    if (!patchData) return;
    const w = patchData.realWidth * MM_TO_PX, h = patchData.realHeight * MM_TO_PX;
    const cx = pp.x + w/2, cy = pp.y + h/2;
    const origRotation = pp.rotation || 0;
    const touch = e.touches[0];
    const rect = canvasArea.getBoundingClientRect();
    const startAngle = Math.atan2(touch.clientY - (rect.top + cy), touch.clientX - (rect.left + cx));

    saveUndo();
    function onMove(e) {
      const t = e.touches[0];
      const r = canvasArea.getBoundingClientRect();
      const angle = Math.atan2(t.clientY - (r.top + cy), t.clientX - (r.left + cx));
      let newRot = origRotation + (angle - startAngle) * 180 / Math.PI;
      newRot = ((newRot % 360) + 360) % 360;
      const others = currentPatches().filter(p => p.id !== pp.id);
      let collides = false;
      for (const ep of others) {
        const epData = DB.Patches.getById(ep.patchId);
        if (!epData) continue;
        const ew = epData.realWidth * MM_TO_PX, eh = epData.realHeight * MM_TO_PX;
        if (checkCollisionOBB(
          { cx: pp.x+w/2, cy: pp.y+h/2, hw: w/2, hh: h/2, angle: newRot },
          { cx: ep.x+ew/2, cy: ep.y+eh/2, hw: ew/2, hh: eh/2, angle: ep.rotation||0 }
        )) { collides = true; break; }
      }
      if (!collides && isInZone(pp.x, pp.y, w, h, newRot)) {
        pp.rotation = newRot;
        const el = canvasArea.querySelector(`[data-pp-id="${pp.id}"]`);
        if (el) el.style.transform = `rotate(${newRot}deg)`;
      }
    }
    function onEnd() {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    }
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  // ==========================
  // Price
  // ==========================
  function updatePrice() {
    let total = selectedCarrier ? selectedCarrier.price : 0;
    [...frontPatches, ...backPatches].forEach(pp => {
      const p = DB.Patches.getById(pp.patchId);
      if (p) total += p.price;
    });
    priceTotal.textContent = fmtPrice(total);
  }

  // ==========================
  // Step 3: Summary & Add to Cart
  // ==========================
  function buildSummary() {
    const previewDiv = document.getElementById('preview-images');
    const detailsDiv = document.getElementById('summary-details');
    previewDiv.innerHTML = '';
    // Render front and back thumbnails to canvas
    ['front', 'back'].forEach(side => {
      const patches = side === 'front' ? frontPatches : backPatches;
      const c = selectedCarrier;
      const w = c.realWidth * MM_TO_PX;
      const h = c.realHeight * MM_TO_PX;

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');

      // Draw carrier bg
      const img = new Image();
      img.src = side === 'front' ? c.frontImage : c.backImage;
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        // Draw patches
        let remaining = patches.length;
        if (remaining === 0) return;
        patches.forEach(pp => {
          const patchData = DB.Patches.getById(pp.patchId);
          if (!patchData) { remaining--; return; }
          const pImg = new Image();
          pImg.src = patchData.image;
          pImg.onload = () => {
            const pw = patchData.realWidth * MM_TO_PX;
            const ph = patchData.realHeight * MM_TO_PX;
            ctx.save();
            ctx.translate(pp.x + pw/2, pp.y + ph/2);
            ctx.rotate((pp.rotation || 0) * Math.PI / 180);
            ctx.drawImage(pImg, -pw/2, -ph/2, pw, ph);
            ctx.restore();
            remaining--;
          };
        });
      };

      const thumbDiv = document.createElement('div');
      thumbDiv.className = 'thumb';
      thumbDiv.innerHTML = `<div style="text-align:center;padding:4px;font-size:0.75rem;color:var(--text-light)">${side === 'front' ? 'Front' : 'Back'}</div>`;
      canvas.style.width = Math.min(w, 240) + 'px';
      canvas.style.height = 'auto';
      thumbDiv.appendChild(canvas);
      previewDiv.appendChild(thumbDiv);
    });

    // Details
    const allPatches = [...frontPatches, ...backPatches];
    const patchLines = allPatches.map(pp => {
      const p = DB.Patches.getById(pp.patchId);
      return p ? `<tr><td class="label">${p.name} (${p.nameZh || ''})</td><td class="value">${fmtPrice(p.price)}</td></tr>` : '';
    }).join('');
    const carrierPrice = selectedCarrier.price;
    const patchesTotal = allPatches.reduce((s, pp) => { const p = DB.Patches.getById(pp.patchId); return s + (p ? p.price : 0); }, 0);
    const total = carrierPrice + patchesTotal;

    detailsDiv.innerHTML = `
      <table class="summary-table">
        <tr><td class="label">Carrier: ${selectedCarrier.name}</td><td class="value">${fmtPrice(carrierPrice)}</td></tr>
        ${patchLines}
        <tr><td colspan="2"><hr class="divider"></td></tr>
        <tr><td class="label"><strong>Total</strong></td><td class="value summary-total">${fmtPrice(total)}</td></tr>
      </table>`;

    // Summary sidebar
    document.getElementById('summary-content').innerHTML = `
      <p style="font-size:0.85rem;color:var(--text-light);margin-bottom:12px">
        ${selectedCarrier.name} + ${allPatches.length} patch${allPatches.length !== 1 ? 'es' : ''}
      </p>
      <p style="font-size:0.85rem;color:var(--text-light)">
        Front: ${frontPatches.length} patch${frontPatches.length !== 1 ? 'es' : ''}<br>
        Back: ${backPatches.length} patch${backPatches.length !== 1 ? 'es' : ''}
      </p>`;
  }

  function addToCart() {
    // Save design
    const design = DB.Designs.add({
      carrierId: selectedCarrier.id,
      frontPatches: JSON.parse(JSON.stringify(frontPatches)),
      backPatches: JSON.parse(JSON.stringify(backPatches)),
      thumbnail: null // could generate from canvas
    });

    // Generate thumbnail async
    generateThumbnail('front').then(dataUrl => {
      DB.Designs.update(design.id, { thumbnail: dataUrl });
    });

    // Add to cart
    DB.Cart.add({ designId: design.id, quantity: 1 });
    showToast('Design added to cart!');
    setTimeout(() => window.location.href = 'cart.html', 1000);
  }

  function generateThumbnail(side) {
    return new Promise(resolve => {
      const c = selectedCarrier;
      const w = c.realWidth * MM_TO_PX;
      const h = c.realHeight * MM_TO_PX;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = side === 'front' ? c.frontImage : c.backImage;
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        const patches = side === 'front' ? frontPatches : backPatches;
        let done = 0;
        if (patches.length === 0) { resolve(canvas.toDataURL('image/png')); return; }
        patches.forEach(pp => {
          const patchData = DB.Patches.getById(pp.patchId);
          if (!patchData) { done++; if (done === patches.length) resolve(canvas.toDataURL('image/png')); return; }
          const pImg = new Image();
          pImg.src = patchData.image;
          pImg.onload = () => {
            const pw = patchData.realWidth * MM_TO_PX;
            const ph = patchData.realHeight * MM_TO_PX;
            ctx.save();
            ctx.translate(pp.x + pw/2, pp.y + ph/2);
            ctx.rotate((pp.rotation || 0) * Math.PI / 180);
            ctx.drawImage(pImg, -pw/2, -ph/2, pw, ph);
            ctx.restore();
            done++;
            if (done === patches.length) resolve(canvas.toDataURL('image/png'));
          };
          pImg.onerror = () => { done++; if (done === patches.length) resolve(canvas.toDataURL('image/png')); };
        });
      };
      img.onerror = () => resolve(null);
    });
  }

  // ---- Init ----
  goToStep(1);
})();
