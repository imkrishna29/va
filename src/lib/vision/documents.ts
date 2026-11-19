const MAX_EDGE = 2000;
const MAX_BYTES = 12 * 1024 * 1024;

export function assertFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const ok =
    file.type === "application/pdf" ||
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|tif|tiff|pdf)$/.test(name);
  if (!ok) return "Use a PNG, JPG, WEBP, TIFF, or PDF floor plan.";
  if (file.size > MAX_BYTES) return "That file is over 12 MB. Export a smaller image or a single sheet.";
  if (!file.size) return "That file is empty.";
  return null;
}

export async function fileToCanvas(
  file: File,
  pageNumber = 1,
): Promise<{ canvas: HTMLCanvasElement; pageCount: number; note: string | null }> {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    return renderPdf(await file.arrayBuffer(), pageNumber);
  }
  const canvas = await imageFileToCanvas(file);
  return { canvas, pageCount: 1, note: null };
}

async function imageFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This browser could not open that image. TIFF is the usual cause — export a PNG or PDF.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the drawing.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export async function renderPdf(
  data: ArrayBuffer,
  pageNumber: number,
): Promise<{ canvas: HTMLCanvasElement; pageCount: number; note: string | null }> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default as string;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const copy = data.slice(0);
  const doc = await pdfjs.getDocument({ data: copy }).promise;
  const pageCount = doc.numPages;
  if (pageCount > 20) {
    await doc.destroy();
    throw new Error("PDFs are limited to 20 pages here.");
  }
  const safePage = Math.min(Math.max(1, pageNumber), pageCount);
  const page = await doc.getPage(safePage);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2, MAX_EDGE / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the PDF page.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport }).promise;
  await doc.destroy();
  const note =
    pageCount > 1
      ? `This PDF has ${pageCount} pages. Only the page you select is read — switch pages to review another sheet.`
      : null;
  return { canvas, pageCount, note };
}

export function rotateCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.height;
  canvas.height = source.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

export function canvasUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not preview the drawing."));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}
