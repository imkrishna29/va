import { dominantZone, unionBBox, zoneShares } from "./geometry.ts";
import { RULES, SCORE_VALUES, listZones, zoneName } from "./rules.ts";
import type {
  Analysis,
  BBox,
  FrameMode,
  NorthHeading,
  Priority,
  Room,
  RoomAssessment,
  RoomCategory,
  ScoreBand,
  Severity,
} from "./types.ts";
import { DISCLAIMER } from "./types.ts";

export function directionFrame(
  rooms: Room[],
  mode: FrameMode,
): { bbox: BBox; note: string } {
  if (mode === "sheet" || rooms.length < 2) {
    return {
      bbox: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      note:
        rooms.length < 2
          ? "Only one marked region is on the sheet, so zones use the full image until more of the plan is marked."
          : "Zones are measured against the full sheet, not only the marked rooms.",
    };
  }
  const box = unionBBox(rooms.map((room) => room.polygon));
  const padX = (box.maxX - box.minX) * 0.02;
  const padY = (box.maxY - box.minY) * 0.02;
  return {
    bbox: {
      minX: Math.max(0, box.minX - padX),
      minY: Math.max(0, box.minY - padY),
      maxX: Math.min(1, box.maxX + padX),
      maxY: Math.min(1, box.maxY + padY),
    },
    note: "Zones use the combined extent of the marked rooms as the plan outline.",
  };
}

export function suggestFrameMode(rooms: Room[]): FrameMode {
  if (rooms.length < 2) return "sheet";
  const box = unionBBox(rooms.map((room) => room.polygon));
  const wide = box.maxX - box.minX > 0.45 && box.maxY - box.minY > 0.45;
  return wide ? "rooms" : "sheet";
}

function boundaryNote(room: Room): string {
  if (room.boundaryStatus === "user") return "Boundary edited by you.";
  if (room.boundaryStatus === "segment")
    return "Boundary is an approximate open region inside the wall tracing, not a survey.";
  return "Boundary is only an editable box on the text label. Direction follows that box until you resize it to the room.";
}

function fitLabel(band: ScoreBand): string {
  if (band === "aligned") return "Preferred zone";
  if (band === "acceptable") return "Accepted alternative";
  if (band === "differs") return "Avoided zone";
  if (band === "mixed") return "Not a listed preference";
  return "Not scored";
}

export function assessRoom(
  room: Room,
  north: NorthHeading,
  building: BBox,
): RoomAssessment {
  const base = {
    roomId: room.id,
    name: room.name,
    category: room.category,
    shares: [] as RoomAssessment["shares"],
    confidence: room.confidence,
    verified: room.verified,
    boundaryStatus: room.boundaryStatus,
    boundaryNote: boundaryNote(room),
    ruleNote: "",
    preferred: "",
    fit: "Not scored",
    explanation: "",
    remedy: "",
    priority: "none" as Priority,
    severity: "info" as Severity,
    score: null as number | null,
    band: "unverified" as ScoreBand,
    zone: "unknown" as RoomAssessment["zone"],
  };

  if (room.category === "Unlabeled") {
    return {
      ...base,
      explanation: "This region has no room use yet, so it is not scored.",
      remedy: "Name it, or delete it if the tracing picked up a courtyard, title, or margin.",
    };
  }

  const rule = RULES[room.category as RoomCategory];
  base.ruleNote = rule.note;
  base.preferred = `Prefers ${listZones(rule.ideal)}${
    rule.acceptable.length ? `. Also accepts ${listZones(rule.acceptable)}` : ""
  }.${rule.avoid.length ? ` Avoids ${listZones(rule.avoid)}.` : ""}`;

  if (!room.verified) {
    return {
      ...base,
      explanation: "Not confirmed, so it is left out of the score.",
      remedy: "Confirm the name and boundary if this room should count.",
    };
  }

  if (north === "unknown") {
    return {
      ...base,
      explanation: "North is not set, so a direction cannot be chosen.",
      remedy: "Set which edge of the drawing is North, then score again.",
    };
  }

  const shares = zoneShares(room.polygon, building, north);
  const zone = dominantZone(shares);
  if (zone === "unknown") {
    return {
      ...base,
      explanation: "The marked shape is too small to place in a zone.",
      remedy: "Redraw the room boundary, then confirm it.",
    };
  }

  let score: number = SCORE_VALUES.neutral;
  let band: ScoreBand = "mixed";
  if (rule.ideal.includes(zone)) {
    score = SCORE_VALUES.ideal;
    band = "aligned";
  } else if (rule.acceptable.includes(zone)) {
    score = SCORE_VALUES.acceptable;
    band = "acceptable";
  } else if (rule.avoid.includes(zone)) {
    score = SCORE_VALUES.avoid;
    band = "differs";
  }

  const where = zoneName(zone);
  const second = shares[1];
  const span =
    second && second.share >= 0.18
      ? ` It also covers ${zoneName(second.zone)} (${Math.round(second.share * 100)}%).`
      : "";
  const lead = `The selected tradition prefers ${listZones(rule.ideal)} for a ${room.category.toLowerCase()}${
    rule.acceptable.length ? `, and also accepts ${listZones(rule.acceptable)}` : ""
  }.`;

  let explanation = "";
  if (band === "aligned") {
    explanation = `${lead} The marked region falls mainly in the ${where}, a preferred zone.${span}`;
  } else if (band === "acceptable") {
    explanation = `${lead} The marked region falls mainly in the ${where}. That is an accepted alternative, not the first preference.${span}`;
  } else if (band === "differs") {
    explanation = `${lead} The marked region falls mainly in the ${where}, which this tradition treats as a poor fit.${span}`;
  } else {
    explanation = `${lead} The marked region falls mainly in the ${where}, which is not listed as preferred or avoided.${span}`;
  }
  if (room.boundaryStatus === "label") {
    explanation += " The zone uses the label box you confirmed, not a traced wall boundary.";
  }

  const ideal = listZones(rule.ideal);
  const remedy =
    band === "aligned"
      ? "No placement change is suggested under these traditional rules."
      : `If the layout is still open, consider placing the ${room.category.toLowerCase()} in the ${ideal} part of the plot, after an architect checks plumbing, ventilation, structure, and how people move through the house. If the building already stands, moving the room may be impractical, and keeping it is reasonable. This is not a defect notice, and it does not claim that colors, objects, or rituals produce measurable results.`;

  let priority: Priority = "none";
  let severity: Severity = "none";
  if (band === "differs" && rule.weight >= 1.2) {
    priority = "high";
    severity = "high";
  } else if (score < 60) {
    priority = "medium";
    severity = "medium";
  } else if (score < 100) {
    priority = "low";
    severity = "low";
  }

  return {
    ...base,
    zone,
    shares,
    score,
    band,
    severity,
    priority,
    fit: fitLabel(band),
    explanation,
    remedy,
  };
}

