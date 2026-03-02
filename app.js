// ========== CONSTANTS ==========
const STORAGE_KEY = 'fitlog_data';
const CUSTOM_EX_KEY = 'fitlog_custom_exercises';

const EXERCISE_PRESETS = {
  '胸部': ['杠铃卧推','哑铃卧推','上斜杠铃卧推','上斜哑铃卧推','下斜卧推','哑铃飞鸟','龙门架夹胸','蝴蝶机夹胸','俯卧撑'],
  '背部': ['引体向上','高位下拉','杠铃划船','哑铃单臂划船','坐姿划船','T杠划船','直臂下压','山羊挺身'],
  '肩部': ['杠铃推举','哑铃推举','阿诺德推举','哑铃侧平举','前平举','反向飞鸟','绳索面拉','耸肩'],
  '腿部': ['杠铃深蹲','前蹲','哈克深蹲','腿举','腿屈伸','腿弯举','罗马尼亚硬拉','保加利亚分腿蹲','臀推','小腿提踵'],
  '手臂': ['杠铃弯举','哑铃弯举','锤式弯举','牧师椅弯举','绳索三头下压','过头臂屈伸','窄距卧推','仰卧臂屈伸'],
  '核心': ['卷腹','平板支撑','俄罗斯转体','悬垂举腿','死虫','腹轮','侧平板'],
  '复合': ['硬拉','相扑硬拉','高翻','壶铃摆荡','土耳其起立','农夫行走']
};

const TEST_FIELDS = ['weight','bodyFat','muscle','bmi','chest','waist','hip','thigh','arm','calf','squat','bench','deadlift','pullup','plank','run1k'];

const TEST_FIELD_LABELS = {
  weight:'体重(kg)', bodyFat:'体脂率(%)', muscle:'肌肉量(kg)', bmi:'BMI',
  chest:'胸围(cm)', waist:'腰围(cm)', hip:'臀围(cm)', thigh:'大腿围(cm)', arm:'上臂围(cm)', calf:'小腿围(cm)',
  squat:'深蹲1RM(kg)', bench:'卧推1RM(kg)', deadlift:'硬拉1RM(kg)',
  pullup:'引体向上(个)', plank:'平板支撑(秒)', run1k:'1km跑(秒)'
};

const OCR_PATTERNS = [
  { field:'weight', re:[/体重[^\d]{0,5}(\d+\.?\d*)/,/weight[^\d]{0,5}(\d+\.?\d*)/i,/(\d{2,3}\.\d)\s*kg/i] },
  { field:'bodyFat', re:[/体脂[率]?[^\d]{0,5}(\d+\.?\d*)/,/body\s*fat[^\d]{0,5}(\d+\.?\d*)/i,/脂肪[率]?[^\d]{0,5}(\d+\.?\d*)/] },
  { field:'muscle', re:[/肌肉[量]?[^\d]{0,5}(\d+\.?\d*)/,/muscle[^\d]{0,5}(\d+\.?\d*)/i,/骨骼肌[^\d]{0,5}(\d+\.?\d*)/] },
  { field:'bmi', re:[/bmi[^\d]{0,5}(\d+\.?\d*)/i] },
  { field:'chest', re:[/胸围[^\d]{0,5}(\d+\.?\d*)/] },
  { field:'waist', re:[/腰围[^\d]{0,5}(\d+\.?\d*)/] },
  { field:'hip', re:[/臀围[^\d]{0,5}(\d+\.?\d*)/] },
  { field:'thigh', re:[/大腿[围]?[^\d]{0,5}(\d+\.?\d*)/,/腿围[^\d]{0,5}(\d+\.?\d*)/] },
  { field:'arm', re:[/[上]?臂围[^\d]{0,5}(\d+\.?\d*)/] },
  { field:'calf', re:[/小腿[围]?[^\d]{0,5}(\d+\.?\d*)/] },
];

// ========== DATA LAYER ==========
function getData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { tests:[], sessions:[] }; }
  catch { return { tests:[], sessions:[] }; }
}
function setData(d) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }

function getCustomExercises() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_EX_KEY)) || []; }
  catch { return []; }
}
function addCustomExercise(name) {
  const list = getCustomExercises();
  if (!list.includes(name)) { list.push(name); localStorage.setItem(CUSTOM_EX_KEY, JSON.stringify(list)); }
}

// ========== STATE ==========
let exerciseCounter = 0;
let editingRecord = null; // { type:'test'|'session', id:number }
let charts = {};
let ocrWorker = null;

// ========== NAVIGATION ==========
function switchMode(mode) {
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('trainerMode').style.display = mode === 'trainer' ? '' : 'none';
  document.getElementById('clientMode').style.display = mode === 'client' ? '' : 'none';
  if (mode === 'client') renderClientView();
}

