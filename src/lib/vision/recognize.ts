import { absolutePublicUrl } from "../public-url.ts";
import { dedupeLabels, disambiguateNames, groupWords, matchBlocks } from "../vastu/match.ts";
import type { Diagnostics, MatchedLabel, OcrWord, Room, TextBlock } from "../vastu/types.ts";
import { assembleFromLabels, resetRoomIds } from "./assemble.ts";
import { binaryCanvas, canvasRaster, contrastCanvas, limitCanvas } from "./raster.ts";
import { normalizeRegions, segmentBlueprint } from "./segment.ts";

type WordBox = {
  text?: string;
  confidence?: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
};

type OcrBlock = {
  paragraphs?: {
    lines?: { words?: WordBox[] }[];
  }[];
};

type OcrPage = {
  text?: string;
  blocks?: OcrBlock[] | null;
};

type OcrWorker = {
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  recognize: (
    image: HTMLCanvasElement,
    options: Record<string, unknown>,
    output: { text: boolean; blocks: boolean },
  ) => Promise<{ data: OcrPage }>;
  terminate: () => Promise<unknown>;
};

export type ReadResult = {
  rooms: Room[];
  diagnostics: Omit<Diagnostics, "page" | "pageCount">;
};

function wordsFromPage(page: OcrPage, width: number, height: number): OcrWord[] {
  const words: OcrWord[] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = word.text?.trim() ?? "";
          const box = word.bbox;
          if (!text || !box || (word.confidence ?? -1) < 0) continue;
          words.push({
            text,
            confidence: word.confidence ?? 0,
            x0: box.x0 / width,
            y0: box.y0 / height,
            x1: box.x1 / width,
            y1: box.y1 / height,
          });
        }
      }
    }
  }
  return words;
}

async function recognizePass(
  worker: OcrWorker,
  canvas: HTMLCanvasElement,
  psm: string,
): Promise<{ words: OcrWord[]; text: string }> {
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    user_defined_dpi: "300",
    preserve_interword_spaces: "1",
  });
  const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
  return { words: wordsFromPage(result.data, canvas.width, canvas.height), text: result.data.text ?? "" };
}

export async function readBlueprint(
  source: HTMLCanvasElement,
  onProgress: (label: string, pct: number) => void,
): Promise<ReadResult> {
  const started = performance.now();
  const warnings: string[] = [];
  onProgress("Tracing walls", 0.08);
  const raster = canvasRaster(source, 880);
  const segmented = segmentBlueprint(raster);
  const regions = normalizeRegions(segmented.regions, raster.width, raster.height);

  const view = limitCanvas(source, 1800);
  const contrasted = contrastCanvas(view);
  const passes: Diagnostics["passes"] = [];
  const snippets: string[] = [];
  let labels: MatchedLabel[] = [];
  let characters = 0;

  onProgress("Reading room labels", 0.22);
  const { createWorker } = await import("tesseract.js");
  const worker = (await createWorker("eng", 1, {
    workerPath: absolutePublicUrl("vendor/tesseract/worker.min.js"),
    corePath: absolutePublicUrl("vendor/tesseract/core"),
    langPath: absolutePublicUrl("vendor/tesseract/lang"),
    workerBlobURL: true,
    gzip: true,
    cacheMethod: "readWrite",
    logger: (message: { status?: string; progress?: number }) => {
      if (message.status === "recognizing text" && typeof message.progress === "number") {
        onProgress("Reading room labels", 0.22 + message.progress * 0.6);
      } else if (message.status) {
        onProgress(message.status, 0.18);
      }
    },
  })) as unknown as OcrWorker;

  const run = async (canvas: HTMLCanvasElement, psm: string) => {
    const t0 = performance.now();
    try {
      const pass = await recognizePass(worker, canvas, psm);
      characters += pass.text.length;
      const blocks: TextBlock[] = groupWords(pass.words);
      snippets.push(...blocks.map((block) => block.text).filter(Boolean).slice(0, 12));
      labels = dedupeLabels([...labels, ...matchBlocks(blocks)]);
      passes.push({ psm, words: pass.words.length, ms: Math.round(performance.now() - t0) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Text recognition failed";
      warnings.push(`Label pass PSM ${psm} stopped: ${message.slice(0, 140)}`);
      passes.push({ psm, words: 0, ms: Math.round(performance.now() - t0), error: message.slice(0, 140) });
    }
  };

  try {
    await run(contrasted, "11");
    onProgress("Checking a second reading", 0.72);
    await run(contrasted, "6");
    if (labels.length < 4) {
      onProgress("Trying a high-contrast reading", 0.84);
      await run(binaryCanvas(contrasted), "11");
      warnings.push("A third, black-and-white reading was used because the first two found few room names.");
    }
  } finally {
    await worker.terminate().catch(() => undefined);
  }

  labels = disambiguateNames(labels);
  resetRoomIds();
  const assembled = assembleFromLabels(labels, regions);
  if (!assembled.rooms.length) {
    warnings.push("No room names or enclosed regions were found. Draw the rooms on the plan.");
  } else if (!labels.length) {
    warnings.push("Wall regions were traced, but no supported room names were read. Name each region.");
  }
  warnings.push("Automatic boundaries are proposals. Confirm North and every room before trusting a score.");

  onProgress("Ready for review", 1);
  return {
    rooms: assembled.rooms,
    diagnostics: {
      ms: Math.round(performance.now() - started),
      ocrCharacters: characters,
      passes,
      rawSnippets: [...new Set(snippets)].slice(0, 24),
      matchedLabels: assembled.matchedLabels,
      regionCount: regions.length,
      labelsInsideRegions: assembled.labelsInsideRegions,
      segmentNote: segmented.note,
      warnings,
    },
  };
}
