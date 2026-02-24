/**
 * PatchCraft - Data Layer
 * Manages all data via localStorage with CRUD operations
 */

const DB = (() => {
  // ---- helpers ----
  function _get(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
  }
  function _set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
  function _id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  // ---- Generic CRUD ----
  function getAll(key) { return _get(key); }
  function getById(key, id) { return _get(key).find(i => i.id === id) || null; }
  function add(key, item) {
    const list = _get(key);
    item.id = item.id || _id();
    item.createdAt = item.createdAt || new Date().toISOString();
    list.push(item);
    _set(key, list);
    return item;
  }
  function update(key, id, data) {
    const list = _get(key);
    const idx = list.findIndex(i => i.id === id);
    if (idx === -1) return null;
    Object.assign(list[idx], data);
    _set(key, list);
    return list[idx];
  }
  function remove(key, id) {
    const list = _get(key).filter(i => i.id !== id);
    _set(key, list);
  }

  // ---- Domain APIs ----
  const Carriers = {
    KEY: 'pc_carriers',
    getAll()        { return getAll(this.KEY).filter(c => c.status !== 'deleted'); },
    getActive()     { return this.getAll().filter(c => c.status === 'active'); },
    getById(id)     { return getById(this.KEY, id); },
    add(c)          { c.status = c.status || 'active'; return add(this.KEY, c); },
    update(id, d)   { return update(this.KEY, id, d); },
    remove(id)      { return update(this.KEY, id, { status: 'deleted' }); },
  };

  const Patches = {
    KEY: 'pc_patches',
    getAll()        { return getAll(this.KEY).filter(p => p.status !== 'deleted'); },
    getActive()     { return this.getAll().filter(p => p.status === 'active'); },
    getById(id)     { return getById(this.KEY, id); },
    add(p)          { p.status = p.status || 'active'; return add(this.KEY, p); },
    update(id, d)   { return update(this.KEY, id, d); },
    remove(id)      { return update(this.KEY, id, { status: 'deleted' }); },
  };

  const Designs = {
    KEY: 'pc_designs',
    getAll()        { return getAll(this.KEY); },
    getById(id)     { return getById(this.KEY, id); },
    add(d)          { return add(this.KEY, d); },
    update(id, d)   { return update(this.KEY, id, d); },
    remove(id)      { return remove(this.KEY, id); },
  };

  const Cart = {
    KEY: 'pc_cart',
    getAll()        { return getAll(this.KEY); },
    add(item)       { return add(this.KEY, item); },
    update(id, d)   { return update(this.KEY, id, d); },
    remove(id)      { remove(this.KEY, id); },
    clear()         { _set(this.KEY, []); },
    getTotal() {
      return this.getAll().reduce((sum, item) => {
        const design = Designs.getById(item.designId);
        if (!design) return sum;
        const carrier = Carriers.getById(design.carrierId);
        const carrierPrice = carrier ? carrier.price : 0;
        const patchesPrice = [...(design.frontPatches || []), ...(design.backPatches || [])]
          .reduce((s, p) => {
            const patch = Patches.getById(p.patchId);
            return s + (patch ? patch.price : 0);
          }, 0);
        return sum + (carrierPrice + patchesPrice) * (item.quantity || 1);
      }, 0);
    }
  };

  const Orders = {
    KEY: 'pc_orders',
    getAll()        { return getAll(this.KEY); },
    getById(id)     { return getById(this.KEY, id); },
    add(o)          { o.status = o.status || 'pending'; return add(this.KEY, o); },
    update(id, d)   { return update(this.KEY, id, d); },
  };

  const Addresses = {
    KEY: 'pc_addresses',
    getAll()        { return getAll(this.KEY); },
    getById(id)     { return getById(this.KEY, id); },
    add(a)          { return add(this.KEY, a); },
    update(id, d)   { return update(this.KEY, id, d); },
    remove(id)      { remove(this.KEY, id); },
  };

  // ---- Compute design price ----
  function getDesignPrice(design) {
    if (!design) return 0;
    const carrier = Carriers.getById(design.carrierId);
    const carrierPrice = carrier ? carrier.price : 0;
    const allPatches = [...(design.frontPatches || []), ...(design.backPatches || [])];
    const patchesPrice = allPatches.reduce((s, p) => {
      const patch = Patches.getById(p.patchId);
      return s + (patch ? patch.price : 0);
    }, 0);
    return carrierPrice + patchesPrice;
  }

  return { Carriers, Patches, Designs, Cart, Orders, Addresses, getDesignPrice };
})();