function switchTab(mode, tab) {
  const parent = document.getElementById(mode + 'Mode');
  parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  parent.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(mode + '-' + tab).classList.add('active');
  if (mode === 'trainer' && tab === 'history') renderHistory();
  if (mode === 'client') renderClientView();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ========== QUICK TAGS ==========
document.querySelectorAll('.quick-tags').forEach(container => {
  container.addEventListener('click', e => {
    if (!e.target.classList.contains('quick-tag')) return;
    const multi = ['bodyPartTags','purposeTags'].includes(container.id);
    if (!multi) container.querySelectorAll('.quick-tag').forEach(t => t.classList.remove('selected'));
    e.target.classList.toggle('selected');
  });
});

function getSelectedTags(id) {
  return [...document.querySelectorAll('#'+id+' .quick-tag.selected')].map(t => t.dataset.v);
}
function clearTags(id) {
  document.querySelectorAll('#'+id+' .quick-tag').forEach(t => t.classList.remove('selected'));
}
function setSelectedTags(id, vals) {
  document.querySelectorAll('#'+id+' .quick-tag').forEach(t => {
    t.classList.toggle('selected', vals.includes(t.dataset.v));
  });
}

// ========== EXERCISE SELECT OPTIONS ==========
function buildExerciseOptions() {
  let html = '<option value="">选择动作...</option>';
  for (const [group, items] of Object.entries(EXERCISE_PRESETS)) {
    html += `<optgroup label="${group}">`;
    items.forEach(name => { html += `<option value="${name}">${name}</option>`; });
    html += '</optgroup>';
  }
  const custom = getCustomExercises();
  if (custom.length) {
    html += '<optgroup label="我的动作">';
    custom.forEach(name => { html += `<option value="${name}">${name}</option>`; });
    html += '</optgroup>';
  }
  html += '<option value="__custom__">+ 其他（手动输入）</option>';
  return html;
}

// ========== EXERCISE BUILDER ==========
function addExercise(prefill) {
  exerciseCounter++;
  const id = exerciseCounter;
  const div = document.createElement('div');
  div.className = 'exercise-block';
  div.id = 'ex_' + id;

  let nameHtml;
  if (prefill && prefill.customName) {
    nameHtml = `<input class="exercise-custom-input" value="${prefill.customName}" id="exCustom_${id}">
      <select class="exercise-select" id="exSel_${id}" style="display:none" onchange="onExSelect(${id})">${buildExerciseOptions()}</select>`;
  } else {
    nameHtml = `<select class="exercise-select" id="exSel_${id}" onchange="onExSelect(${id})">${buildExerciseOptions()}</select>
      <input class="exercise-custom-input" id="exCustom_${id}" style="display:none" placeholder="输入动作名称">`;
  }

  div.innerHTML = `
    <div class="exercise-header">
      ${nameHtml}
      <button class="remove-btn" onclick="document.getElementById('ex_${id}').remove()">&times;</button>
    </div>
    <div id="exGroups_${id}"></div>
    <button class="add-set-btn" onclick="addSetGroup(${id})">+ 添加不同重量</button>
  `;
  document.getElementById('exerciseList').appendChild(div);

  // Pre-fill name
  if (prefill && prefill.name) {
    const sel = document.getElementById('exSel_' + id);
    const allNames = Object.values(EXERCISE_PRESETS).flat().concat(getCustomExercises());
    if (allNames.includes(prefill.name)) {
      sel.value = prefill.name;
    } else {
      sel.style.display = 'none';
      const inp = document.getElementById('exCustom_' + id);
      inp.style.display = ''; inp.value = prefill.name;
    }
  }

  // Pre-fill sets as groups
  if (prefill && prefill.setGroups) {
    prefill.setGroups.forEach(g => addSetGroup(id, g));
  } else {
    addSetGroup(id);
  }
}

function onExSelect(exId) {
  const sel = document.getElementById('exSel_' + exId);
  if (sel.value === '__custom__') {
    sel.style.display = 'none';
    const inp = document.getElementById('exCustom_' + exId);
    inp.style.display = ''; inp.focus();
  }
}

function addSetGroup(exId, prefill) {
  const container = document.getElementById('exGroups_' + exId);
  const row = document.createElement('div');
  row.className = 'set-group-row';
  const w = prefill ? prefill.weight : '';
  const r = prefill ? prefill.reps : '';
  const c = prefill ? prefill.count : 4;
  row.innerHTML = `
    <input class="form-input-sm sg-weight" type="number" placeholder="重量" step="0.5" value="${w}">
    <span class="unit">kg</span><span class="x">&times;</span>
    <input class="form-input-sm sg-reps" type="number" placeholder="次数" value="${r}">
    <span class="unit">次</span><span class="x">&times;</span>
    <select class="set-count-select sg-count">
      ${[1,2,3,4,5,6,7,8].map(n => `<option value="${n}" ${n===c?'selected':''}>${n}组</option>`).join('')}
    </select>
    ${container.children.length > 0 ? '<button class="remove-btn" onclick="this.parentElement.remove()">&times;</button>' : ''}
  `;
  container.appendChild(row);
}

function collectExercises() {
  const exercises = [];
  document.querySelectorAll('.exercise-block').forEach(block => {
    const id = block.id.split('_')[1];
    const sel = document.getElementById('exSel_' + id);
    const cust = document.getElementById('exCustom_' + id);
    let name = '';
    if (cust && cust.style.display !== 'none' && cust.value.trim()) {
      name = cust.value.trim();
      addCustomExercise(name);
    } else if (sel && sel.value && sel.value !== '__custom__') {
      name = sel.value;
    }
    if (!name) return;

    const sets = [];
    block.querySelectorAll('.set-group-row').forEach(row => {
      const w = parseFloat(row.querySelector('.sg-weight').value) || 0;
      const r = parseInt(row.querySelector('.sg-reps').value) || 0;
      const c = parseInt(row.querySelector('.sg-count').value) || 1;
      for (let i = 0; i < c; i++) { if (w > 0 || r > 0) sets.push({ weight:w, reps:r }); }
    });
    exercises.push({ name, sets });
  });
  return exercises;
}

function compressSets(sets) {
  const groups = [];
  sets.forEach(s => {
    const last = groups[groups.length - 1];
    if (last && last.weight === s.weight && last.reps === s.reps) last.count++;
    else groups.push({ weight:s.weight, reps:s.reps, count:1 });
  });
  return groups;
}

// ========== OCR ==========
let tesseractLoading = null;

async function loadTesseract() {
  if (window.Tesseract) return;
  if (tesseractLoading) return tesseractLoading;
  tesseractLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4.1.4/dist/tesseract.min.js';
    s.onload = () => {
      if (window.Tesseract) resolve();
      else reject(new Error('Tesseract 加载失败'));
    };
    s.onerror = () => reject(new Error('CDN 脚本加载失败，请检查网络'));
    document.head.appendChild(s);
  });
  return tesseractLoading;
}

