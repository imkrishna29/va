import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cellZone, dominantZone, rectPolygon, rotateToNorthUp, zoneShares } from "./geometry.ts";

describe("rotateToNorthUp", () => {
  it("keeps a top-edge point north when the sheet's top is north", () => {
    const point = rotateToNorthUp({ x: 0.5, y: 0.1 }, "N");
    assert.ok(point.y < 0.2);
    assert.ok(Math.abs(point.x - 0.5) < 1e-9);
  });

  it("maps the right edge to north when north points right", () => {
    const point = rotateToNorthUp({ x: 0.9, y: 0.5 }, "E");
    assert.ok(point.y < 0.2);
    assert.ok(Math.abs(point.x - 0.5) < 1e-9);
  });

  it("maps the bottom edge to north when north points down", () => {
    const point = rotateToNorthUp({ x: 0.5, y: 0.85 }, "S");
    assert.ok(point.y < 0.2);
  });

  it("maps the left edge to north when north points left", () => {
    const point = rotateToNorthUp({ x: 0.12, y: 0.5 }, "W");
    assert.ok(point.y < 0.2);
    assert.ok(Math.abs(point.x - 0.5) < 1e-9);
  });

  it("reads the image's top-right as northwest when north points right", () => {
    const point = rotateToNorthUp({ x: 0.9, y: 0.1 }, "E");
    assert.equal(cellZone(point.x, point.y), "NW");
  });
});

describe("zoneShares", () => {
  const sheet = { minX: 0, minY: 0, maxX: 1, maxY: 1 };

  it("places a top-right room in the northeast when north is up", () => {
    const shares = zoneShares(rectPolygon(0.7, 0.05, 0.25, 0.25), sheet, "N");
    assert.equal(dominantZone(shares), "NE");
  });

  it("places a bottom-left room in the southwest when north is up", () => {
    const shares = zoneShares(rectPolygon(0.05, 0.7, 0.22, 0.22), sheet, "N");
    assert.equal(dominantZone(shares), "SW");
  });

  it("reads the image's bottom-left as northwest when north points left", () => {
    const shares = zoneShares(rectPolygon(0.05, 0.7, 0.22, 0.22), sheet, "W");
    assert.equal(dominantZone(shares), "NW");
  });

  it("uses the plan extent, so a room in the corner of two marks is not the center", () => {
    const building = { minX: 0.1, minY: 0.1, maxX: 0.9, maxY: 0.9 };
    const shares = zoneShares(rectPolygon(0.62, 0.12, 0.24, 0.22), building, "N");
    assert.equal(dominantZone(shares), "NE");
  });
});
