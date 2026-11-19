import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateConcept } from "./floorplan.ts";

describe("generateConcept", () => {
  const preset = {
    width: 40,
    length: 50,
    floorsAbove: 1,
    facing: "N" as const,
    counts: {
      "Living Room": 1,
      Kitchen: 1,
      "Dining Room": 1,
      "Master Bedroom": 1,
      Bedroom: 1,
      Bathroom: 2,
      "Pooja Room": 1,
      Parking: 1,
      Lobby: 1,
      Staircase: 1,
    },
  };

  it("rejects a plot that is too small or empty", () => {
    assert.match(generateConcept({ ...preset, width: 8 }).error ?? "", /Width/i);
    assert.match(generateConcept({ ...preset, counts: {} }).error ?? "", /at least one/i);
  });

  it("puts the kitchen in the southeast or northwest and keeps bedrooms distinct", () => {
    const { plans, error } = generateConcept(preset);
    assert.equal(error, null);
    const all = plans.flatMap((plan) => plan.rooms);
    const kitchen = all.find((room) => room.category === "Kitchen");
    assert.ok(kitchen);
    assert.ok(kitchen.zone === "SE" || kitchen.zone === "NW");
    const beds = all.filter((room) => room.category === "Bedroom" || room.category === "Master Bedroom");
    assert.equal(beds.length, 2);
    assert.ok(plans.length === 2);
    assert.equal(plans[0]?.title, "Ground");
    assert.ok(plans.every((plan) => plan.notes.some((note) => /conceptual/i.test(note))));
    assert.ok(plans[0]?.score !== null);
  });

  it("moves bedrooms upstairs when there is a floor above ground", () => {
    const { plans } = generateConcept(preset);
    const ground = plans[0];
    const upper = plans[1];
    assert.ok(ground && upper);
    assert.equal(ground.rooms.some((room) => room.category === "Bedroom" || room.category === "Master Bedroom"), false);
    assert.equal(upper.rooms.some((room) => room.category === "Bedroom" || room.category === "Master Bedroom"), true);
    assert.equal(ground.rooms.some((room) => room.category === "Kitchen"), true);
  });
});