async function handleOCR(inputEl, previewEl, statusEl, barEl, resultsEl, type) {
  const file = inputEl.files[0];
  if (!file) return;

  // Show preview
  previewEl.style.display = '';
  const imgUrl = URL.createObjectURL(file);
  previewEl.querySelector('img').src = imgUrl;
  statusEl.textContent = '正在加载识别引擎（首次约需10秒）...';
  statusEl.style.display = '';
  barEl.style.display = '';
  barEl.querySelector('.ocr-bar-fill').style.width = '5%';
  resultsEl.innerHTML = '';

  try {
    await loadTesseract();
    barEl.querySelector('.ocr-bar-fill').style.width = '15%';
    statusEl.textContent = '正在初始化语言包...';

    // Tesseract.js v4 API: create → loadLanguage → initialize → recognize
    const worker = await Tesseract.createWorker({
      logger: m => {
        if (m.status === 'loading language traineddata') {
          barEl.querySelector('.ocr-bar-fill').style.width = (15 + m.progress * 25) + '%';
          statusEl.textContent = '正在下载语言包... ' + Math.round(m.progress * 100) + '%';
        } else if (m.status === 'initializing api') {
          barEl.querySelector('.ocr-bar-fill').style.width = '45%';
          statusEl.textContent = '正在初始化...';
        } else if (m.status === 'recognizing text') {
          barEl.querySelector('.ocr-bar-fill').style.width = (45 + m.progress * 50) + '%';
          statusEl.textContent = '正在识别文字... ' + Math.round(m.progress * 100) + '%';
        }
      }
    });
    await worker.loadLanguage('chi_sim+eng');
    await worker.initialize('chi_sim+eng');

    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();

    barEl.querySelector('.ocr-bar-fill').style.width = '100%';
    console.log('[OCR result]', text);

    if (type === 'test') {
      parseTestOCR(text, statusEl, resultsEl);
    } else {
      parseSessionOCR(text, statusEl, resultsEl);
    }
  } catch(err) {
    console.error('[OCR error]', err);
    statusEl.textContent = '识别失败: ' + (err.message || '未知错误') + '，请手动填写';
    barEl.querySelector('.ocr-bar-fill').style.width = '0%';
  }
}

function parseTestOCR(text, statusEl, resultsEl) {
  const found = [];
  OCR_PATTERNS.forEach(({ field, re }) => {
    for (const r of re) {
      const m = text.match(r);
      if (m) {
        const val = parseFloat(m[1]);
        if (!isNaN(val)) {
          found.push({ field, val });
          const el = document.getElementById('t_' + field);
          if (el) el.value = val;
          break;
        }
      }
    }
  });
  if (found.length) {
    statusEl.textContent = `已识别 ${found.length} 项数据，已自动填入`;
    resultsEl.innerHTML = found.map(f =>
      `<div class="ocr-item"><span class="field">${TEST_FIELD_LABELS[f.field]}</span><span class="value">${f.val}</span></div>`
    ).join('');
  } else {
    statusEl.textContent = '未能识别到数据，请手动填写';
  }
}

