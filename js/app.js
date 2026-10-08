'use strict';

/* =========================================================
   STEP 10 — per-photo background color
   + "Apply my settings to all" (everything except crop)
   ========================================================= */

const API_URL = 'http://localhost:8000';

/* export resolution */
const EXPORT_DPI = 300;
const MM_TO_PX = EXPORT_DPI / 25.4;

/* ---------- Static data (all dimensions in mm) ---------- */
const PAPER_SIZES = [
  { id:'3.5x5',  label:'3.5×5 in (9×13 cm)',      w:88.9,  h:127.0 },
  { id:'4x6',    label:'4×6 in (10×15 cm) ★',     w:101.6, h:152.4 },
  { id:'5x7',    label:'5×7 in (13×18 cm)',       w:127.0, h:177.8 },
  { id:'6x8',    label:'6×8 in (15×20 cm)',       w:152.4, h:203.2 },
  { id:'8x10',   label:'8×10 in (20×25 cm)',      w:203.2, h:254.0 },
  { id:'a6',     label:'A6 (105×148 mm)',         w:105,   h:148   },
  { id:'a5',     label:'A5 (148×210 mm)',         w:148,   h:210   },
  { id:'a4',     label:'A4 (210×297 mm)',         w:210,   h:297   },
  { id:'letter', label:'US Letter (8.5×11 in)',   w:215.9, h:279.4 },
  { id:'legal',  label:'US Legal (8.5×14 in)',    w:215.9, h:355.6 },
];

const PHOTO_SIZES = [
  { id:'35x45', label:'35 × 45 mm — Standard (UK/EU/India) ★', short:'35 × 45 mm (UK/EU/India)', w:35, h:45 },
  { id:'51x51', label:'51 × 51 mm (2×2 in) — US',              short:'51 × 51 mm (US)',          w:51, h:51 },
  { id:'33x48', label:'33 × 48 mm — China',                    short:'33 × 48 mm (China)',       w:33, h:48 },
  { id:'35x35', label:'35 × 35 mm',                            short:'35 × 35 mm',               w:35, h:35 },
  { id:'30x40', label:'30 × 40 mm',                            short:'30 × 40 mm',               w:30, h:40 },
  { id:'custom',label:'Custom size…',                          short:'Custom…',                  w:35, h:45 },
];

const MARGIN_MM  = 3;
const GUTTER_MM  = 2;
const MAX_PAGES  = 20;
const MAX_COPIES = 50;
const MAX_SIZES  = 8;

const ADJUST_DEFAULTS = { bright: 0, contrast: 0, sat: 0, borderMM: 0, cutGuides: true };

/* ---------- State ---------- */
const state = {
  paper:       { ...PAPER_SIZES.find(p => p.id === '4x6') },
  defaultSize: { w:35, h:45 },
  photos:      [],
  adjust:      { ...ADJUST_DEFAULTS },
  bg:          { enabled: false, color: '#ffffff' },  // DEFAULT bg for new uploads
  printBoost:  10,
};

let photoIdCounter = 0;
let variantIdCounter = 0;
let currentPage = 1;
let lockAspect = true;

/* ---------- DOM refs ---------- */
const $ = (id) => document.getElementById(id);
const dropzone   = $('dropzone'),  fileInput = $('fileInput'), slotsEl = $('slots');
const paperSelect = $('paperSelect'), sizeSelect = $('sizeSelect');
const btnSwap     = $('btnSwap'),     btnCustomize = $('btnCustomize');
const customSize  = $('customSize'),  customW = $('customW'), customH = $('customH');
const stage = $('stage'), previewInfo = $('previewInfo');
const pager = $('pager'), btnPrev = $('btnPrev'), btnNext = $('btnNext');
const pageIndicator = $('pageIndicator');
const btnAspect = $('btnAspect');
const bgColorInput = $('bgColor');

const cropModal = $('cropModal'), cropFrame = $('cropFrame'), cropImg = $('cropImg');
const cropZoom = $('cropZoom'), cropAspect = $('cropAspect'), cropName = $('cropName');

const lightModal = $('lightModal'), lightImg = $('lightImg'), lightName = $('lightName');
const lightStrength = $('lightStrength'), lightBright = $('lightBright');
const valLightStrength = $('valLightStrength'), valLightBright = $('valLightBright');
const lightStatus = $('lightStatus'), lightRemove = $('lightRemove');

const adjBright = $('adjBright'), adjContrast = $('adjContrast'), adjSat = $('adjSat');
const adjBorder = $('adjBorder'), adjCut = $('adjCut'), adjReset = $('adjReset');
const valBright = $('valBright'), valContrast = $('valContrast');
const valSat = $('valSat'), valBorder = $('valBorder');

const printBoostSlider = $('printBoost'), valBoost = $('valBoost');
const btnPreviewFinal = $('btnPreviewFinal'), btnPrint = $('btnPrint');
const finalModal = $('finalModal'), finalPages = $('finalPages');
const finalInfo = $('finalInfo'), finalClose = $('finalClose'), finalPrint = $('finalPrint');
const printRoot = $('printRoot');

/* ---------- Small helpers ---------- */
function newVariant() { return { vid: ++variantIdCounter, size: { ...state.defaultSize }, copies: 1 }; }
function numInput(value) {
  const i = document.createElement('input');
  i.type = 'number'; i.min = 10; i.max = 300; i.step = 0.5; i.value = value; return i;
}
function stepBtn(txt) {
  const b = document.createElement('button'); b.className = 'step-btn'; b.textContent = txt; return b;
}
function presetIdForSize(size) {
  const p = PHOTO_SIZES.find(s => s.id !== 'custom' && s.w === size.w && s.h === size.h);
  return p ? p.id : null;
}
function clampNum(v, min, max) { return Math.min(max, Math.max(min, v)); }
function filterString() {
  const a = state.adjust;
  return `brightness(${1 + a.bright / 100}) contrast(${1 + a.contrast / 100}) saturate(${1 + a.sat / 100})`;
}
function exportFilterString() {
  const a = state.adjust;
  const bright = (1 + a.bright / 100) * (1 + state.printBoost / 100);
  return `brightness(${bright}) contrast(${1 + a.contrast / 100}) saturate(${1 + a.sat / 100})`;
}
function imgFor(slot) { return slot.litUrl || slot.cleanUrl || slot.url; }
/* effective background of a slot */
function bgFor(slot) { return slot.bg || state.bg; }

