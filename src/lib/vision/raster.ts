import type { Raster } from "./segment.ts";

export function limitCanvas(source: HTMLCanvasElement, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  if (scale === 1) return source;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasRaster(source: HTMLCanvasElement, maxEdge: number): Raster {
  const canvas = limitCanvas(source, maxEdge);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(canvas.width * canvas.height * 4) };
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: image.data };
}

export function contrastCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  const hist = new Uint32Array(256);
  const count = canvas.width * canvas.height;
  for (let i = 0, p = 0; p < count; i += 4, p++) {
    const g = ((data[i] ?? 0) * 77 + (data[i + 1] ?? 0) * 150 + (data[i + 2] ?? 0) * 29) >> 8;
    hist[g] = (hist[g] ?? 0) + 1;
    data[i] = g;
  }
  const lowCut = count * 0.02;
  const highCut = count * 0.02;
  let seen = 0;
  let lo = 0;
  for (let i = 0; i < 256; i++) {
    seen += hist[i] ?? 0;
    if (seen >= lowCut) {
      lo = i;
      break;
    }
  }
  seen = 0;
  let hi = 255;
  for (let i = 255; i >= 0; i--) {
    seen += hist[i] ?? 0;
    if (seen >= highCut) {
      hi = i;
      break;
    }
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0, p = 0; p < count; i += 4, p++) {
    const v = Math.max(0, Math.min(255, (((data[i] ?? 0) - lo) * 255) / span));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function binaryCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const v = (data[i] ?? 255) < 150 ? 0 : 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
