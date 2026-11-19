import type { MatchedLabel, OcrWord, RoomCategory, TextBlock } from "./types.ts";
import { boxIou } from "./geometry.ts";

type Pattern = {
  re: RegExp;
  category: RoomCategory;
  label: (raw: string, match: RegExpMatchArray) => string;
  note?: string;
  confidenceScale?: number;
};

const PATTERNS: Pattern[] = [
  {
    re: /\bmaster\s+bed(?:\s*room)?\b/,
    category: "Master Bedroom",
    label: () => "Master Bedroom",
  },
  {
    re: /\bbed(?:\s*room)?\s+(\d+)\b/,
    category: "Bedroom",
    label: (_raw, match) => `Bedroom ${match[1]}`,
  },
  {
    re: /\b(?:living(?:\s+room)?|drawing(?:\s+room)?|lounge)\b/,
    category: "Living Room",
    label: () => "Living Room",
  },
  {
    re: /\bhall\b/,
    category: "Living Room",
    label: () => "Hall",
    note: "Hall was read as a living room. Rename it if it is only a corridor.",
    confidenceScale: 0.72,
  },
  { re: /\bkitchen\b/, category: "Kitchen", label: () => "Kitchen" },
  {
    re: /\b(?:pooja|puja|mandir|prayer(?:\s+room)?)\b/,
    category: "Pooja Room",
    label: () => "Pooja Room",
  },
  { re: /\bbath(?:\s*room)?\b/, category: "Bathroom", label: () => "Bathroom" },
  { re: /\b(?:toilet|wc)\b/, category: "Toilet", label: () => "Toilet" },
  {
    re: /\b(?:staircase|stairs|stair)\b/,
    category: "Staircase",
    label: () => "Staircase",
  },
  {
    re: /\b(?:garage|carport|car\s+port)\b/,
    category: "Parking",
    label: () => "Garage",
    note: "Garage is scored in the parking category. It was not renamed silently.",
  },
  { re: /\b(?:parking|car\s+park)\b/, category: "Parking", label: () => "Parking" },
  { re: /\bdining(?:\s+room)?\b/, category: "Dining Room", label: () => "Dining Room" },
  {
    re: /\b(?:storage|storeroom|store\s+room)\b/,
    category: "Storage",
    label: (raw) => (raw.includes("storage") ? "Storage" : "Store"),
    note: "Storage and store share one category and stay separate from other rooms.",
  },
  {
    re: /\bstore\b/,
    category: "Storage",
    label: () => "Store",
    note: "Store was kept as storage, not folded into another room.",
  },
  { re: /\butility(?:\s+area)?\b/, category: "Utility", label: () => "Utility" },
  { re: /\bbalcony\b/, category: "Balcony", label: () => "Balcony" },
  { re: /\b(?:lobby|foyer)\b/, category: "Lobby", label: () => "Lobby" },
  {
    re: /\b(?:garden|lawn|open\s+space)\b/,
    category: "Garden",
    label: (raw) => (raw.includes("open space") ? "Open Space" : raw.includes("lawn") ? "Lawn" : "Garden"),
    note: "Kept as garden or open space. It was not converted into a living room.",
  },
  {
    re: /\bstudio\b/,
    category: "Studio",
    label: () => "Studio",
    note: "Studio was not reclassified as a study.",
  },
  {
    re: /\b(?:study|office)\b/,
    category: "Study",
    label: (raw) => (raw.includes("office") ? "Office" : "Study"),
  },
  {
    re: /\b(?:entrance|main\s+door|entry)\b/,
    category: "Entrance",
    label: () => "Entrance",
  },
  { re: /\bbed(?:\s*room)?\b/, category: "Bedroom", label: () => "Bedroom" },
];

export function normalizeLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchRoomText(text: string): {
  name: string;
  category: RoomCategory;
  notes: string[];
  confidenceScale: number;
} | null {
  const raw = normalizeLabel(text);
  if (!raw || raw.length < 3) return null;
  for (const pattern of PATTERNS) {
    const match = raw.match(pattern.re);
    if (!match) continue;
    const notes = pattern.note ? [pattern.note] : [];
    if (raw === "living") notes.push("The label was only LIVING and was read as Living Room.");
    return {
      name: pattern.label(raw, match),
      category: pattern.category,
      notes,
      confidenceScale: pattern.confidenceScale ?? 1,
    };
  }
  return null;
}

function unionBox(words: OcrWord[]): TextBlock {
  const x0 = Math.min(...words.map((w) => w.x0));
  const y0 = Math.min(...words.map((w) => w.y0));
  const x1 = Math.max(...words.map((w) => w.x1));
  const y1 = Math.max(...words.map((w) => w.y1));
  const confidence = words.reduce((sum, w) => sum + w.confidence, 0) / words.length;
  return {
    text: words.map((w) => w.text).join(" "),
    x0,
    y0,
    x1,
    y1,
    confidence,
    lineCount: 1,
  };
}