function parseSessionOCR(text, statusEl, resultsEl) {
  const allNames = Object.values(EXERCISE_PRESETS).flat();
  const foundExercises = allNames.filter(name => text.includes(name));
  if (foundExercises.length) {
    statusEl.textContent = `识别到 ${foundExercises.length} 个动作，已添加`;
    document.getElementById('exerciseList').innerHTML = '';
    exerciseCounter = 0;
    foundExercises.forEach(name => addExercise({ name }));
    resultsEl.innerHTML = foundExercises.map(n => `<div class="ocr-item"><span class="field">动作</span><span class="value">${n}</span></div>`).join('');
  } else {
    statusEl.textContent = '未识别到已知动作，请手动选择';
  }
}

// ========== SAVE TEST ==========
function saveTest() {
  const date = document.getElementById('testDate').value;
  if (!date) { showToast('请选择日期'); return; }

  const record = { date, tags:getSelectedTags('testTags'), notes:document.getElementById('t_notes').value.trim() };
  TEST_FIELDS.forEach(f => {
    const val = parseFloat(document.getElementById('t_'+f).value);
    if (!isNaN(val)) record[f] = val;
  });

  const data = getData();
  if (editingRecord && editingRecord.type === 'test') {
    const idx = data.tests.findIndex(t => t.id === editingRecord.id);
    if (idx >= 0) { record.id = editingRecord.id; data.tests[idx] = record; }
    editingRecord = null;
    document.getElementById('testSaveBtn').textContent = '保存体测记录';
    document.getElementById('testCancelBtn').style.display = 'none';
  } else {
    record.id = Date.now();
    data.tests.push(record);
  }
  data.tests.sort((a,b) => a.date.localeCompare(b.date));
  setData(data);
  resetTestForm();
  showToast('体测记录已保存');
}

function resetTestForm() {
  TEST_FIELDS.forEach(f => document.getElementById('t_'+f).value = '');
  document.getElementById('t_notes').value = '';
  clearTags('testTags');
  const preview = document.getElementById('testOcrPreview');
  if (preview) preview.style.display = 'none';
}

// ========== SAVE SESSION ==========
function saveSession() {
  const date = document.getElementById('sessionDate').value;
  if (!date) { showToast('请选择日期'); return; }

  const exercises = collectExercises();
  const record = {
    date,
    purposes: getSelectedTags('purposeTags'),
    bodyParts: getSelectedTags('bodyPartTags'),
    exercises,
    cardio: {
      types: getSelectedTags('cardioTypeTags'),
      duration: parseFloat(document.getElementById('cardioDuration').value) || 0,
      distance: parseFloat(document.getElementById('cardioDistance').value) || 0,
      hr: parseInt(document.getElementById('cardioHR').value) || 0,
    },
    notes: document.getElementById('sessionNotes').value.trim(),
    totalVolume: exercises.reduce((s,ex) => s + ex.sets.reduce((ss,set) => ss + set.weight*set.reps, 0), 0)
  };

  const data = getData();
  if (editingRecord && editingRecord.type === 'session') {
    const idx = data.sessions.findIndex(s => s.id === editingRecord.id);
    if (idx >= 0) { record.id = editingRecord.id; data.sessions[idx] = record; }
    editingRecord = null;
    document.getElementById('sessionSaveBtn').textContent = '保存训练记录';
    document.getElementById('sessionCancelBtn').style.display = 'none';
  } else {
    record.id = Date.now();
    data.sessions.push(record);
  }
  data.sessions.sort((a,b) => a.date.localeCompare(b.date));
  setData(data);
  resetSessionForm();
  showToast('训练记录已保存');
}

function resetSessionForm() {
  document.getElementById('exerciseList').innerHTML = '';
  exerciseCounter = 0;
  document.getElementById('cardioDuration').value = '';
  document.getElementById('cardioDistance').value = '';
  document.getElementById('cardioHR').value = '';
  document.getElementById('sessionNotes').value = '';
  clearTags('purposeTags');
  clearTags('bodyPartTags');
  clearTags('cardioTypeTags');
  addExercise();
  const preview = document.getElementById('sessionOcrPreview');
  if (preview) preview.style.display = 'none';
}

function cancelEdit() {
  editingRecord = null;
  document.getElementById('testSaveBtn').textContent = '保存体测记录';
  document.getElementById('testCancelBtn').style.display = 'none';
  document.getElementById('sessionSaveBtn').textContent = '保存训练记录';
  document.getElementById('sessionCancelBtn').style.display = 'none';
  resetTestForm();
  resetSessionForm();
  showToast('已取消编辑');
}

// ========== EDIT ==========
function startEditTest(id) {
  const data = getData();
  const r = data.tests.find(t => t.id === id);
  if (!r) return;
  closeModal();
  editingRecord = { type:'test', id };

  // Switch to trainer mode, test tab
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mode-btn')[0].classList.add('active');
  document.getElementById('trainerMode').style.display = '';
  document.getElementById('clientMode').style.display = 'none';
  const parent = document.getElementById('trainerMode');
  parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  parent.querySelectorAll('.tab-btn')[0].classList.add('active');
  parent.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('trainer-test').classList.add('active');

  // Fill form
  document.getElementById('testDate').value = r.date;
  setSelectedTags('testTags', r.tags || []);
  TEST_FIELDS.forEach(f => {
    document.getElementById('t_'+f).value = r[f] !== undefined ? r[f] : '';
  });
  document.getElementById('t_notes').value = r.notes || '';
  document.getElementById('testSaveBtn').textContent = '更新体测记录';
  document.getElementById('testCancelBtn').style.display = '';
  window.scrollTo(0, 0);
}

