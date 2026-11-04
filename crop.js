// Matemática do corte "preencher 9:16".
// O estado guarda o zoom (1 = só o suficiente para cobrir o quadro) e a posição
// do centro da imagem em coordenadas do vídeo final (1080x1920).
// Todas as funções são puras: recebem o estado e devolvem um novo estado.

export const OUT = Object.freeze({ w: 1080, h: 1920 });
export const MAX_ZOOM = 4;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Escala mínima para a imagem cobrir todo o quadro sem sobrar borda. */
export function coverScale(img, out = OUT) {
  return Math.max(out.w / img.w, out.h / img.h);
}

export function initialState(out = OUT) {
  return { zoom: 1, cx: out.w / 2, cy: out.h / 2 };
}

/** Quantos pixels do vídeo cada pixel da foto ocupa (> 1 = foto esticada). */
export function effectiveScale(state, img, out = OUT) {
  return coverScale(img, out) * state.zoom;
}

/** Garante zoom válido e que a imagem continue cobrindo o quadro inteiro. */
export function clampState(state, img, out = OUT) {
  const zoom = clamp(state.zoom, 1, MAX_ZOOM);
  const s = coverScale(img, out) * zoom;
  const w = img.w * s;
  const h = img.h * s;
  return {
    zoom,
    cx: clamp(state.cx, out.w - w / 2, w / 2),
    cy: clamp(state.cy, out.h - h / 2, h / 2),
  };
}

/** Retângulo onde a imagem deve ser desenhada no canvas 1080x1920. */
export function drawRect(state, img, out = OUT) {
  const s = coverScale(img, out) * state.zoom;
  const w = img.w * s;
  const h = img.h * s;
  return { x: state.cx - w / 2, y: state.cy - h / 2, w, h };
}

/** Arrasta a imagem (dx, dy em pixels do vídeo). */
export function panBy(state, dx, dy, img, out = OUT) {
  return clampState({ ...state, cx: state.cx + dx, cy: state.cy + dy }, img, out);
}

/** Muda o zoom mantendo parado o ponto (fx, fy) — dedo, cursor ou centro. */
export function zoomAt(state, newZoom, fx, fy, img, out = OUT) {
  const zoom = clamp(newZoom, 1, MAX_ZOOM);
  const k = zoom / state.zoom;
  return clampState(
    { zoom, cx: fx + (state.cx - fx) * k, cy: fy + (state.cy - fy) * k },
    img,
    out,
  );
}
