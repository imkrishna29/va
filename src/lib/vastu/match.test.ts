import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupWords, matchBlocks, matchRoomText } from "./match.ts";
import type { OcrWord } from "./types.ts";

function word(text: string, x0: number, y0: number, x1: number, y1: number, confidence = 90): OcrWord {
  return { text, x0, y0, x1, y1, confidence };
}

describe("matchRoomText", () => {
  it("reads the sample plan vocabulary without collapsing distinct rooms", () => {
    for (const label of ["living room", "kitchen", "storage", "bedroom 1", "bedroom 2", "garage", "lobby", "studio", "garden"]) {
      assert.ok(matchRoomText(label), label);
    }
    assert.equal(matchRoomText("bedroom 1")?.name, "Bedroom 1");
    assert.equal(matchRoomText("bedroom 2")?.name, "Bedroom 2");
    assert.equal(matchRoomText("bedroom 1")?.category, "Bedroom");
    assert.equal(matchRoomText("bedroom 2")?.category, "Bedroom");
    assert.notEqual(matchRoomText("bedroom 1")?.name, matchRoomText("bedroom 2")?.name);
  });

  it("does not turn a garden into a living room or a studio into a study", () => {
    assert.equal(matchRoomText("garden")?.category, "Garden");
    assert.equal(matchRoomText("open space")?.category, "Garden");
    assert.equal(matchRoomText("studio")?.category, "Studio");
    assert.equal(matchRoomText("study")?.category, "Study");
    assert.match(matchRoomText("studio")?.notes.join(" ") ?? "", /not reclassified/i);
  });

  it("maps garage and storage with an explicit note", () => {
    assert.equal(matchRoomText("garage")?.category, "Parking");
    assert.equal(matchRoomText("garage")?.name, "Garage");
    assert.equal(matchRoomText("storage")?.category, "Storage");
    assert.equal(matchRoomText("store")?.category, "Storage");
  });

  it("rejects the garbage strings from a weak OCR pass", () => {
    for (const junk of ["roy", "oll cn boot sooo a", "sa es a ff", "os ps", "cg", "i", "|"]) {
      assert.equal(matchRoomText(junk), null, junk);
    }
  });
});

describe("groupWords", () => {
  it("joins LIVING and ROOM stacked on two lines", () => {
    const blocks = groupWords([
      word("LIVING", 0.1, 0.2, 0.24, 0.24),
      word("ROOM", 0.11, 0.25, 0.22, 0.29),
      word("KITCHEN", 0.7, 0.2, 0.86, 0.24),
    ]);
    const texts = blocks.map((block) => block.text);
    assert.ok(texts.some((text) => text.toLowerCase().includes("living") && text.toLowerCase().includes("room")));
    assert.ok(texts.some((text) => text.toLowerCase().includes("kitchen")));
  });

  it("keeps two bedrooms that the recognizer split into words", () => {
    const blocks = groupWords([
      word("BEDROOM", 0.08, 0.62, 0.22, 0.66),
      word("1", 0.23, 0.62, 0.26, 0.66),
      word("BEDROOM", 0.48, 0.62, 0.62, 0.66),
      word("2", 0.63, 0.62, 0.66, 0.66),
    ]);
    const matched = matchBlocks(blocks);
    const names = matched.map((item) => item.name).sort();
    assert.deepEqual(names, ["Bedroom 1", "Bedroom 2"]);
  });

  it("drops a second pass that repeats the same label in the same place", () => {
    const matched = matchBlocks([
      { text: "KITCHEN", x0: 0.7, y0: 0.1, x1: 0.86, y1: 0.16, confidence: 80, lineCount: 1 },
      { text: "KITCHEN", x0: 0.71, y0: 0.11, x1: 0.85, y1: 0.15, confidence: 92, lineCount: 1 },
      { text: "LOBBY", x0: 0.4, y0: 0.1, x1: 0.52, y1: 0.15, confidence: 88, lineCount: 1 },
    ]);
    assert.equal(matched.filter((item) => item.category === "Kitchen").length, 1);
    assert.equal(matched.length, 2);
  });
});
