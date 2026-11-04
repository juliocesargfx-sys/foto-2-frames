import {
  OUT,
  MAX_ZOOM,
  coverScale,
  initialState,
  drawRect,
  panBy,
  zoomAt,
  effectiveScale,
} from './crop.js';
import { encodeStill, isSupported, FPS, FRAMES } from './video.js';

const $ = (id) => document.getElementById(id);
const ui = {
  pick: $('step-pick'),
  edit: $('step-edit'),
  dropzone: $('dropzone'),
  file: $('file'),
  canvas: $('canvas'),
  zoom: $('zoom'),
  center: $('center'),
  change: $('change'),
  warn: $('warn'),
  generate: $('generate'),
  done: $('done'),
  meta: $('meta'),
  share: $('share'),
  download: $('download'),
  error: $('error'),
};
const ctx = ui.canvas.getContext('2d', { alpha: false });

// Limite de memória: nunca guardamos mais pixels do que o zoom máximo precisa,
// nem mais de ~16 MP (limite seguro para celulares).
const MAX_PIXELS = 16_000_000;

let bitmap = null;           // imagem decodificada (já reduzida se for gigante)
let img = null;              // { w, h } do bitmap
let state = initialState();
let baseName = 'foto';
let videoFile = null;
let videoUrl = null;
const supported = isSupported(OUT.w, OUT.h);

ui.zoom.max = String(MAX_ZOOM);

// ---------- mensagens ----------

function showError(msg) {
  ui.error.textContent = msg;
  ui.error.hidden = !msg;
}

// ---------- carregar imagem ----------

function decodeWithImgTag(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      createImageBitmap(el).then(resolve, reject).finally(() => URL.revokeObjectURL(url));
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    el.src = url;
  });
}

async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return decodeWithImgTag(file);
  }
}

async function shrinkIfHuge(bmp) {
  const byZoom = coverScale({ w: bmp.width, h: bmp.height }, OUT) * MAX_ZOOM;
  const byMemory = Math.sqrt(MAX_PIXELS / (bmp.width * bmp.height));
  const s = Math.min(1, byZoom, byMemory);
  if (s >= 0.999) return bmp;
  try {
    const small = await createImageBitmap(bmp, {
      resizeWidth: Math.max(1, Math.round(bmp.width * s)),
      resizeHeight: Math.max(1, Math.round(bmp.height * s)),
      resizeQuality: 'high',
    });
    bmp.close();
    return small;
  } catch {
    return bmp; // se o navegador não reduzir, segue com a original
  }
}

function nameFrom(file) {
  const raw = (file.name || 'foto').replace(/\.[^.]+$/, '');
  const clean = raw.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return clean || 'foto';
}

async function loadFile(file) {
  if (!file) return;
  if (file.type && !file.type.startsWith('image/')) {
    showError('Esse arquivo não é uma imagem. Escolha um JPG, PNG ou WebP.');
    return;
  }
  showError('');

  let bmp;
  try {
    bmp = await shrinkIfHuge(await decode(file));
  } catch {
    showError('Não consegui abrir essa imagem neste navegador. Salve como JPG ou PNG e tente de novo.');
    return;
  }

  bitmap?.close();
  bitmap = bmp;
  img = { w: bmp.width, h: bmp.height };
  baseName = nameFrom(file);
  state = initialState();

  ui.pick.hidden = true;
  ui.edit.hidden = false;
  changed();

  if (!(await supported)) {
    ui.generate.disabled = true;
    showError('Este navegador não consegue gerar vídeo MP4. Abra a página no Chrome, Edge, Firefox ou Safari atualizados (iPhone com iOS 16.4 ou mais novo).');
  }
}

// ---------- desenhar ----------

let frameRequested = false;

function render() {
  frameRequested = false;
  if (!bitmap) return;
  const r = drawRect(state, img, OUT);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, OUT.w, OUT.h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, r.x, r.y, r.w, r.h);
}

function scheduleRender() {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(render);
}

/** Chamado sempre que o enquadramento muda: o vídeo gerado antes deixa de valer. */
function changed() {
  ui.zoom.value = String(state.zoom);
  ui.warn.hidden = effectiveScale(state, img, OUT) <= 1.05;
  clearResult();
  scheduleRender();
}

function setState(next) {
  if (next.zoom === state.zoom && next.cx === state.cx && next.cy === state.cy) return;
  state = next;
  changed();
}

// ---------- gestos ----------

function toOut(e) {
  const r = ui.canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * OUT.w,
    y: ((e.clientY - r.top) / r.height) * OUT.h,
  };
}

const pointers = new Map();

ui.canvas.addEventListener('pointerdown', (e) => {
  if (!bitmap) return;
  try { ui.canvas.setPointerCapture(e.pointerId); } catch { /* segue sem captura */ }
  pointers.set(e.pointerId, toOut(e));
});

