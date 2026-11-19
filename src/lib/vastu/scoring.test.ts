import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rectPolygon } from "./geometry.ts";
import { analyzeLayout } from "./scoring.ts";
import type { Room } from "./types.ts";

function room(partial: Partial<Room> & Pick<Room, "id" | "name" | "category" | "polygon">): Room {
  return {
    shape: "rect",
    source: "user",
    boundaryStatus: "user",
    confidence: 1,
    verified: true,
    notes: [],
    ...partial,
  };
}

describe("analyzeLayout", () => {
  const kitchenNE = room({
    id: "k",
    name: "Kitchen",
    category: "Kitchen",
    polygon: rectPolygon(0.68, 0.06, 0.26, 0.26),
  });
  const kitchenSE = room({
    id: "k2",
    name: "Kitchen",
    category: "Kitchen",
    polygon: rectPolygon(0.68, 0.68, 0.26, 0.26),
  });
  const bed1 = room({
    id: "b1",
    name: "Bedroom 1",
    category: "Bedroom",
    polygon: rectPolygon(0.05, 0.68, 0.26, 0.26),
  });
  const bed2 = room({
    id: "b2",
    name: "Bedroom 2",
    category: "Bedroom",
    polygon: rectPolygon(0.36, 0.68, 0.26, 0.26),
  });

  it("scores a northeast kitchen as a mismatch and explains the southeast preference", () => {
    const analysis = analyzeLayout([kitchenNE, bed1], "N", "sheet");
    const kitchen = analysis.rooms.find((item) => item.roomId === "k");
    assert.ok(kitchen);
    assert.equal(kitchen.zone, "NE");
    assert.equal(kitchen.score, 32);
    assert.equal(kitchen.band, "differs");
    assert.match(kitchen.explanation, /Southeast/i);
    assert.match(kitchen.remedy, /architect/i);
    assert.doesNotMatch(kitchen.remedy, /prosper|guarantee|miracle/i);
    assert.equal(analysis.blockedReason, null);
    assert.ok(analysis.overall !== null && analysis.overall < 80);
  });

  it("gives a southeast kitchen a full traditional score", () => {
    const analysis = analyzeLayout([kitchenSE, bed1], "N", "sheet");
    const kitchen = analysis.rooms.find((item) => item.roomId === "k2");
    assert.equal(kitchen?.zone, "SE");
    assert.equal(kitchen?.score, 100);
  });

  it("does not merge two bedrooms into one score row", () => {
    const analysis = analyzeLayout([bed1, bed2, kitchenSE], "N", "sheet");
    const bedrooms = analysis.rooms.filter((item) => item.category === "Bedroom");
    assert.equal(bedrooms.length, 2);
    assert.notEqual(bedrooms[0]?.zone, bedrooms[1]?.zone);
  });

  it("withholds the overall score until north is known", () => {
    const analysis = analyzeLayout([kitchenSE], "unknown", "sheet");
    assert.equal(analysis.overall, null);
    assert.match(analysis.blockedReason ?? "", /North/i);
  });

  it("does not treat an unconfirmed room as a perfect score", () => {
    const hidden = room({
      id: "u",
      name: "Kitchen",
      category: "Kitchen",
      polygon: rectPolygon(0.68, 0.68, 0.26, 0.26),
      verified: false,
    });
    const analysis = analyzeLayout([hidden], "N", "sheet");
    assert.equal(analysis.overall, null);
    assert.equal(analysis.rooms[0]?.score, null);
  });

  it("changes zone when north rotates", () => {
    const top = analyzeLayout([kitchenNE], "N", "sheet");
    const right = analyzeLayout([kitchenNE], "E", "sheet");
    assert.equal(top.rooms[0]?.zone, "NE");
    assert.notEqual(right.rooms[0]?.zone, "NE");
  });
});