function startEditSession(id) {
  const data = getData();
  const r = data.sessions.find(s => s.id === id);
  if (!r) return;
  closeModal();
  editingRecord = { type:'session', id };

  // Switch to trainer mode, session tab
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mode-btn')[0].classList.add('active');
  document.getElementById('trainerMode').style.display = '';
  document.getElementById('clientMode').style.display = 'none';
  const parent = document.getElementById('trainerMode');
  parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  parent.querySelectorAll('.tab-btn')[1].classList.add('active');
  parent.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('trainer-session').classList.add('active');

  // Fill form
  document.getElementById('sessionDate').value = r.date;
  setSelectedTags('purposeTags', r.purposes || []);
  setSelectedTags('bodyPartTags', r.bodyParts || []);

  // Exercises
  document.getElementById('exerciseList').innerHTML = '';
  exerciseCounter = 0;
  r.exercises.forEach(ex => {
    addExercise({ name: ex.name, setGroups: compressSets(ex.sets) });
  });
  if (!r.exercises.length) addExercise();

  // Cardio
  setSelectedTags('cardioTypeTags', r.cardio ? r.cardio.types || [] : []);
  document.getElementById('cardioDuration').value = r.cardio && r.cardio.duration ? r.cardio.duration : '';
  document.getElementById('cardioDistance').value = r.cardio && r.cardio.distance ? r.cardio.distance : '';
  document.getElementById('cardioHR').value = r.cardio && r.cardio.hr ? r.cardio.hr : '';
  document.getElementById('sessionNotes').value = r.notes || '';
  document.getElementById('sessionSaveBtn').textContent = '更新训练记录';
  document.getElementById('sessionCancelBtn').style.display = '';
  window.scrollTo(0, 0);
}

// ========== HISTORY ==========
function renderHistory() {
  const data = getData();
  const el = document.getElementById('historyList');
  const all = [
    ...data.tests.map(t => ({...t, _type:'test'})),
    ...data.sessions.map(s => ({...s, _type:'session'}))
  ].sort((a,b) => b.date.localeCompare(a.date));

  if (!all.length) { el.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>暂无记录，开始录入吧</p></div>'; return; }

  el.innerHTML = all.map(r => {
    if (r._type === 'test') {
      return `<div class="record-item type-test" onclick="showTestDetail(${r.id})">
        <div class="record-date">${r.date}</div>
        <div class="record-summary">体测记录${r.weight ? ' · '+r.weight+'kg' : ''}</div>
        <div class="record-tags">${(r.tags||[]).map(t=>`<span class="record-tag t-test">${t}</span>`).join('')}<span class="record-tag t-test">体测</span></div>
      </div>`;
    } else {
      return `<div class="record-item type-session" onclick="showSessionDetail(${r.id})">
        <div class="record-date">${r.date}</div>
        <div class="record-summary">${r.exercises.map(e=>e.name).join(' / ')||'训练'}${r.totalVolume?' · '+Math.round(r.totalVolume)+'kg':''}</div>
        <div class="record-tags">${(r.purposes||[]).map(p=>`<span class="record-tag t-purpose">${p}</span>`).join('')}${(r.bodyParts||[]).map(p=>`<span class="record-tag t-part">${p}</span>`).join('')}</div>
      </div>`;
    }
  }).join('');
}

// ========== MODALS ==========
function openModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('show'); }

function showTestDetail(id) {
  const data = getData();
  const r = data.tests.find(t => t.id === id);
  if (!r) return;
  let rows = Object.entries(TEST_FIELD_LABELS).filter(([k])=>r[k]!==undefined).map(([k,label])=>
    `<tr><td>${label}</td><td><strong>${r[k]}</strong></td></tr>`
  ).join('');
  openModal(`
    <h3>体测记录</h3><div class="modal-subtitle">${r.date}${(r.tags||[]).length?' · '+r.tags.join(', '):''}</div>
    <table class="detail-table">${rows}</table>
    ${r.notes?`<div class="detail-section" style="margin-top:12px"><div class="detail-label">备注</div><p style="font-size:13px;color:var(--text-sec)">${r.notes}</p></div>`:''}
    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" onclick="startEditTest(${r.id})">编辑</button>
      <button class="btn-danger-text" onclick="deleteRecord('test',${r.id})">删除</button>
    </div>
  `);
}

