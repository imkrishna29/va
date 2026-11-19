import { pointInPolygon, rectPolygon } from "../vastu/geometry.ts";
import { disambiguateNames, matchBlocks } from "../vastu/match.ts";
import type { MatchedLabel, Point, Room, TextBlock } from "../vastu/types.ts";
import type { SegmentRegion } from "./segment.ts";

export type AssembleResult = {
  rooms: Room[];
  matchedLabels: string[];
  labelsInsideRegions: number;
};

function labelBox(label: MatchedLabel): Point[] {
  const cx = label.cx;
  const cy = label.cy;
  const w = Math.min(0.24, Math.max(0.09, (label.x1 - label.x0) * 2.6));
  const h = Math.min(0.18, Math.max(0.07, (label.y1 - label.y0) * 3.2));
  return rectPolygon(cx - w / 2, cy - h / 2, w, h);
}

function isRect(polygon: Point[]): boolean {
  if (polygon.length !== 4) return false;
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  return new Set(xs.map((x) => x.toFixed(3))).size <= 2 && new Set(ys.map((y) => y.toFixed(3))).size <= 2;
}

let roomSerial = 1;

export function resetRoomIds(start = 1): void {
  roomSerial = start;
}

function nextId(): string {
  const id = `room-${roomSerial}`;
  roomSerial += 1;
  return id;
}

export function assembleRooms(blocks: TextBlock[], regions: SegmentRegion[]): AssembleResult {
  return assembleFromLabels(disambiguateNames(matchBlocks(blocks)), regions);
}

export function assembleFromLabels(labels: MatchedLabel[], regions: SegmentRegion[]): AssembleResult {
  const owners = new Map<number, number[]>();
  labels.forEach((label, index) => {
    regions.forEach((region, regionIndex) => {
      if (pointInPolygon({ x: label.cx, y: label.cy }, region.polygon)) {
        const list = owners.get(regionIndex) ?? [];
        list.push(index);
        owners.set(regionIndex, list);
      }
    });
  });

  const rooms: Room[] = [];
  let inside = 0;
  const usedRegions = new Set<number>();

  labels.forEach((label, index) => {
    const regionIndex = [...owners.entries()].find(([, ids]) => ids.length === 1 && ids[0] === index)?.[0];
    const shared = [...owners.values()].some((ids) => ids.length > 1 && ids.includes(index));
    const notes = [...label.notes];
    let polygon = labelBox(label);
    let boundaryStatus: Room["boundaryStatus"] = "label";
    let shape: Room["shape"] = "rect";
    if (regionIndex !== undefined) {
      const region = regions[regionIndex];
      if (region) {
        polygon = region.polygon;
        boundaryStatus = "segment";
        shape = isRect(polygon) ? "rect" : "poly";
        usedRegions.add(regionIndex);
        inside += 1;
        notes.push("Label sits inside a traced region. The boundary is still approximate.");
      }
    } else if (shared) {
      notes.push("This label shares a traced region with another label. Resize each room yourself.");
    } else {
      notes.push("No enclosed region contained this label. The box marks the text, not the walls.");
    }
    rooms.push({
      id: nextId(),
      name: label.name,
      category: label.category,
      polygon,
      shape,
      source: "ocr",
      boundaryStatus,
      confidence: label.confidence,
      verified: false,
      notes,
      ocrText: label.text,
    });
  });

  regions.forEach((region, index) => {
    if (usedRegions.has(index) || (owners.get(index)?.length ?? 0) > 0) return;
    rooms.push({
      id: nextId(),
      name: "Unlabeled region",
      category: "Unlabeled",
      polygon: region.polygon,
      shape: isRect(region.polygon) ? "rect" : "poly",
      source: "segment",
      boundaryStatus: "segment",
      confidence: Math.max(0.35, Math.min(0.7, region.fillRatio)),
      verified: false,
      notes: ["Traced from walls, but no room name was found inside it."],
    });
  });

  return {
    rooms,
    matchedLabels: labels.map((label) => label.name),
    labelsInsideRegions: inside,
  };
}

export function confidenceWord(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.6) return "medium";
  return "low";
}
