import type { BBox, Compass, NorthHeading, Point, ZoneShare } from "./types.ts";

export function rotateToNorthUp(p: Point, north: Exclude<NorthHeading, "unknown">): Point {
  switch (north) {
    case "N":
      return { x: p.x, y: p.y };
    case "E":
      return { x: p.y, y: 1 - p.x };
    case "S":
      return { x: 1 - p.x, y: 1 - p.y };
    case "W":
      return { x: 1 - p.y, y: p.x };
  }
}

export function cellZone(x: number, y: number): Compass {
  const col = x < 1 / 3 ? "W" : x > 2 / 3 ? "E" : "";
  const row = y < 1 / 3 ? "N" : y > 2 / 3 ? "S" : "";
  if (!col && !row) return "C";
  return `${row}${col}` as Compass;
}

export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const intersect =
      a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + 0.0) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonBBox(polygon: Point[]): BBox {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of polygon) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!polygon.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

export function unionBBox(polygons: Point[][]): BBox {
  if (!polygons.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return polygonBBox(polygons.flat());
}

export function rectPolygon(x: number, y: number, w: number, h: number): Point[] {
  const x2 = clamp01(x + w);
  const y2 = clamp01(y + h);
  const x1 = clamp01(x);
  const y1 = clamp01(y);
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function zoneShares(
  polygon: Point[],
  building: BBox,
  north: Exclude<NorthHeading, "unknown">,
): ZoneShare[] {
  const bw = building.maxX - building.minX;
  const bh = building.maxY - building.minY;
  if (bw < 1e-6 || bh < 1e-6 || polygon.length < 3) return [];
  const box = polygonBBox(polygon);
  const steps = 12;
  const counts = new Map<Compass, number>();
  let total = 0;
  for (let iy = 0; iy < steps; iy++) {
    for (let ix = 0; ix < steps; ix++) {
      const x = box.minX + ((ix + 0.5) / steps) * (box.maxX - box.minX || 1e-6);
      const y = box.minY + ((iy + 0.5) / steps) * (box.maxY - box.minY || 1e-6);
      if (!pointInPolygon({ x, y }, polygon)) continue;
      const rx = (x - building.minX) / bw;
      const ry = (y - building.minY) / bh;
      if (rx < -0.02 || ry < -0.02 || rx > 1.02 || ry > 1.02) continue;
      const northUp = rotateToNorthUp({ x: clamp01(rx), y: clamp01(ry) }, north);
      const zone = cellZone(northUp.x, northUp.y);
      counts.set(zone, (counts.get(zone) ?? 0) + 1);
      total += 1;
    }
  }
  if (!total) return [];
  return [...counts.entries()]
    .map(([zone, count]) => ({ zone, share: count / total }))
    .sort((a, b) => b.share - a.share);
}

export function dominantZone(shares: ZoneShare[]): Compass | "unknown" {
  return shares[0]?.zone ?? "unknown";
}

export function boxIou(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
): number {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  const iw = Math.max(0, x1 - x0);
  const ih = Math.max(0, y1 - y0);
  const inter = iw * ih;
  const areaA = Math.max(0, a.x1 - a.x0) * Math.max(0, a.y1 - a.y0);
  const areaB = Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  const union = areaA + areaB - inter;
  return union <= 0 ? 0 : inter / union;
}