/* ---------- Init dropdowns ---------- */
function initSelects() {
  PAPER_SIZES.forEach(p => {
    const o = document.createElement('option'); o.value = p.id; o.textContent = p.label; paperSelect.appendChild(o);
  });
  paperSelect.value = state.paper.id;
  PHOTO_SIZES.forEach(s => {
    const o = document.createElement('option'); o.value = s.id; o.textContent = s.label; sizeSelect.appendChild(o);
  });
  sizeSelect.value = '35x45';
}

/* ---------- Upload ---------- */
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = ''; });
['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('drag'); }));
dropzone.addEventListener('drop', e => handleFiles(e.dataTransfer.files));

function handleFiles(fileList) {
  [...fileList].filter(f => f.type.startsWith('image/')).forEach(f => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      state.photos.push({
        id: ++photoIdCounter,
        name: f.name, url, img,
        variants: [ newVariant() ],
        crop: null, cleanUrl: null, litUrl: null,
        lightParams: null,               // saved ☀️ settings {flatten, target}
        bg: { ...state.bg },             // per-photo background (starts as default)
        _workImg: null, _workSrc: null,
      });
      renderSlots();
      renderPreview();
    };
    img.src = url;
  });
}

/* ---------- Slot cards ---------- */
function renderSlots() {
  slotsEl.innerHTML = '';
  if (!state.photos.length) {
    const hint = document.createElement('div'); hint.className = 'slot-hint';
    hint.textContent = 'No photos yet — upload above'; slotsEl.appendChild(hint); return;
  }

  state.photos.forEach(slot => {
    const card = document.createElement('div'); card.className = 'slot-card';
    const head = document.createElement('div'); head.className = 'slot-head';

    const thumb = document.createElement('img');
    thumb.src = imgFor(slot);

    const name = document.createElement('span');
    name.className = 'slot-name'; name.textContent = slot.name; name.title = slot.name;

    const bgBtn = document.createElement('button');
    bgBtn.className = 'btn bg-btn' + (slot.cleanUrl ? ' active' : '');
    bgBtn.textContent = '🪄';
    bgBtn.title = slot.cleanUrl ? 'Background removed — click to restore' : 'Remove background';
    bgBtn.addEventListener('click', () => {
      if (slot.cleanUrl) {
        URL.revokeObjectURL(slot.cleanUrl); slot.cleanUrl = null;
        if (slot.litUrl) { URL.revokeObjectURL(slot.litUrl); slot.litUrl = null; }
        slot.lightParams = null;
        renderSlots(); renderPreview();
      } else {
        handleRemoveBg(slot, bgBtn);
      }
    });

    const sunBtn = document.createElement('button');
    sunBtn.className = 'btn sun-btn' + (slot.litUrl ? ' active' : '');
    sunBtn.textContent = '☀️';
    sunBtn.title = slot.litUrl ? 'Studio lighting applied — click to adjust' : 'Studio lighting';
    sunBtn.addEventListener('click', () => openLight(slot));

    const cropBtn = document.createElement('button');
    cropBtn.className = 'btn crop-btn' + (slot.crop ? ' cropped' : '');
    cropBtn.textContent = '✂';
    cropBtn.title = slot.crop ? 'Crop applied — click to edit' : 'Crop this photo';
    cropBtn.addEventListener('click', () => openCrop(slot));

    const del = document.createElement('button');
    del.className = 'tray-del'; del.textContent = '✕'; del.title = 'Remove photo';
    del.addEventListener('click', () => removePhoto(slot.id));

    head.append(thumb, name, bgBtn, sunBtn, cropBtn, del);

    /* per-photo background color row */
    const bgRow = document.createElement('div');
    bgRow.className = 'slot-bg-row';

    const bgLab = document.createElement('span');
    bgLab.textContent = 'BG color';

    const noneBtn = document.createElement('button');
    noneBtn.className = 'btn bg-none' + (!bgFor(slot).enabled ? ' active' : '');
    noneBtn.textContent = '✕';
    noneBtn.title = 'No background (transparent / paper)';
    noneBtn.addEventListener('click', () => {
      slot.bg = { enabled: false, color: bgFor(slot).color };
      renderSlots(); renderPreview();
    });

    const col = document.createElement('input');
    col.type = 'color';
    col.value = bgFor(slot).color;
    col.title = 'Background color for this photo';
    col.addEventListener('input', () => {
      slot.bg = { enabled: true, color: col.value };
      noneBtn.classList.remove('active');
      renderPreview();
    });

    bgRow.append(bgLab, noneBtn, col);

    /* size lines */
    const variantsWrap = document.createElement('div');
    variantsWrap.className = 'variants';
    slot.variants.forEach(v => variantsWrap.appendChild(makeVariantRow(slot, v)));

    const addBtn = document.createElement('button');
    addBtn.className = 'btn add-size'; addBtn.textContent = '+ Add size';
    addBtn.disabled = slot.variants.length >= MAX_SIZES;
    addBtn.addEventListener('click', () => {
      if (slot.variants.length >= MAX_SIZES) return;
      slot.variants.push(newVariant()); renderSlots(); renderPreview();
    });

    /* apply this photo's settings to everyone */
    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn apply-all';
    applyBtn.textContent = '⧉ Apply my settings to all';
    applyBtn.title = 'Copies this photo\'s background color + lighting pipeline to every other photo (crop, sizes & copies are kept)';
    applyBtn.addEventListener('click', () => applySettingsToAll(slot, applyBtn));

    card.append(head, bgRow, variantsWrap, addBtn, applyBtn);
    slotsEl.appendChild(card);
  });
}