function xOverlap(a: TextBlock, b: TextBlock): number {
  const iw = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const minW = Math.max(0.001, Math.min(a.x1 - a.x0, b.x1 - b.x0));
  return iw / minW;
}

export function groupWords(words: OcrWord[]): TextBlock[] {
  const clean = words.filter((word) => word.text.trim() && word.confidence >= 35);
  const sorted = [...clean].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0);
  const lines: OcrWord[][] = [];
  for (const word of sorted) {
    const cy = (word.y0 + word.y1) / 2;
    const h = Math.max(0.004, word.y1 - word.y0);
    let placed = false;
    for (const line of lines) {
      const ly = line.reduce((sum, w) => sum + (w.y0 + w.y1) / 2, 0) / line.length;
      const lh = line.reduce((sum, w) => sum + Math.max(0.004, w.y1 - w.y0), 0) / line.length;
      if (Math.abs(cy - ly) <= Math.max(h, lh) * 0.65) {
        line.push(word);
        placed = true;
        break;
      }
    }
    if (!placed) lines.push([word]);
  }

  const phrases: TextBlock[] = [];
  for (const line of lines) {
    const ordered = [...line].sort((a, b) => a.x0 - b.x0);
    let cluster: OcrWord[] = [];
    let prev: OcrWord | null = null;
    const flush = () => {
      if (cluster.length) phrases.push(unionBox(cluster));
      cluster = [];
    };
    for (const word of ordered) {
      const h = Math.max(0.004, word.y1 - word.y0);
      if (prev && word.x0 - prev.x1 > h * 2.8) flush();
      cluster.push(word);
      prev = word;
    }
    flush();
  }

  const used = new Set<number>();
  const merged: TextBlock[] = [];
  const order = phrases.map((block, index) => ({ block, index })).sort((a, b) => a.block.y0 - b.block.y0);
  for (let i = 0; i < order.length; i++) {
    const current = order[i];
    if (!current || used.has(current.index)) continue;
    let block = { ...current.block };
    used.add(current.index);
    for (let j = i + 1; j < order.length; j++) {
      const next = order[j];
      if (!next || used.has(next.index) || block.lineCount >= 2) continue;
      const gap = next.block.y0 - block.y1;
      const h = Math.max(block.y1 - block.y0, next.block.y1 - next.block.y0, 0.004);
      if (xOverlap(block, next.block) > 0.45 && gap >= -h * 0.35 && gap < h * 0.9) {
        block = {
          text: `${block.text} ${next.block.text}`,
          x0: Math.min(block.x0, next.block.x0),
          y0: Math.min(block.y0, next.block.y0),
          x1: Math.max(block.x1, next.block.x1),
          y1: Math.max(block.y1, next.block.y1),
          confidence: (block.confidence + next.block.confidence) / 2,
          lineCount: block.lineCount + 1,
        };
        used.add(next.index);
      }
    }
    merged.push(block);
  }
  return merged;
}

export function matchBlocks(blocks: TextBlock[]): MatchedLabel[] {
  const found: MatchedLabel[] = [];
  for (const block of blocks) {
    const match = matchRoomText(block.text);
    if (!match) continue;
    const notes = [...match.notes];
    if (block.lineCount > 1) notes.push("Joined a label that was split across lines.");
    found.push({
      name: match.name,
      category: match.category,
      text: block.text,
      x0: block.x0,
      y0: block.y0,
      x1: block.x1,
      y1: block.y1,
      cx: (block.x0 + block.x1) / 2,
      cy: (block.y0 + block.y1) / 2,
      confidence: Math.max(0, Math.min(1, (block.confidence / 100) * match.confidenceScale)),
      notes,
    });
  }
  return dedupeLabels(found);
}

export function dedupeLabels(items: MatchedLabel[]): MatchedLabel[] {
  const kept: MatchedLabel[] = [];
  const sorted = [...items].sort((a, b) => b.confidence - a.confidence);
  for (const item of sorted) {
    const clash = kept.find((other) => {
      const dist = Math.hypot(other.cx - item.cx, other.cy - item.cy);
      const iou = boxIou(other, item);
      return iou > 0.3 || dist < 0.04;
    });
    if (!clash) kept.push(item);
  }
  return kept;
}

export function disambiguateNames(items: MatchedLabel[]): MatchedLabel[] {
  const groups = new Map<string, MatchedLabel[]>();
  for (const item of items) {
    const list = groups.get(item.name) ?? [];
    list.push(item);
    groups.set(item.name, list);
  }
  for (const [name, list] of groups) {
    if (list.length < 2 || /\d/.test(name)) continue;
    list.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    list.forEach((item, index) => {
      item.name = `${name} ${index + 1}`;
      item.notes = [
        ...item.notes,
        "Kept as its own room. The repeated name was numbered from its position.",
      ];
    });
  }
  return items;
}