function showSessionDetail(id) {
  const data = getData();
  const r = data.sessions.find(s => s.id === id);
  if (!r) return;
  let exHtml = r.exercises.map(ex => {
    let setsHtml = ex.sets.map((s,i)=>`<tr><td>第${i+1}组</td><td>${s.weight}kg</td><td>${s.reps}次</td><td>${Math.round(s.weight*s.reps)}kg</td></tr>`).join('');
    const vol = ex.sets.reduce((s,set)=>s+set.weight*set.reps,0);
    return `<div class="detail-section"><div class="detail-label">${ex.name} · ${Math.round(vol)}kg</div><table class="detail-table"><tr><th>组</th><th>重量</th><th>次数</th><th>容量</th></tr>${setsHtml}</table></div>`;
  }).join('');
  let cardioHtml = '';
  if (r.cardio && (r.cardio.duration || r.cardio.distance)) {
    cardioHtml = `<div class="detail-section"><div class="detail-label">有氧</div><p style="font-size:13px;color:var(--text-sec)">${(r.cardio.types||[]).join('、')} · ${r.cardio.duration}分钟${r.cardio.distance?' · '+r.cardio.distance+'km':''}${r.cardio.hr?' · 心率'+r.cardio.hr:''}</p></div>`;
  }
  openModal(`
    <h3>训练记录</h3><div class="modal-subtitle">${r.date} · ${(r.purposes||[]).join(' ')} · ${(r.bodyParts||[]).join(' ')}</div>
    <div class="detail-section"><div class="detail-label">总容量</div><div class="detail-volume">${Math.round(r.totalVolume)} kg</div></div>
    ${exHtml}${cardioHtml}
    ${r.notes?`<div class="detail-section"><div class="detail-label">教练备注</div><p style="font-size:13px;color:var(--text-sec)">${r.notes}</p></div>`:''}
    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" onclick="startEditSession(${r.id})">编辑</button>
      <button class="btn-danger-text" onclick="deleteRecord('session',${r.id})">删除</button>
    </div>
  `);
}

function deleteRecord(type, id) {
  if (!confirm('确认删除此记录？')) return;
  const data = getData();
  if (type==='test') data.tests = data.tests.filter(t=>t.id!==id);
  else data.sessions = data.sessions.filter(s=>s.id!==id);
  setData(data);
  closeModal(); renderHistory(); showToast('已删除');
}

// ========== CLIENT VIEW ==========
function renderClientView() {
  renderMetrics(); renderVolumeChart(); renderBodyChart();
  renderStrengthChart(); renderCircumChart();
  renderClientRecords(); renderTestComparison();
}

function renderMetrics() {
  const data = getData();
  const el = document.getElementById('metricsRow');
  const s = data.sessions, t = data.tests;
  const total = s.length;
  const vol = s.reduce((a,r)=>a+(r.totalVolume||0),0);
  const lw = t.length ? t[t.length-1].weight : null;
  const fw = t.length ? t[0].weight : null;
  const wc = (lw&&fw)?(lw-fw).toFixed(1):null;
  el.innerHTML = `
    <div class="metric-card"><div class="metric-value">${total}</div><div class="metric-label">训练次数</div></div>
    <div class="metric-card"><div class="metric-value">${vol>=1000?(vol/1000).toFixed(1)+'k':Math.round(vol)}</div><div class="metric-label">总负荷(kg)</div></div>
    <div class="metric-card"><div class="metric-value">${lw||'--'}</div><div class="metric-label">当前体重</div>${wc?`<div class="metric-change ${parseFloat(wc)>0?'up':'down'}">${parseFloat(wc)>0?'+':''}${wc}kg</div>`:''}</div>
  `;
}

// ===== Chart Helpers =====
const CC = {
  orange:'#FF5A00', orangeBg:'rgba(255,90,0,.12)',
  yellow:'#FFD600', yellowBg:'rgba(255,214,0,.15)',
  teal:'#00B894', tealBg:'rgba(0,184,148,.12)',
  blue:'#4A90D9', blueBg:'rgba(74,144,217,.12)',
  purple:'#7C5CFC', purpleBg:'rgba(124,92,252,.12)',
  pink:'#E84393', pinkBg:'rgba(232,67,147,.12)',
  red:'#FF4757', redBg:'rgba(255,71,87,.12)',
};

function baseOpts(extra={}) {
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ display:false } },
    scales:{
      x:{ ticks:{ color:'#999', font:{size:10} }, grid:{ color:'rgba(0,0,0,.04)' } },
      y:{ ticks:{ color:'#999', font:{size:10} }, grid:{ color:'rgba(0,0,0,.06)' } },
      ...extra
    }
  };
}

function buildLegend(chart, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = chart.data.datasets.map((ds,i) => {
    const c = ds.borderColor || ds.backgroundColor;
    const vis = chart.isDatasetVisible(i);
    return `<button class="legend-chip ${vis?'':'off'}" data-ci="${chart.canvas.id}" data-di="${i}">
      <span class="dot" style="background:${c}"></span>${ds.label}
    </button>`;
  }).join('');
}