/* ---------- APPLY SETTINGS TO ALL (everything except crop) ---------- */
async function applySettingsToAll(source, btn) {
  btn.disabled = true;
  const total = state.photos.length;
  let done = 0;

  for (const slot of state.photos) {
    // 1) background color — always copied
    slot.bg = { ...source.bg };
    state.bg = { ...source.bg };       // becomes the new default too
    updateSwatchUI();

    // 2) replicate the pipeline: remove bg → relight (same params)
    if (slot !== source && (source.cleanUrl || source.lightParams)) {
      try {
        if (!slot.cleanUrl) {
          const blob = await (await fetch(slot.url)).blob();
          const fd = new FormData(); fd.append('file', blob, slot.name);
          const res = await fetch(`${API_URL}/removebg`, { method: 'POST', body: fd });
          if (res.ok) slot.cleanUrl = URL.createObjectURL(await res.blob());
          if (slot.litUrl) { URL.revokeObjectURL(slot.litUrl); slot.litUrl = null; }
          slot.lightParams = null;
        }

        if (source.lightParams) {
          const srcUrl = slot.cleanUrl || slot.url;
          const blob = await (await fetch(srcUrl)).blob();
          const fd = new FormData(); fd.append('file', blob, slot.name);
          const { flatten, target } = source.lightParams;
          const res = await fetch(`${API_URL}/relight?flatten=${flatten}&target=${target}`,
                                  { method: 'POST', body: fd });
          if (res.ok) {
            if (slot.litUrl) URL.revokeObjectURL(slot.litUrl);
            slot.litUrl = URL.createObjectURL(await res.blob());
            slot.lightParams = { ...source.lightParams };
          }
        }
      } catch (err) {
        console.error('Apply-to-all failed for', slot.name, err);
      }
    }

    done++;
    btn.textContent = `Applying ${done}/${total}…`;
    renderPreview(); // live progress on the sheet
  }

  renderSlots(); // refresh all button states
}

/* ---------- API: REMOVE BG ---------- */
async function handleRemoveBg(slot, btn) {
  btn.disabled = true; btn.textContent = '⏳';
  try {
    const res = await fetch(slot.url);
    const blob = await res.blob();
    const formData = new FormData();
    formData.append('file', blob, slot.name);

    const apiRes = await fetch(`${API_URL}/removebg`, { method: 'POST', body: formData });
    if (!apiRes.ok) throw new Error('Server error');

    const cleanBlob = await apiRes.blob();
    slot.cleanUrl = URL.createObjectURL(cleanBlob);
    if (slot.litUrl) { URL.revokeObjectURL(slot.litUrl); slot.litUrl = null; }
    slot.lightParams = null;

    renderSlots(); renderPreview();
  } catch (err) {
    alert('Background removal failed. Is the backend running on port 8000?');
    console.error(err);
    btn.disabled = false; btn.textContent = '🪄';
  }
}

/* =========================================================
   LIGHTING MODAL (even-out lighting + brightness sliders)
   ========================================================= */

let lightTargetSlot = null;
let lightSrcBlob = null;
let lightTempUrl = null;
let lightReqId = 0;
let lightDebounce = null;

async function openLight(slot) {
  lightTargetSlot = slot;
  lightName.textContent = slot.name;
  lightRemove.classList.toggle('hidden', !slot.litUrl);
  lightStatus.textContent = 'Loading…';
  lightImg.removeAttribute('src');
  lightModal.classList.remove('hidden');

  try {
    const res = await fetch(slot.cleanUrl || slot.url);
    lightSrcBlob = await res.blob();
  } catch (e) {
    lightStatus.textContent = 'Could not load photo';
    return;
  }

  // preload this photo's saved settings (or defaults)
  const p = slot.lightParams || { flatten: 0.85, target: 185 };
  lightStrength.value = Math.round(clampNum(p.flatten, 0, 1) * 100);
  lightBright.value   = Math.round(clampNum(p.target - 130, 0, 100));
  valLightStrength.textContent = lightStrength.value + '%';
  valLightBright.textContent = lightBright.value;

  updateLightPreview();
}

function lightParams() {
  const flatten = parseInt(lightStrength.value, 10) / 100;
  const target  = 130 + parseInt(lightBright.value, 10);
  return { flatten, target };
}

async function updateLightPreview() {
  if (!lightTargetSlot || !lightSrcBlob) return;
  const reqId = ++lightReqId;
  lightStatus.textContent = 'Processing…';

  try {
    const { flatten, target } = lightParams();
    const fd = new FormData();
    fd.append('file', lightSrcBlob, lightTargetSlot.name);

    const apiRes = await fetch(
      `${API_URL}/relight?flatten=${flatten}&target=${target}`,
      { method: 'POST', body: fd }
    );
    if (!apiRes.ok) throw new Error('Server error');
    const blob = await apiRes.blob();

    if (reqId !== lightReqId) return;
    if (lightTempUrl) URL.revokeObjectURL(lightTempUrl);
    lightTempUrl = URL.createObjectURL(blob);
    lightImg.src = lightTempUrl;
    lightStatus.textContent = '';
  } catch (err) {
    if (reqId === lightReqId) lightStatus.textContent = 'Error — is the backend running?';
  }
}

function scheduleLightUpdate() {
  clearTimeout(lightDebounce);
  lightDebounce = setTimeout(updateLightPreview, 300);
}

lightStrength.addEventListener('input', () => {
  valLightStrength.textContent = lightStrength.value + '%';
  scheduleLightUpdate();
});
lightBright.addEventListener('input', () => {
  valLightBright.textContent = lightBright.value;
  scheduleLightUpdate();
});

