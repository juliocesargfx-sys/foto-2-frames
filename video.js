// Gera um MP4 (H.264) com N frames iguais a partir do conteúdo atual de um canvas.
// Usa o codificador nativo do navegador (WebCodecs) + Mediabunny para montar o arquivo.
import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  Quality,
  canEncodeVideo,
} from './vendor/mediabunny.lite.js';

export const FPS = 30;
export const FRAMES = 2;

// Quantizador baixo = foto nítida (onde o navegador suporta, ex.: Chrome).
// Onde não suporta (ex.: Safari), cai para um bitrate alto.
// Medido no Chrome com foto 4000×2250 cheia de detalhe: ~700 KB, PSNR ≈ 41 dB.
const quality = () => new Quality({ quantizer: 12, bitrate: 60_000_000 });

/** O navegador consegue gerar H.264 nesse tamanho? */
export async function isSupported(width, height) {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    return await canEncodeVideo('avc', { width, height, quality: quality() });
  } catch {
    return false;
  }
}

/** Codifica o canvas como um vídeo de `frames` frames idênticos. */
export async function encodeStill(canvas, { fps = FPS, frames = FRAMES } = {}) {
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, { codec: 'avc', quality: quality() });
  output.addVideoTrack(source, { frameRate: fps });

  await output.start();
  for (let i = 0; i < frames; i++) {
    await source.add(i / fps, 1 / fps);
  }
  await output.finalize();

  return new Blob([output.target.buffer], { type: 'video/mp4' });
}