ui.canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  const cur = toOut(e);

  if (pointers.size === 1) {
    pointers.set(e.pointerId, cur);
    setState(panBy(state, cur.x - prev.x, cur.y - prev.y, img, OUT));
    return;
  }

  // dois dedos: pinça (zoom) + arrastar pelo ponto médio
  const [a, b] = [...pointers.values()];
  const oldMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const oldDist = Math.hypot(a.x - b.x, a.y - b.y);
  pointers.set(e.pointerId, cur);
  const [c, d] = [...pointers.values()];
  const newMid = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
  const newDist = Math.hypot(c.x - d.x, c.y - d.y);

  let next = state;
  if (oldDist > 0) next = zoomAt(next, next.zoom * (newDist / oldDist), oldMid.x, oldMid.y, img, OUT);
  next = panBy(next, newMid.x - oldMid.x, newMid.y - oldMid.y, img, OUT);
  setState(next);
});

const endPointer = (e) => pointers.delete(e.pointerId);
ui.canvas.addEventListener('pointerup', endPointer);
ui.canvas.addEventListener('pointercancel', endPointer);

ui.canvas.addEventListener('wheel', (e) => {
  if (!bitmap) return;
  e.preventDefault();
  const p = toOut(e);
  setState(zoomAt(state, state.zoom * Math.exp(-e.deltaY * 0.0015), p.x, p.y, img, OUT));
}, { passive: false });

ui.canvas.addEventListener('keydown', (e) => {
  if (!bitmap) return;
  const step = e.shiftKey ? 100 : 25;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (moves[e.key]) {
    e.preventDefault();
    setState(panBy(state, moves[e.key][0], moves[e.key][1], img, OUT));
  } else if (e.key === '+' || e.key === '=') {
    e.preventDefault();
    setState(zoomAt(state, state.zoom * 1.1, OUT.w / 2, OUT.h / 2, img, OUT));
  } else if (e.key === '-') {
    e.preventDefault();
    setState(zoomAt(state, state.zoom / 1.1, OUT.w / 2, OUT.h / 2, img, OUT));
  }
});

ui.zoom.addEventListener('input', () => {
  setState(zoomAt(state, Number(ui.zoom.value), OUT.w / 2, OUT.h / 2, img, OUT));
});

ui.center.addEventListener('click', () => setState(initialState()));

// ---------- escolher / trocar arquivo ----------

ui.file.addEventListener('change', () => {
  const f = ui.file.files?.[0];
  ui.file.value = ''; // permite escolher o mesmo arquivo de novo
  loadFile(f);
});

ui.change.addEventListener('click', () => ui.file.click());

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  ui.dropzone.classList.add('over');
});
window.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) ui.dropzone.classList.remove('over');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  ui.dropzone.classList.remove('over');
  loadFile(e.dataTransfer?.files?.[0]);
});

// ---------- gerar vídeo ----------

function clearResult() {
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = null;
  videoFile = null;
  ui.done.hidden = true;
  ui.generate.hidden = false;
}

function formatSize(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

ui.generate.addEventListener('click', async () => {
  if (!bitmap) return;
  ui.generate.disabled = true;
  ui.generate.textContent = 'Gerando…';
  showError('');
  try {
    render(); // garante que o canvas está com o enquadramento final
    const blob = await encodeStill(ui.canvas, { fps: FPS, frames: FRAMES });
    videoFile = new File([blob], `${baseName}-2frames.mp4`, { type: 'video/mp4' });
    videoUrl = URL.createObjectURL(blob);

    ui.download.href = videoUrl;
    ui.download.download = videoFile.name;
    const seconds = (FRAMES / FPS).toFixed(2).replace('.', ',');
    ui.meta.textContent = `${FRAMES} frames · ${OUT.w}×${OUT.h} · ${seconds} s · ${formatSize(blob.size)}`;

    const canShare = !!navigator.canShare?.({ files: [videoFile] });
    ui.share.hidden = !canShare;
    // No celular o "compartilhar" é o caminho para salvar na galeria; aí o download vira secundário.
    ui.download.classList.toggle('primary', !canShare);
    ui.download.classList.toggle('secondary', canShare);
    ui.download.textContent = canShare ? 'Baixar arquivo' : 'Baixar vídeo';

    ui.generate.hidden = true;
    ui.done.hidden = false;
  } catch (err) {
    console.error(err);
    showError('Não foi possível gerar o vídeo neste navegador. Tente pelo Chrome ou Safari atualizados.');
  } finally {
    ui.generate.disabled = false;
    ui.generate.textContent = 'Gerar vídeo';
  }
});

ui.share.addEventListener('click', async () => {
  if (!videoFile) return;
  try {
    await navigator.share({ files: [videoFile] });
  } catch (err) {
    if (err?.name !== 'AbortError') {
      showError('Não deu para abrir o compartilhamento. Use "Baixar arquivo".');
    }
  }
});