function closeLight(save) {
  if (save && lightTempUrl && lightTargetSlot) {
    if (lightTargetSlot.litUrl) URL.revokeObjectURL(lightTargetSlot.litUrl);
    lightTargetSlot.litUrl = lightTempUrl;
    lightTargetSlot.lightParams = lightParams();   // remember settings for apply-to-all
    lightTempUrl = null;
    renderSlots(); renderPreview();
  }
  if (lightTempUrl) { URL.revokeObjectURL(lightTempUrl); lightTempUrl = null; }
  lightReqId++;
  lightModal.classList.add('hidden');
  lightTargetSlot = null; lightSrcBlob = null;
}

$('lightApply').addEventListener('click', () => closeLight(true));
$('lightCancel').addEventListener('click', () => closeLight(false));
$('lightClose').addEventListener('click', () => closeLight(false));
lightModal.addEventListener('click', e => { if (e.target === lightModal) closeLight(false); });

lightRemove.addEventListener('click', () => {
  if (lightTargetSlot && lightTargetSlot.litUrl) {
    URL.revokeObjectURL(lightTargetSlot.litUrl);
    lightTargetSlot.litUrl = null;
    lightTargetSlot.lightParams = null;
    renderSlots(); renderPreview();
  }
  closeLight(false);
});

/* ---------- helpers for variants ---------- */
function makeVariantRow(slot, v) {
  const box = document.createElement('div'); box.className = 'variant';
  const sel = document.createElement('select');
  PHOTO_SIZES.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.short; sel.appendChild(o); });
  sel.value = presetIdForSize(v.size) || 'custom';

  const customWrap = document.createElement('div');
  customWrap.className = 'slot-custom' + (sel.value === 'custom' ? '' : ' hidden');
  const wInp = numInput(v.size.w), hInp = numInput(v.size.h);
  const labW = document.createElement('label'); labW.append('W (mm)', wInp);
  const labH = document.createElement('label'); labH.append('H (mm)', hInp);
  customWrap.append(labW, labH);

  sel.addEventListener('change', () => {
    if (sel.value === 'custom') { customWrap.classList.remove('hidden'); }
    else { customWrap.classList.add('hidden'); const p = PHOTO_SIZES.find(s => s.id === sel.value); v.size = { w: p.w, h: p.h }; renderPreview(); }
  });
  wInp.addEventListener('input', () => { const val = parseFloat(wInp.value); if (val >= 10 && val <= 300) { v.size.w = val; renderPreview(); } });
  hInp.addEventListener('input', () => { const val = parseFloat(hInp.value); if (val >= 10 && val <= 300) { v.size.h = val; renderPreview(); } });

  const row = document.createElement('div'); row.className = 'variant-row';
  const lab = document.createElement('span'); lab.className = 'copies-label'; lab.textContent = 'Copies';
  const group = document.createElement('div'); group.className = 'stepper-group';
  const minus = stepBtn('−'), num = document.createElement('span'), plus = stepBtn('+');
  num.className = 'step-num'; num.textContent = v.copies;
  minus.addEventListener('click', () => { if (v.copies > 1) { v.copies--; num.textContent = v.copies; renderPreview(); } });
  plus.addEventListener('click', () => { if (v.copies < MAX_COPIES) { v.copies++; num.textContent = v.copies; renderPreview(); } });
  group.append(minus, num, plus); row.append(lab, group);

  if (slot.variants.length > 1) {
    const delV = document.createElement('button'); delV.className = 'variant-del'; delV.textContent = '✕'; delV.title = 'Remove this size';
    delV.addEventListener('click', () => { const idx = slot.variants.indexOf(v); if (idx > -1) slot.variants.splice(idx, 1); renderSlots(); renderPreview(); });
    row.appendChild(delV);
  }
  box.append(sel, customWrap, row); return box;
}

function removePhoto(id) {
  const i = state.photos.findIndex(p => p.id === id);
  if (i === -1) return;
  URL.revokeObjectURL(state.photos[i].url);
  if (state.photos[i].cleanUrl) URL.revokeObjectURL(state.photos[i].cleanUrl);
  if (state.photos[i].litUrl) URL.revokeObjectURL(state.photos[i].litUrl);
  state.photos.splice(i, 1); renderSlots(); renderPreview();
}

/* ---------- Global controls ---------- */
paperSelect.addEventListener('change', () => { state.paper = { ...PAPER_SIZES.find(p => p.id === paperSelect.value) }; renderPreview(); });
btnSwap.addEventListener('click', () => { [state.paper.w, state.paper.h] = [state.paper.h, state.paper.w]; renderPreview(); });
sizeSelect.addEventListener('change', () => {
  const s = PHOTO_SIZES.find(s => s.id === sizeSelect.value);
  if (s.id === 'custom') { customSize.classList.remove('hidden'); customW.value = state.defaultSize.w; customH.value = state.defaultSize.h; }
  else { customSize.classList.add('hidden'); state.defaultSize = { w: s.w, h: s.h }; }
});
btnCustomize.addEventListener('click', () => {
  const isHidden = customSize.classList.contains('hidden');
  if (isHidden) { sizeSelect.value = 'custom'; sizeSelect.dispatchEvent(new Event('change')); }
  else { customSize.classList.add('hidden'); sizeSelect.value = '35x45'; sizeSelect.dispatchEvent(new Event('change')); }
});
[customW, customH].forEach(inp => inp.addEventListener('input', () => {
  const w = parseFloat(customW.value), h = parseFloat(customH.value);
  if (w >= 10 && w <= 300) state.defaultSize.w = w;
  if (h >= 10 && h <= 300) state.defaultSize.h = h;
}));

