import type { Point } from "../vastu/types.ts";

export type Raster = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type SegmentRegion = {
  polygon: Point[];
  area: number;
  fillRatio: number;
};

export type SegmentResult = {
  regions: SegmentRegion[];
  note: string;
  inkRatio: number;
};

function integralImage(src: ArrayLike<number>, w: number, h: number): Float64Array {
  const I = new Float64Array((w + 1) * (h + 1));
  const stride = w + 1;
  for (let y = 1; y <= h; y++) {
    let row = 0;
    const srcRow = (y - 1) * w;
    const rowI = y * stride;
    const prev = (y - 1) * stride;
    for (let x = 1; x <= w; x++) {
      row += src[srcRow + (x - 1)] ?? 0;
      I[rowI + x] = (I[prev + x] ?? 0) + row;
    }
  }
  return I;
}

function rectSum(I: Float64Array, w: number, x0: number, y0: number, x1: number, y1: number): number {
  const stride = w + 1;
  return (I[y1 * stride + x1] ?? 0) - (I[y0 * stride + x1] ?? 0) - (I[y1 * stride + x0] ?? 0) + (I[y0 * stride + x0] ?? 0);
}

function grayscale(raster: Raster): Uint8Array {
  const { width, height, data } = raster;
  const gray = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    gray[p] = ((data[i] ?? 0) * 77 + (data[i + 1] ?? 0) * 150 + (data[i + 2] ?? 0) * 29) >> 8;
  }
  return gray;
}

function wallMask(gray: Uint8Array, w: number, h: number): { wall: Uint8Array; inkRatio: number } {
  const rad = Math.max(3, Math.round(Math.min(w, h) / 70));
  const integ = integralImage(gray, w, h);
  const wall = new Uint8Array(w * h);
  let ink = 0;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - rad);
    const y1 = Math.min(h, y + rad + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - rad);
      const x1 = Math.min(w, x + rad + 1);
      const area = (x1 - x0) * (y1 - y0);
      const mean = rectSum(integ, w, x0, y0, x1, y1) / area;
      const g = gray[y * w + x] ?? 255;
      if ((g < mean - 16 && g < 215) || g < 78) {
        wall[y * w + x] = 1;
        ink += 1;
      }
    }
  }
  return { wall, inkRatio: ink / (w * h) };
}

function dilate(wall: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return wall;
  const integ = integralImage(wall, w, h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      if (rectSum(integ, w, x0, y0, x1, y1) > 0) out[y * w + x] = 1;
    }
  }
  return out;
}

type RawRegion = {
  id: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  touchesBorder: boolean;
};

function labelSpaces(space: Uint8Array, w: number, h: number): { labels: Int32Array; regions: RawRegion[] } {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const regions: RawRegion[] = [];
  let next = 0;
  for (let i = 0; i < space.length; i++) {
    if (!space[i] || labels[i]) continue;
    next += 1;
    let sp = 0;
    stack[sp++] = i;
    labels[i] = next;
    let area = 0;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    let touchesBorder = false;
    while (sp) {
      const p = stack[--sp] ?? 0;
      const x = p % w;
      const y = (p / w) | 0;
      area += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;
      const tryPush = (q: number) => {
        if (space[q] && !labels[q]) {
          labels[q] = next;
          stack[sp++] = q;
        }
      };
      if (x > 0) tryPush(p - 1);
      if (x + 1 < w) tryPush(p + 1);
      if (y > 0) tryPush(p - w);
      if (y + 1 < h) tryPush(p + w);
    }
    regions.push({ id: next, area, minX, minY, maxX, maxY, touchesBorder });
  }
  return { labels, regions };
}

function rdp(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) return points;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    if (!p) continue;
    const dist = pointLineDistance(p, start, end);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [start, end];
}

function pointLineDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

function traceContour(labels: Int32Array, w: number, h: number, id: number, region: RawRegion): Point[] {
  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  let sx = -1;
  let sy = -1;
  for (let y = region.minY; y <= region.maxY && sx < 0; y++) {
    for (let x = region.minX; x <= region.maxX; x++) {
      if (labels[y * w + x] === id) {
        sx = x;
        sy = y;
        break;
      }
    }
  }
  if (sx < 0) return bboxPoly(region);
  const isIn = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === id;
  let x = sx;
  let y = sy;
  let dir = 6;
  const raw: Point[] = [{ x, y }];
  const limit = Math.min(12000, region.area * 4);
  for (let step = 0; step < limit; step++) {
    let found = false;
    for (let turn = 0; turn < 8; turn++) {
      const nd = (dir + turn) % 8;
      const delta = dirs[nd];
      if (!delta) continue;
      const nx = x + delta[0];
      const ny = y + delta[1];
      if (isIn(nx, ny)) {
        x = nx;
        y = ny;
        if (step % 2 === 0) raw.push({ x, y });
        dir = (nd + 5) % 8;
        found = true;
        break;
      }
    }
    if (!found) break;
    if (x === sx && y === sy && raw.length > 8) break;
  }
  if (raw.length < 8) return bboxPoly(region);
  const simplified = rdp(raw, Math.max(1.5, Math.min(w, h) * 0.012));
  if (simplified.length < 3 || simplified.length > 48) return bboxPoly(region);
  return simplified;
}

