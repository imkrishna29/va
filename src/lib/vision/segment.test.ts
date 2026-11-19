import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pointInPolygon } from "../vastu/geometry.ts";
import { assembleRooms, resetRoomIds } from "./assemble.ts";
import { normalizeRegions, segmentBlueprint, type Raster } from "./segment.ts";

function blank(width: number, height: number): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

function ink(raster: Raster, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return;
  const i = (y * raster.width + x) * 4;
  raster.data[i] = 0;
  raster.data[i + 1] = 0;
  raster.data[i + 2] = 0;
}

function stroke(raster: Raster, x0: number, y0: number, x1: number, y1: number, thickness: number, gap?: [number, number]): void {
  const horizontal = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  if (horizontal) {
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    for (let y = y0; y < y0 + thickness; y++) {
      for (let x = left; x <= right; x++) {
        if (gap && x >= gap[0] && x <= gap[1]) continue;
        ink(raster, x, y);
      }
    }
  } else {
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);
    for (let x = x0; x < x0 + thickness; x++) {
      for (let y = top; y <= bottom; y++) {
        if (gap && y >= gap[0] && y <= gap[1]) continue;
        ink(raster, x, y);
      }
    }
  }
}

function nineRoomPlan(): Raster {
  const raster = blank(420, 330);
  const t = 4;
  const xs = [12, 150, 280, 404];
  const ys = [12, 114, 216, 314];
  for (const y of ys) stroke(raster, xs[0] ?? 0, y, (xs[3] ?? 0) - t, y, t);
  for (const x of xs) stroke(raster, x, ys[0] ?? 0, x, (ys[3] ?? 0) - t, t);
  stroke(raster, xs[1] ?? 0, ys[0] ?? 0, xs[1] ?? 0, ys[1] ?? 0, t, [50, 66]);
  stroke(raster, xs[2] ?? 0, ys[1] ?? 0, xs[2] ?? 0, ys[2] ?? 0, t, [150, 166]);
  stroke(raster, xs[0] ?? 0, ys[1] ?? 0, xs[1] ?? 0, ys[1] ?? 0, t, [60, 76]);
  return raster;
}

describe("segmentBlueprint", () => {
  it("finds enclosed rooms even when door gaps cut the walls", () => {
    const raster = nineRoomPlan();
    const result = segmentBlueprint(raster);
    assert.ok(result.regions.length >= 6, `regions=${result.regions.length} ${result.note}`);
    assert.ok(result.regions.length <= 12, result.note);
    const norms = normalizeRegions(result.regions, raster.width, raster.height);
    const hits = [
      { x: 0.2, y: 0.2 },
      { x: 0.5, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.2, y: 0.5 },
    ].filter((point) => norms.some((region) => pointInPolygon(point, region.polygon)));
    assert.ok(hits.length >= 3);
  });

  it("does not invent rooms on a blank sheet", () => {
    const result = segmentBlueprint(blank(200, 160));
    assert.equal(result.regions.length, 0);
  });

  it("associates a label with the region that contains it and keeps two bedrooms", () => {
    const raster = nineRoomPlan();
    const regions = normalizeRegions(segmentBlueprint(raster).regions, raster.width, raster.height);
    resetRoomIds();
    const assembled = assembleRooms(
      [
        { text: "LIVING ROOM", x0: 0.12, y0: 0.16, x1: 0.28, y1: 0.22, confidence: 90, lineCount: 1 },
        { text: "BEDROOM 1", x0: 0.12, y0: 0.7, x1: 0.28, y1: 0.76, confidence: 88, lineCount: 1 },
        { text: "BEDROOM 2", x0: 0.42, y0: 0.7, x1: 0.58, y1: 0.76, confidence: 86, lineCount: 1 },
      ],
      regions,
    );
    const names = assembled.rooms.filter((room) => room.category === "Bedroom").map((room) => room.name);
    assert.equal(names.length, 2);
    assert.ok(assembled.labelsInsideRegions >= 1);
    const living = assembled.rooms.find((room) => room.category === "Living Room");
    assert.ok(living);
    assert.equal(living.verified, false);
  });
});