/* ---------- Background swatches (DEFAULT for new uploads) ---------- */
const swatches = document.querySelectorAll('.swatch[data-bg]');

function setBg(color) {
  state.bg = color ? { enabled: true, color } : { enabled: false, color: state.bg.color };
  updateSwatchUI();
}

function updateSwatchUI() {
  swatches.forEach(btn => {
    const v = btn.dataset.bg;
    const isActive = v === 'none'
      ? !state.bg.enabled
      : (state.bg.enabled && state.bg.color.toLowerCase() === v.toLowerCase());
    btn.classList.toggle('active', isActive);
  });
}

swatches.forEach(btn => btn.addEventListener('click', () => {
  const v = btn.dataset.bg;
  setBg(v === 'none' ? null : v);
}));

bgColorInput.addEventListener('input', () => setBg(bgColorInput.value));

/* ---------- Adjustments ---------- */
function bindAdjSlider(slider, key, labelEl, fmt) {
  slider.addEventListener('input', () => { state.adjust[key] = parseFloat(slider.value); labelEl.textContent = fmt(state.adjust[key]); renderPreview(); });
}
bindAdjSlider(adjBright,  'bright',   valBright,   v => v);
bindAdjSlider(adjContrast,'contrast', valContrast, v => v);
bindAdjSlider(adjSat,     'sat',      valSat,      v => v);
bindAdjSlider(adjBorder,  'borderMM', valBorder,   v => v + ' mm');
adjCut.addEventListener('change', () => { state.adjust.cutGuides = adjCut.checked; renderPreview(); });
adjReset.addEventListener('click', () => {
  state.adjust = { ...ADJUST_DEFAULTS };
  adjBright.value = 0;  valBright.textContent = '0';
  adjContrast.value = 0; valContrast.textContent = '0';
  adjSat.value = 0;     valSat.textContent = '0';
  adjBorder.value = 0;  valBorder.textContent = '0 mm';
  adjCut.checked = true; renderPreview();
});

/* ---------- Print boost ---------- */
printBoostSlider.addEventListener('input', () => {
  state.printBoost = parseInt(printBoostSlider.value, 10);
  valBoost.textContent = '+' + state.printBoost + '%';
});

/* ---------- Pager & aspect toggle ---------- */
btnPrev.addEventListener('click', () => { currentPage--; renderPreview(); });
btnNext.addEventListener('click', () => { currentPage++; renderPreview(); });
btnAspect.addEventListener('click', () => {
  lockAspect = !lockAspect; btnAspect.classList.toggle('active', lockAspect);
  btnAspect.textContent = lockAspect ? '🔒 Aspect locked' : '🔓 Full bleed'; renderPreview();
});

/* ---------- Help tooltips ---------- */
const HELP_TEXTS = {
  upload: 'Add photos you want to print. Click to browse or drag & drop — you can add several at once.',
  slots: 'Each card is one photo / person. 🪄 removes the background, ☀️ opens the studio lighting editor, ✂ crops. Every photo has its own BG color. "⧉ Apply my settings to all" copies this photo\'s background + lighting to every other photo (crop, sizes & copies stay as they are). Biggest photos are placed first on the sheet.',
  paper: 'The paper size your layout will be printed on. Press ⇄ to rotate.',
  defaultSize: 'This size is given automatically to every new upload.',
  background: 'This is the DEFAULT background for new uploads. Each photo card below has its own "BG color" picker — white is the passport standard in most countries, "✕" means no background.',
  adjust: 'These edits instantly apply to ALL photos on the sheet. "Photo border" adds a white frame. "Cut guides" draws thin lines to cut along.',
  print: '"Print brightness boost" brightens ONLY the exported file (not your screen), because most printers print darker than displays — +10% is a good starting point. "Preview final output" shows the exact 300 DPI result. "Print / Save PDF" opens the print dialog: choose your printer, or "Save as PDF". Set scale 100% and margins none.',
  preview: 'Shows exactly how your sheet will print. 🔒 Aspect locked keeps true proportions. If photos do not fit on one sheet, extra pages are created — flip them with ◀ ▶.',
};
const helpBox = document.createElement('div'); helpBox.className = 'help-box hidden'; document.body.appendChild(helpBox);
let pinnedHelp = null;
function showHelp(key, anchor) {
  helpBox.textContent = HELP_TEXTS[key]; helpBox.classList.remove('hidden');
  const r = anchor.getBoundingClientRect(); const bw = helpBox.offsetWidth, bh = helpBox.offsetHeight;
  let left = r.left + r.width / 2 - bw / 2; left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
  let top = r.top - bh - 10; if (top < 8) top = r.bottom + 10;
  helpBox.style.left = left + 'px'; helpBox.style.top  = top + 'px';
}
function hideHelp() { helpBox.classList.add('hidden'); pinnedHelp = null; }
document.querySelectorAll('.info').forEach(btn => {
  btn.addEventListener('mouseenter', () => { if (!pinnedHelp) showHelp(btn.dataset.help, btn); });
  btn.addEventListener('mouseleave', () => { if (!pinnedHelp) hideHelp(); });
  btn.addEventListener('click', e => { e.stopPropagation(); if (pinnedHelp === btn) { hideHelp(); return; } pinnedHelp = btn; showHelp(btn.dataset.help, btn); });
});
document.addEventListener('click', () => { if (pinnedHelp) hideHelp(); });
window.addEventListener('scroll', hideHelp, true); window.addEventListener('resize', hideHelp);