function bboxPoly(region: RawRegion): Point[] {
  return [
    { x: region.minX, y: region.minY },
    { x: region.maxX, y: region.minY },
    { x: region.maxX, y: region.maxY },
    { x: region.minX, y: region.maxY },
  ];
}

function regionsFromWall(wall: Uint8Array, w: number, h: number): SegmentRegion[] {
  const space = new Uint8Array(w * h);
  for (let i = 0; i < wall.length; i++) space[i] = wall[i] ? 0 : 1;
  const { labels, regions } = labelSpaces(space, w, h);
  const page = w * h;
  const interior = regions.filter((region) => !region.touchesBorder);
  const pool = interior.length ? interior : regions.filter((region) => !region.touchesBorder || region.area < page * 0.45);
  const kept = pool.filter((region) => {
    const bw = region.maxX - region.minX + 1;
    const bh = region.maxY - region.minY + 1;
    const boxArea = bw * bh;
    const fill = region.area / boxArea;
    if (region.area < page * 0.004) return false;
    if (region.area > page * 0.62) return false;
    if (Math.min(bw, bh) < 8) return false;
    if (Math.max(bw, bh) / Math.min(bw, bh) > 14) return false;
    if (fill < 0.35) return false;
    return true;
  });
  kept.sort((a, b) => b.area - a.area);
  return kept.slice(0, 24).map((region) => {
    const bw = region.maxX - region.minX + 1;
    const bh = region.maxY - region.minY + 1;
    const fillRatio = region.area / (bw * bh);
    const polygon = fillRatio > 0.78 ? bboxPoly(region) : traceContour(labels, w, h, region.id, region);
    return { polygon, area: region.area, fillRatio };
  });
}

function passScore(regions: SegmentRegion[]): number {
  const n = regions.length;
  if (n === 0) return 0;
  if (n === 1) return 2;
  const fill = regions.reduce((sum, region) => sum + region.fillRatio, 0) / n;
  if (n > 18) return 8 - (n - 18) + fill;
  return 12 + n + fill * 4;
}

export function segmentBlueprint(raster: Raster): SegmentResult {
  const { width, height } = raster;
  if (width < 16 || height < 16) {
    return { regions: [], note: "Image is too small to trace walls.", inkRatio: 0 };
  }
  const gray = grayscale(raster);
  const { wall, inkRatio } = wallMask(gray, width, height);
  if (inkRatio < 0.002) {
    return { regions: [], note: "Almost no dark linework was found, so no room regions were traced.", inkRatio };
  }
  if (inkRatio > 0.72) {
    return {
      regions: [],
      note: "The sheet is too dark to separate walls from rooms. Draw the rooms yourself.",
      inkRatio,
    };
  }
  const radii = [1, 2, 3, 4, 6, 8, 0];
  let best: SegmentRegion[] = [];
  let bestScore = -1;
  let bestRadius = 0;
  for (const radius of radii) {
    const closed = dilate(wall, width, height, radius);
    const regions = regionsFromWall(closed, width, height);
    const score = passScore(regions) - radius * 0.05;
    if (score > bestScore) {
      best = regions;
      bestScore = score;
      bestRadius = radius;
    }
  }
  const note =
    best.length === 0
      ? "Wall tracing did not find enclosed rooms. Labels, if any, stay as editable boxes."
      : best.length === 1
        ? "Wall tracing found one enclosed region. Interior doors may still be joining rooms."
        : `Wall tracing found ${best.length} regions after bridging gaps of about ${bestRadius} px on the working image.`;
  return { regions: best, note, inkRatio };
}

export function normalizeRegions(regions: SegmentRegion[], width: number, height: number): SegmentRegion[] {
  return regions.map((region) => ({
    ...region,
    polygon: region.polygon.map((point) => ({
      x: Math.min(1, Math.max(0, point.x / width)),
      y: Math.min(1, Math.max(0, point.y / height)),
    })),
  }));
}