document.addEventListener('click', e => {
  const chip = e.target.closest('.legend-chip');
  if (!chip) return;
  const chart = Chart.getChart(chip.dataset.ci);
  const idx = parseInt(chip.dataset.di);
  const vis = chart.isDatasetVisible(idx);
  chart.setDatasetVisibility(idx, !vis);
  chart.update();
  chip.classList.toggle('off');
});

function renderVolumeChart() {
  const data = getData(); const sessions = data.sessions;
  if (charts.volume) charts.volume.destroy();
  const ctx = document.getElementById('chartVolume');
  if (!ctx) return;
  if (!sessions.length) { ctx.parentElement.innerHTML='<div class="empty-state"><p>暂无训练数据</p></div>'; return; }
  charts.volume = new Chart(ctx, {
    type:'bar',
    data:{ labels:sessions.map(s=>s.date.slice(5)),
      datasets:[{ label:'总负荷', data:sessions.map(s=>s.totalVolume||0), backgroundColor:CC.yellowBg, borderColor:CC.yellow, borderWidth:2, borderRadius:6 }]
    }, options:baseOpts()
  });
}

function renderBodyChart() {
  const data=getData(); const tests=data.tests;
  if (charts.body) charts.body.destroy();
  const ctx=document.getElementById('chartBody');
  if (!ctx) return;
  if (!tests.length) { ctx.parentElement.innerHTML='<div class="empty-state"><p>暂无体测数据</p></div>'; return; }
  charts.body = new Chart(ctx, {
    type:'line',
    data:{ labels:tests.map(t=>t.date.slice(5)),
      datasets:[
        { label:'体重(kg)', data:tests.map(t=>t.weight??null), borderColor:CC.orange, backgroundColor:CC.orangeBg, tension:.3, fill:true, pointRadius:4, pointBackgroundColor:'#fff', pointBorderWidth:2, yAxisID:'y' },
        { label:'体脂率(%)', data:tests.map(t=>t.bodyFat??null), borderColor:CC.teal, backgroundColor:CC.tealBg, tension:.3, fill:true, pointRadius:4, pointBackgroundColor:'#fff', pointBorderWidth:2, yAxisID:'y1' }
      ]
    },
    options:baseOpts({
      y:{ position:'left', ticks:{color:'#999',font:{size:10}}, grid:{color:'rgba(0,0,0,.06)'} },
      y1:{ position:'right', ticks:{color:'#999',font:{size:10}}, grid:{drawOnChartArea:false} }
    })
  });
  buildLegend(charts.body, 'legendBody');
}

function renderStrengthChart() {
  const data=getData(); const tests=data.tests;
  if (charts.strength) charts.strength.destroy();
  const ctx=document.getElementById('chartStrength');
  if (!ctx) return;
  if (!tests.length) { ctx.parentElement.innerHTML='<div class="empty-state"><p>暂无体测数据</p></div>'; return; }
  charts.strength = new Chart(ctx, {
    type:'line',
    data:{ labels:tests.map(t=>t.date.slice(5)),
      datasets:[
        { label:'深蹲', data:tests.map(t=>t.squat??null), borderColor:CC.orange, tension:.3, pointRadius:4, pointBackgroundColor:'#fff', pointBorderWidth:2 },
        { label:'卧推', data:tests.map(t=>t.bench??null), borderColor:CC.blue, tension:.3, pointRadius:4, pointBackgroundColor:'#fff', pointBorderWidth:2 },
        { label:'硬拉', data:tests.map(t=>t.deadlift??null), borderColor:CC.purple, tension:.3, pointRadius:4, pointBackgroundColor:'#fff', pointBorderWidth:2 }
      ]
    },
    options:baseOpts()
  });
  buildLegend(charts.strength, 'legendStrength');
}

function renderCircumChart() {
  const data=getData(); const tests=data.tests;
  if (charts.circum) charts.circum.destroy();
  const ctx=document.getElementById('chartCircum');
  if (!ctx) return;
  if (!tests.length) { ctx.parentElement.innerHTML='<div class="empty-state"><p>暂无体测数据</p></div>'; return; }
  charts.circum = new Chart(ctx, {
    type:'line',
    data:{ labels:tests.map(t=>t.date.slice(5)),
      datasets:[
        { label:'胸围', data:tests.map(t=>t.chest??null), borderColor:CC.orange, tension:.3, pointRadius:3 },
        { label:'腰围', data:tests.map(t=>t.waist??null), borderColor:CC.red, tension:.3, pointRadius:3 },
        { label:'臀围', data:tests.map(t=>t.hip??null), borderColor:CC.teal, tension:.3, pointRadius:3 },
        { label:'上臂围', data:tests.map(t=>t.arm??null), borderColor:CC.yellow, tension:.3, pointRadius:3 },
        { label:'大腿围', data:tests.map(t=>t.thigh??null), borderColor:CC.pink, tension:.3, pointRadius:3 }
      ]
    },
    options:baseOpts()
  });
  buildLegend(charts.circum, 'legendCircum');
}