/* ---------- CROP MODAL ---------- */
let cropTarget = null, cropBase = 1, cropState = { z: 1, tx: 0, ty: 0 }, frameW = 0, frameH = 0;
function openCrop(slot) {
  cropTarget = slot; cropName.textContent = slot.name; cropAspect.innerHTML = '';
  slot.variants.forEach((v, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${v.size.w} × ${v.size.h} mm`; cropAspect.appendChild(o); });
  cropAspect.value = 0; cropModal.classList.remove('hidden'); layoutCropFrame(); initCropFromSlot();
}
function closeCrop() { cropModal.classList.add('hidden'); cropTarget = null; }
function layoutCropFrame() {
  const vp = cropFrame.parentElement; const vw = vp.clientWidth, vh = vp.clientHeight;
  const v = cropTarget.variants[parseInt(cropAspect.value, 10)] || cropTarget.variants[0]; const a = v.size.w / v.size.h;
  if (vw / vh > a) { frameH = vh; frameW = vh * a; } else { frameW = vw; frameH = vw / a; }
  cropFrame.style.width = frameW + 'px'; cropFrame.style.height = frameH + 'px';
  const iw = cropTarget.img.naturalWidth, ih = cropTarget.img.naturalHeight;
  cropBase = Math.max(frameW / iw, frameH / ih);
  cropImg.src = imgFor(cropTarget);
}
function initCropFromSlot() {
  const iw = cropTarget.img.naturalWidth, ih = cropTarget.img.naturalHeight; const c = cropTarget.crop;
  if (!c) { cropState = { z: 1, tx: 0, ty: 0 }; }
  else {
    const z = clampNum((frameW / (c.w * iw)) / cropBase, 1, 6);
    const dw = iw * cropBase * z, dh = ih * cropBase * z;
    const left = -(c.x * iw) * cropBase * z, top  = -(c.y * ih) * cropBase * z;
    cropState = { z, tx: left - (frameW - dw) / 2, ty: top  - (frameH - dh) / 2 };
  }
  clampCrop(); cropZoom.value = cropState.z; applyCropTransform();
}
function applyCropTransform() {
  const iw = cropTarget.img.naturalWidth, ih = cropTarget.img.naturalHeight;
  const dw = iw * cropBase * cropState.z, dh = ih * cropBase * cropState.z;
  cropImg.style.width = dw + 'px'; cropImg.style.height = dh + 'px';
  cropImg.style.left = (frameW - dw) / 2 + cropState.tx + 'px'; cropImg.style.top = (frameH - dh) / 2 + cropState.ty + 'px';
}
function clampCrop() {
  const iw = cropTarget.img.naturalWidth, ih = cropTarget.img.naturalHeight;
  const dw = iw * cropBase * cropState.z, dh = ih * cropBase * cropState.z;
  const maxX = Math.max(0, (dw - frameW) / 2), maxY = Math.max(0, (dh - frameH) / 2);
  cropState.tx = clampNum(cropState.tx, -maxX, maxX); cropState.ty = clampNum(cropState.ty, -maxY, maxY);
}
function setZoom(z) { cropState.z = clampNum(z, 1, 6); cropZoom.value = cropState.z; clampCrop(); applyCropTransform(); }

const pointers = new Map(); let dragPtr = null, pinchStart = null;
cropFrame.addEventListener('pointerdown', e => {
  cropFrame.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) { dragPtr = { x: e.clientX, y: e.clientY }; }
  else if (pointers.size === 2) { pinchStart = { dist: pinchDist(), z: cropState.z }; dragPtr = null; }
});
cropFrame.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2 && pinchStart) { setZoom(pinchStart.z * (pinchDist() / pinchStart.dist)); }
  else if (dragPtr) { cropState.tx += e.clientX - dragPtr.x; cropState.ty += e.clientY - dragPtr.y; dragPtr = { x: e.clientX, y: e.clientY }; clampCrop(); applyCropTransform(); }
});
['pointerup', 'pointercancel'].forEach(ev => cropFrame.addEventListener(ev, e => {
  pointers.delete(e.pointerId); if (pointers.size < 2) pinchStart = null; if (pointers.size === 0) dragPtr = null;
}));
function pinchDist() { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); }
cropFrame.addEventListener('wheel', e => { e.preventDefault(); setZoom(cropState.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
cropZoom.addEventListener('input', () => setZoom(parseFloat(cropZoom.value)));
cropAspect.addEventListener('change', () => { layoutCropFrame(); initCropFromSlot(); });
$('cropClose').addEventListener('click', closeCrop);
cropModal.addEventListener('click', e => { if (e.target === cropModal) closeCrop(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!cropModal.classList.contains('hidden')) closeCrop();
    else if (!lightModal.classList.contains('hidden')) closeLight(false);
    else if (!finalModal.classList.contains('hidden')) finalModal.classList.add('hidden');
  }
});
$('cropReset').addEventListener('click', () => { cropState = { z: 1, tx: 0, ty: 0 }; cropZoom.value = 1; applyCropTransform(); });
$('cropApply').addEventListener('click', () => {
  const iw = cropTarget.img.naturalWidth, ih = cropTarget.img.naturalHeight;
  const dw = iw * cropBase * cropState.z, dh = ih * cropBase * cropState.z;
  const left = (frameW - dw) / 2 + cropState.tx, top = (frameH - dh) / 2 + cropState.ty;
  const s = cropBase * cropState.z;
  let crop = { x: (-left) / s / iw, y: (-top) / s / ih, w: frameW / s / iw, h: frameH / s / ih };
  crop.x = clampNum(crop.x, 0, 1); crop.y = clampNum(crop.y, 0, 1);
  crop.w = clampNum(crop.w, 0.01, 1 - crop.x); crop.h = clampNum(crop.h, 0.01, 1 - crop.y);
  cropTarget.crop = crop; closeCrop(); renderSlots(); renderPreview();
});
window.addEventListener('resize', () => { if (cropTarget && !cropModal.classList.contains('hidden')) { layoutCropFrame(); initCropFromSlot(); } });

/* ---------- Layout engine ---------- */
function buildLayout() {
  const margin = MARGIN_MM, gutter = GUTTER_MM, sheetW = state.paper.w, sheetH = state.paper.h;
  const prints = [];
  for (const slot of state.photos) for (const v of slot.variants) for (let c = 0; c < v.copies; c++) prints.push({ slot, w: v.size.w, h: v.size.h });
  prints.sort((a, b) => (b.w * b.h) - (a.w * a.h));
  const pages = []; let page = { items: [] }; let x = margin, y = margin, rowH = 0, skipped = 0;
  for (let i = 0; i < prints.length; i++) {
    const pr = prints[i]; const w = pr.w, h = pr.h;
    if (w > sheetW - margin * 2 + 0.5 || h > sheetH - margin * 2 + 0.5) { skipped++; continue; }
    if (x + w > sheetW - margin + 0.5 && x > margin) { x = margin; y += rowH + gutter; rowH = 0; }
    if (y + h > sheetH - margin + 0.5) {
      pages.push(page); if (pages.length >= MAX_PAGES) { skipped += prints.length - i; break; }
      page = { items: [] }; x = margin; y = margin; rowH = 0;
    }
    page.items.push({ photo: pr, x, y, w, h }); x += w + gutter; rowH = Math.max(rowH, h);
  }
  if (page.items.length) pages.push(page);
  return { pages, skipped, totalPrints: prints.length };
}

/* ---------- Live preview ---------- */
function renderPreview() {
  const stageW = stage.clientWidth, stageH = stage.clientHeight; stage.innerHTML = '';
  const { pages, skipped, totalPrints } = state.photos.length ? buildLayout() : { pages: [], skipped: 0, totalPrints: 0 };
  const baseInfo = `Paper: ${Math.round(state.paper.w)}×${Math.round(state.paper.h)} mm · Photos: ${state.photos.length} · Prints: ${totalPrints}`;
  if (!state.photos.length || pages.length === 0) {
    stage.appendChild(makeEmptyPage(stageW, stageH)); pager.classList.add('hidden');
    previewInfo.textContent = state.photos.length ? `${baseInfo} · ⚠ Photos are bigger than this paper size` : baseInfo; return;
  }
  currentPage = Math.max(1, Math.min(currentPage, pages.length));
  stage.appendChild(drawPage(pages[currentPage - 1], stageW, stageH)); updatePager(pages.length);
  let info = `${baseInfo} · Pages: ${pages.length}`; if (skipped > 0) info += ` · ⚠ ${skipped} not placed`;
  previewInfo.textContent = info;
}

function fillPrint(el, item, innerW, innerH) {
  const slot = item.photo.slot;
  const iw = slot.img.naturalWidth, ih = slot.img.naturalHeight;
  if (!iw || !ih || innerW <= 0 || innerH <= 0) return;

  let cx = 0, cy = 0, cw = iw, ch = ih;
  const c = slot.crop;
  if (c) { cx = c.x * iw; cy = c.y * ih; cw = c.w * iw; ch = c.h * ih; }

  const target = item.w / item.h;
  if (cw / ch > target) { const nw = ch * target; cx += (cw - nw) / 2; cw = nw; }
  else { const nh = cw / target; cy += (ch - nh) / 2; ch = nh; }

  const sx = innerW / cw, sy = innerH / ch;
  const im = document.createElement('img');
  im.className = 'print-img';
  im.src = imgFor(slot);
  im.alt = ''; im.draggable = false;
  im.style.width = iw * sx + 'px'; im.style.height = ih * sy + 'px';
  im.style.left = -cx * sx + 'px'; im.style.top = -cy * sy + 'px';
  im.style.filter = filterString();
  el.appendChild(im);
}

function drawPage(pageData, stageW, stageH) {
  let scaleX, scaleY, pw, ph;
  if (lockAspect) { const s = Math.min(stageW / state.paper.w, stageH / state.paper.h); scaleX = s; scaleY = s; pw = state.paper.w * s; ph = state.paper.h * s; }
  else { scaleX = stageW / state.paper.w; scaleY = stageH / state.paper.h; pw = stageW; ph = stageH; }
  const pg = document.createElement('div'); pg.className = 'paper'; pg.style.width = pw + 'px'; pg.style.height = ph + 'px';
  for (const item of pageData.items) {
    const el = document.createElement('div'); el.className = 'photo-item';
    const pxW = item.w * scaleX, pxH = item.h * scaleY;
    el.style.left = item.x * scaleX + 'px'; el.style.top = item.y * scaleY + 'px';
    el.style.width = pxW + 'px'; el.style.height = pxH + 'px';

    // PER-PHOTO background color
    const bg = bgFor(item.photo.slot);
    el.style.backgroundColor = bg.enabled ? bg.color : '#e5e7eb';

    const bMM = state.adjust.borderMM; const bPx = bMM > 0 ? Math.max(1, bMM * (scaleX + scaleY) / 2) : 0;
    el.style.border = bPx ? `${bPx}px solid #fff` : 'none';
    el.style.outline = state.adjust.cutGuides ? '1px solid #aab2bf' : 'none';
    fillPrint(el, item, pxW - bPx * 2, pxH - bPx * 2);
    pg.appendChild(el);
  }
  return pg;
}

function makeEmptyPage(stageW, stageH) {
  const pg = document.createElement('div'); pg.className = 'paper';
  if (lockAspect) { const s = Math.min(stageW / state.paper.w, stageH / state.paper.h); pg.style.width = state.paper.w * s + 'px'; pg.style.height = state.paper.h * s + 'px'; }
  else { pg.style.width = stageW + 'px'; pg.style.height = stageH + 'px'; }
  const empty = document.createElement('div'); empty.className = 'paper-empty';
  empty.textContent = state.photos.length ? '⚠ Photos are bigger than this paper size' : 'Upload a photo to see it here';
  pg.appendChild(empty); return pg;
}

function updatePager(totalPages) {
  if (totalPages > 1) { pager.classList.remove('hidden'); pageIndicator.textContent = `${currentPage} / ${totalPages}`; btnPrev.disabled = currentPage === 1; btnNext.disabled = currentPage === totalPages; }
  else { pager.classList.add('hidden'); }
}

window.addEventListener('resize', renderPreview);

/* =========================================================
   EXPORT ENGINE — 300 DPI canvas rendering
   ========================================================= */

const FILTERS_OK = (() => {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    return typeof ctx.filter === 'string';
  } catch (e) { return false; }
})();