// ==========================================
// Sample Data Seeding
// ==========================================
function seedSampleData() {
  if (localStorage.getItem('pc_seeded')) return;

  // ---- SVG Carrier generators ----
  function carrierSVG(w, h, color, label, detail) {
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="${w}" height="${h}" rx="12" fill="${color}"/>
      <rect x="4" y="4" width="${w-8}" height="${h-8}" rx="10" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="2"/>
      ${detail || ''}
      <text x="${w/2}" y="${h/2+6}" text-anchor="middle" font-family="Arial" font-size="14" fill="#fff" opacity="0.8">${label}</text>
    </svg>`)}`;
  }

  // ---- SVG Patch generators ----
  function patchSVG(content, size) {
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${content}</svg>`)}`;
  }

  // 3 Carriers
  const carriers = [
    {
      name: 'Passport Holder',
      nameZh: '护照夹',
      frontImage: carrierSVG(280, 200, '#C8956C',  'PASSPORT', '<rect x="60" y="30" width="160" height="10" rx="5" fill="#fff" opacity="0.2"/>'),
      backImage:  carrierSVG(280, 200, '#B8845C',  'BACK'),
      realWidth: 140, realHeight: 100,
      patchArea: { x: 10, y: 10, w: 120, h: 80 },
      backPatchArea: { x: 10, y: 10, w: 120, h: 80 },
      color: 'brown', price: 29.90, status: 'active'
    },
    {
      name: 'Pencil Case',
      nameZh: '笔袋',
      frontImage: carrierSVG(400, 160, '#A7C4A0', 'PENCIL CASE', '<line x1="20" y1="80" x2="380" y2="80" stroke="#fff" stroke-opacity="0.15" stroke-width="40"/>'),
      backImage:  carrierSVG(400, 160, '#97B490', 'BACK'),
      realWidth: 200, realHeight: 80,
      patchArea: { x: 15, y: 10, w: 170, h: 60 },
      backPatchArea: { x: 15, y: 10, w: 170, h: 60 },
      color: 'green', price: 24.90, status: 'active'
    },
    {
      name: 'Laptop Sleeve',
      nameZh: '电脑包',
      frontImage: carrierSVG(500, 360, '#6B7B8D', 'LAPTOP SLEEVE', '<rect x="40" y="40" width="420" height="280" rx="8" fill="#fff" opacity="0.05"/>'),
      backImage:  carrierSVG(500, 360, '#5B6B7D', 'BACK'),
      realWidth: 350, realHeight: 250,
      patchArea: { x: 25, y: 25, w: 300, h: 200 },
      backPatchArea: { x: 25, y: 25, w: 300, h: 200 },
      color: 'gray', price: 49.90, status: 'active'
    }
  ];

  // 10 Patches
  const patches = [
    {
      name: 'Daisy', nameZh: '小雏菊',
      image: patchSVG('<circle cx="35" cy="35" r="8" fill="#FFD700"/>' +
        [0,60,120,180,240,300].map(a => `<ellipse cx="${35+18*Math.cos(a*Math.PI/180)}" cy="${35+18*Math.sin(a*Math.PI/180)}" rx="8" ry="12" fill="white" transform="rotate(${a},${35+18*Math.cos(a*Math.PI/180)},${35+18*Math.sin(a*Math.PI/180)})"/>`).join(''), 70),
      realWidth: 35, realHeight: 35, category: 'floral', color: 'yellow', price: 3.90, status: 'active'
    },
    {
      name: 'Rose', nameZh: '玫瑰',
      image: patchSVG('<circle cx="40" cy="40" r="18" fill="#E84057"/><circle cx="40" cy="40" r="12" fill="#D63050"/><circle cx="40" cy="40" r="6" fill="#C82040"/><ellipse cx="28" cy="55" rx="10" ry="6" fill="#4A7C59"/><ellipse cx="52" cy="55" rx="10" ry="6" fill="#4A7C59"/>', 80),
      realWidth: 40, realHeight: 40, category: 'floral', color: 'red', price: 4.50, status: 'active'
    },
    {
      name: 'Kitty', nameZh: '小猫',
      image: patchSVG('<ellipse cx="30" cy="42" rx="20" ry="22" fill="#B0B0B0"/><circle cx="30" cy="32" r="16" fill="#C0C0C0"/><polygon points="16,20 14,4 26,16" fill="#C0C0C0"/><polygon points="44,20 46,4 34,16" fill="#C0C0C0"/><circle cx="24" cy="30" r="3" fill="#333"/><circle cx="36" cy="30" r="3" fill="#333"/><ellipse cx="30" cy="36" rx="3" ry="2" fill="#FFB6C1"/><line x1="10" y1="34" x2="20" y2="33" stroke="#999" stroke-width="1"/><line x1="40" y1="33" x2="50" y2="34" stroke="#999" stroke-width="1"/>', 60),
      realWidth: 30, realHeight: 35, category: 'animal', color: 'gray', price: 4.90, status: 'active'
    },
    {
      name: 'Butterfly', nameZh: '蝴蝶',
      image: patchSVG('<ellipse cx="20" cy="30" rx="16" ry="20" fill="#5B9BD5" opacity="0.8"/><ellipse cx="50" cy="30" rx="16" ry="20" fill="#5B9BD5" opacity="0.8"/><ellipse cx="22" cy="42" rx="10" ry="14" fill="#7BC5E8" opacity="0.7"/><ellipse cx="48" cy="42" rx="10" ry="14" fill="#7BC5E8" opacity="0.7"/><rect x="34" y="15" width="2" height="40" rx="1" fill="#444"/><line x1="35" y1="15" x2="28" y2="5" stroke="#444" stroke-width="1.5"/><line x1="35" y1="15" x2="42" y2="5" stroke="#444" stroke-width="1.5"/>', 70),
      realWidth: 35, realHeight: 30, category: 'animal', color: 'blue', price: 4.20, status: 'active'
    },
    {
      name: 'Star', nameZh: '星星',
      image: patchSVG('<polygon points="25,2 31,18 50,18 35,28 40,46 25,35 10,46 15,28 0,18 19,18" fill="#FFD700" stroke="#E8C200" stroke-width="1"/>', 50),
      realWidth: 25, realHeight: 25, category: 'geometric', color: 'gold', price: 2.90, status: 'active'
    },
    {
      name: 'Heart', nameZh: '爱心',
      image: patchSVG('<path d="M28,50 C28,50 4,32 4,16 C4,6 14,2 22,10 L28,16 L34,10 C42,2 52,6 52,16 C52,32 28,50 28,50Z" fill="#FF6B6B" stroke="#E85555" stroke-width="1"/>', 56),
      realWidth: 28, realHeight: 28, category: 'geometric', color: 'red', price: 2.90, status: 'active'
    },
    {
      name: 'Moon', nameZh: '月亮',
      image: patchSVG('<path d="M38,5 A25,25 0 1,1 38,65 A18,18 0 1,0 38,5Z" fill="#FFE566"/><circle cx="20" cy="22" r="2" fill="#FFD700" opacity="0.5"/><circle cx="15" cy="40" r="1.5" fill="#FFD700" opacity="0.5"/>', 70),
      realWidth: 30, realHeight: 35, category: 'nature', color: 'yellow', price: 3.50, status: 'active'
    },
    {
      name: 'Rainbow', nameZh: '彩虹',
      image: patchSVG(
        ['#FF6B6B','#FFA94D','#FFD93D','#6BCB77','#4D96FF','#9B59B6'].map((c,i) =>
          `<path d="M5,${45-i*2} A${40-i*6},${35-i*5} 0 0,1 ${85},${45-i*2}" fill="none" stroke="${c}" stroke-width="4"/>`
        ).join('') + '<circle cx="10" cy="45" r="6" fill="white" opacity="0.6"/><circle cx="80" cy="45" r="8" fill="white" opacity="0.6"/>', 90),
      realWidth: 45, realHeight: 25, category: 'nature', color: 'multicolor', price: 4.50, status: 'active'
    },
    {
      name: 'LOVE', nameZh: 'LOVE字母',
      image: patchSVG('<text x="50" y="30" text-anchor="middle" font-family="Georgia,serif" font-size="28" font-weight="bold" fill="#FF8FA3" stroke="#E8758A" stroke-width="0.5">LOVE</text>', 100),
      realWidth: 50, realHeight: 20, category: 'text', color: 'pink', price: 3.90, status: 'active'
    },
    {
      name: 'Bouquet', nameZh: '小花束',
      image: patchSVG(
        '<rect x="30" y="55" width="20" height="25" rx="3" fill="#8FBC8F"/>' +
        '<circle cx="28" cy="25" r="12" fill="#DDA0DD"/><circle cx="52" cy="25" r="12" fill="#FFB6C1"/>' +
        '<circle cx="40" cy="18" r="13" fill="#E8A0E8"/><circle cx="34" cy="38" r="10" fill="#B0A0D0"/>' +
        '<circle cx="48" cy="38" r="10" fill="#F0C0D0"/>' +
        '<circle cx="40" cy="30" r="8" fill="#D890D8"/>' +
        '<line x1="35" y1="55" x2="32" y2="80" stroke="#6B8E6B" stroke-width="2"/>' +
        '<line x1="45" y1="55" x2="48" y2="80" stroke="#6B8E6B" stroke-width="2"/>', 80),
      realWidth: 40, realHeight: 45, category: 'floral', color: 'purple', price: 5.90, status: 'active'
    },
  ];

  carriers.forEach(c => DB.Carriers.add(c));
  patches.forEach(p => DB.Patches.add(p));
  localStorage.setItem('pc_seeded', '1');
}

// Auto-seed on load
seedSampleData();


// ---- Shared utility: generate nav bar ----
function renderNav(activePage) {
  const cartCount = DB.Cart.getAll().reduce((s, i) => s + (i.quantity || 1), 0);
  const pages = [
    { id: 'home',    label: 'PatchCraft',  href: 'index.html',    isLogo: true },
    { id: 'create',  label: 'Create',      href: 'create.html' },
    { id: 'cart',    label: `Cart${cartCount ? ` (${cartCount})` : ''}`, href: 'cart.html' },
    { id: 'user',    label: 'My Account',  href: 'user.html' },
  ];
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  nav.innerHTML = `<div class="nav-inner">
    ${pages.map(p => p.isLogo
      ? `<a href="${p.href}" class="nav-logo">${p.label}</a>`
      : `<a href="${p.href}" class="nav-link${activePage === p.id ? ' active' : ''}">${p.label}</a>`
    ).join('')}
  </div>`;
}

// Format price
function fmtPrice(n) {
  return '$' + Number(n || 0).toFixed(2);
}

// Toast notification
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2500);
}