function renderClientRecords() {
  const data=getData(); const el=document.getElementById('clientRecordsList');
  const sessions=[...data.sessions].reverse();
  if (!sessions.length) { el.innerHTML='<div class="empty-state"><div class="icon">🏋️</div><p>暂无训练记录</p></div>'; return; }
  el.innerHTML = sessions.map(r=>`
    <div class="record-item type-session" onclick="showSessionDetail(${r.id})">
      <div class="record-date">${r.date}</div>
      <div class="record-summary">${r.exercises.map(e=>e.name).join(' / ')||'训练'} · ${Math.round(r.totalVolume)}kg</div>
      <div class="record-tags">${(r.purposes||[]).map(p=>`<span class="record-tag t-purpose">${p}</span>`).join('')}${(r.bodyParts||[]).map(p=>`<span class="record-tag t-part">${p}</span>`).join('')}</div>
    </div>
  `).join('');
}

function renderTestComparison() {
  const data=getData(); const el=document.getElementById('testComparison');
  const tests=data.tests;
  if (!tests.length) { el.innerHTML='<div class="empty-state"><div class="icon">📊</div><p>暂无体测数据</p></div>'; return; }

  const fields = [
    ['weight','体重','kg'],['bodyFat','体脂率','%'],['muscle','肌肉量','kg'],['bmi','BMI',''],
    ['chest','胸围','cm'],['waist','腰围','cm'],['hip','臀围','cm'],['thigh','大腿围','cm'],['arm','上臂围','cm'],['calf','小腿围','cm'],
    ['squat','深蹲1RM','kg'],['bench','卧推1RM','kg'],['deadlift','硬拉1RM','kg'],
    ['pullup','引体向上','个'],['plank','平板支撑','秒'],['run1k','1km跑','秒']
  ];
  const first=tests[0], last=tests[tests.length-1];
  const same = first.id===last.id;

  let html = `<div class="card"><div class="card-title">${same?'体测数据':`体测对比 · ${first.date} → ${last.date}`}</div>`;
  html += `<table class="compare-table"><tr><th>项目</th>${same?'<th>数值</th>':`<th>${first.date.slice(5)}</th><th>${last.date.slice(5)}</th><th>变化</th>`}</tr>`;
  fields.forEach(([key,label,unit]) => {
    const fv=first[key], lv=last[key];
    if (fv===undefined&&lv===undefined) return;
    if (same) {
      html+=`<tr><td>${label}</td><td>${fv!==undefined?fv+unit:'--'}</td></tr>`;
    } else {
      const diff=(fv!==undefined&&lv!==undefined)?(lv-fv):null;
      const inv=['bodyFat','waist','run1k','bmi'].includes(key);
      const cls=diff!==null?(inv?(diff<0?'change-up':diff>0?'change-down':''):(diff>0?'change-up':diff<0?'change-down':'')):'' ;
      const sign=diff>0?'+':'';
      html+=`<tr><td>${label}</td><td>${fv!==undefined?fv:'--'}</td><td>${lv!==undefined?lv:'--'}</td><td class="${cls}">${diff!==null?sign+diff.toFixed(1)+unit:'--'}</td></tr>`;
    }
  });
  html+='</table></div>';

  if (tests.length>1) {
    html+='<div style="margin-top:8px">';
    tests.slice().reverse().forEach(t => {
      html+=`<div class="record-item type-test" onclick="showTestDetail(${t.id})">
        <div class="record-date">${t.date}</div>
        <div class="record-summary">体测${t.weight?' · 体重'+t.weight+'kg':''}${t.bodyFat?' · 体脂'+t.bodyFat+'%':''}</div>
        <div class="record-tags">${(t.tags||[]).map(tg=>`<span class="record-tag t-test">${tg}</span>`).join('')}</div>
      </div>`;
    });
    html+='</div>';
  }
  el.innerHTML=html;
}

// ========== EXPORT / IMPORT ==========
function exportData() {
  const data=getData();
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='fitlog_'+new Date().toISOString().slice(0,10)+'.json';
  a.click(); showToast('数据已导出');
}

function importData(ev) {
  const file=ev.target.files[0]; if (!file) return;
  const reader=new FileReader();
  reader.onload=function(e){
    try {
      const imp=JSON.parse(e.target.result);
      if (!imp.tests||!imp.sessions) throw new Error();
      const cur=getData();
      const tids=new Set(cur.tests.map(t=>t.id));
      const sids=new Set(cur.sessions.map(s=>s.id));
      imp.tests.forEach(t=>{if(!tids.has(t.id))cur.tests.push(t);});
      imp.sessions.forEach(s=>{if(!sids.has(s.id))cur.sessions.push(s);});
      cur.tests.sort((a,b)=>a.date.localeCompare(b.date));
      cur.sessions.sort((a,b)=>a.date.localeCompare(b.date));
      setData(cur); renderHistory(); showToast('数据已导入');
    } catch { showToast('文件格式错误'); }
  };
  reader.readAsText(file); ev.target.value='';
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', function() {
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('testDate').value = today;
  document.getElementById('sessionDate').value = today;
  addExercise();
});