function getWorkImage(slot) {
  const src = imgFor(slot);
  if (slot._workSrc !== src) {
    slot._workImg = new Image();
    slot._workSrc = src;
    slot._workImg.src = src;
  }
  return slot._workImg;
}

async function prepareExportImages() {
  await Promise.all(state.photos.map(slot => {
    const img = getWorkImage(slot);
    if (img.complete && img.naturalWidth) return Promise.resolve();
    return img.decode ? img.decode().catch(() => {}) : new Promise(res => { img.onload = res; img.onerror = res; });
  }));
}

async function renderPageCanvas(pageData) {
  const W = Math.round(state.paper.w * MM_TO_PX);
  const H = Math.round(state.paper.h * MM_TO_PX);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const filter = exportFilterString();

  for (const item of pageData.items) {
    const x = item.x * MM_TO_PX, y = item.y * MM_TO_PX;
    const w = item.w * MM_TO_PX, h = item.h * MM_TO_PX;
    const bPx = state.adjust.borderMM > 0 ? Math.max(1, state.adjust.borderMM * MM_TO_PX) : 0;
    const innerW = w - bPx * 2, innerH = h - bPx * 2;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);

    // PER-PHOTO background color
    const bg = bgFor(item.photo.slot);
    if (bg.enabled) {
      ctx.fillStyle = bg.color;
      ctx.fillRect(x + bPx, y + bPx, innerW, innerH);
    }

    const slot = item.photo.slot;
    const img = getWorkImage(slot);
    const iw = img.naturalWidth || slot.img.naturalWidth;
    const ih = img.naturalHeight || slot.img.naturalHeight;

    if (iw && ih && innerW > 0 && innerH > 0) {
      let cx = 0, cy = 0, cw = iw, ch = ih;
      const c = slot.crop;
      if (c) { cx = c.x * iw; cy = c.y * ih; cw = c.w * iw; ch = c.h * ih; }

      const target = item.w / item.h;
      if (cw / ch > target) { const nw = ch * target; cx += (cw - nw) / 2; cw = nw; }
      else { const nh = cw / target; cy += (ch - nh) / 2; ch = nh; }

      ctx.save();
      if (FILTERS_OK) ctx.filter = filter;
      ctx.drawImage(img, cx, cy, cw, ch, x + bPx, y + bPx, innerW, innerH);
      ctx.restore();
    }

    if (state.adjust.cutGuides) {
      ctx.strokeStyle = '#b8bfc9';
      ctx.lineWidth = Math.max(1, MM_TO_PX * 0.15);
      ctx.strokeRect(x, y, w, h);
    }
  }
  return canvas;
}