export function interpretScore(score: number): string {
  if (score >= 85) return "Most confirmed rooms sit in a preferred or accepted zone for this tradition.";
  if (score >= 70) return "The confirmed rooms largely follow this tradition, with a few differences.";
  if (score >= 50) return "Mixed alignment. Several confirmed rooms sit outside the preferred zones.";
  return "Many confirmed rooms differ from the preferred zones in this tradition.";
}

export function analyzeLayout(rooms: Room[], north: NorthHeading, mode: FrameMode): Analysis {
  const frame = directionFrame(rooms, mode);
  const assessments = rooms.map((room) => assessRoom(room, north, frame.bbox));
  const scored = assessments.filter(
    (item): item is RoomAssessment & { score: number } => item.score !== null && item.category !== "Unlabeled",
  );
  const weights = scored.map((item) => ({
    score: item.score,
    weight: RULES[item.category as RoomCategory].weight,
  }));
  const weightSum = weights.reduce((sum, item) => sum + item.weight, 0);
  const overall = weightSum
    ? Math.round(weights.reduce((sum, item) => sum + item.score * item.weight, 0) / weightSum)
    : null;

  const aligned = assessments.filter((item) => item.band === "aligned").length;
  const acceptable = assessments.filter((item) => item.band === "acceptable").length;
  const differs = assessments.filter((item) => item.band === "differs" || item.band === "mixed").length;
  const unverified = assessments.filter((item) => !item.verified || item.score === null).length;
  const labelConfirmed = assessments.filter(
    (item) => item.verified && item.boundaryStatus === "label" && item.score !== null,
  ).length;

  let blockedReason: string | null = null;
  if (north === "unknown") blockedReason = "Set where North is before a direction score can be calculated.";
  else if (!scored.length)
    blockedReason = "Confirm at least one named room. Unconfirmed detections are not scored.";

  const confidenceNote = [
    overall === null
      ? "No overall score yet."
      : `Overall score is the weighted mean of ${scored.length} confirmed room${scored.length === 1 ? "" : "s"}.`,
    "Entrance, kitchen, principal bedroom, pooja, and bathrooms carry more weight.",
    unverified ? `${unverified} room${unverified === 1 ? " is" : "s are"} not in the score.` : "",
    labelConfirmed
      ? `${labelConfirmed} confirmed room${labelConfirmed === 1 ? "" : "s"} still use a text-label box rather than a wall boundary.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    overall: blockedReason ? null : overall,
    interpretation: overall === null || blockedReason ? "A final score is withheld until North and the rooms are confirmed." : interpretScore(overall),
    disclaimer: DISCLAIMER,
    rooms: assessments,
    aligned,
    acceptable,
    differs,
    unverified,
    frameNote: frame.note,
    confidenceNote,
    north,
    blockedReason,
  };
}