function setPageSizeStyle() {
  let el = document.getElementById('pageSizeStyle');
  if (!el) {
    el = document.createElement('style');
    el.id = 'pageSizeStyle';
    document.head.appendChild(el);
  }
  el.textContent = `@page { size: ${state.paper.w.toFixed(1)}mm ${state.paper.h.toFixed(1)}mm; margin: 0; }`;
}

/* ---------- Final preview modal ---------- */
async function showFinalPreview() {
  const { pages, totalPrints } = buildLayout();
  if (!pages.length) { alert('Add photos first.'); return; }

  btnPreviewFinal.disabled = true;
  btnPreviewFinal.textContent = 'Rendering…';
  try {
    await prepareExportImages();
    finalPages.innerHTML = '';
    for (const pg of pages) {
      const canvas = await renderPageCanvas(pg);
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      finalPages.appendChild(img);
    }
    let info = `${pages.length} page(s) · ${Math.round(state.paper.w)}×${Math.round(state.paper.h)} mm · ${EXPORT_DPI} DPI · ` +
               `${totalPrints} prints · brightness boost +${state.printBoost}%`;
    if (!FILTERS_OK) info += ' · ⚠ this browser does not support canvas filters — adjustments not applied to export';
    finalInfo.textContent = info;
    finalModal.classList.remove('hidden');
  } catch (err) {
    alert('Could not render the final output.');
    console.error(err);
  } finally {
    btnPreviewFinal.disabled = false;
    btnPreviewFinal.textContent = '👁 Preview final output';
  }
}

finalClose.addEventListener('click', () => finalModal.classList.add('hidden'));
finalModal.addEventListener('click', e => { if (e.target === finalModal) finalModal.classList.add('hidden'); });

/* ---------- Print / Save as PDF ---------- */
async function doPrint() {
  const { pages } = buildLayout();
  if (!pages.length) { alert('Add photos first.'); return; }

  btnPrint.disabled = true;
  btnPrint.textContent = 'Preparing…';
  try {
    await prepareExportImages();
    printRoot.innerHTML = '';
    setPageSizeStyle();

    for (const pg of pages) {
      const canvas = await renderPageCanvas(pg);
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.className = 'print-page';
      img.style.width  = state.paper.w + 'mm';
      img.style.height = state.paper.h + 'mm';
      printRoot.appendChild(img);
    }

    window.print();
  } catch (err) {
    alert('Could not prepare the print output.');
    console.error(err);
  } finally {
    btnPrint.disabled = false;
    btnPrint.textContent = '🖨 Print / Save PDF';
  }
}

btnPreviewFinal.addEventListener('click', showFinalPreview);
btnPrint.addEventListener('click', doPrint);
finalPrint.addEventListener('click', doPrint);

/* ---------- Boot ---------- */
initSelects(); renderSlots(); renderPreview();