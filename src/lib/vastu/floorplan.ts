import type { Compass, Facing, RoomCategory } from "./types.ts";
import { RULES, listZones } from "./rules.ts";
import { CATEGORIES } from "./types.ts";
import { assessGenerated } from "./plan-score.ts";

export type PlanRoom = {
  name: string;
  category: RoomCategory;
  x: number;
  y: number;
  w: number;
  h: number;
  zone: Compass;
  score: number;
  fit: string;
  explanation: string;
};

export type ConceptFloor = {
  index: number;
  title: string;
  width: number;
  length: number;
  facing: Facing;
  rooms: PlanRoom[];
  score: number | null;
  notes: string[];
};

export type PlanInput = {
  width: number;
  length: number;
  floorsAbove: number;
  facing: Facing;
  counts: Partial<Record<RoomCategory, number>>;
};

const CELL: Record<Compass, { col: number; row: number }> = {
  NW: { col: 0, row: 0 },
  N: { col: 1, row: 0 },
  NE: { col: 2, row: 0 },
  W: { col: 0, row: 1 },
  C: { col: 1, row: 1 },
  E: { col: 2, row: 1 },
  SW: { col: 0, row: 2 },
  S: { col: 1, row: 2 },
  SE: { col: 2, row: 2 },
};

const ZONES: Compass[] = ["NE", "NW", "SE", "SW", "N", "E", "W", "S", "C"];

const UPPER = new Set<RoomCategory>(["Master Bedroom", "Bedroom", "Study", "Studio", "Balcony"]);

export function validatePlan(input: PlanInput): string | null {
  if (!Number.isFinite(input.width) || !Number.isFinite(input.length)) return "Enter a width and length in feet.";
  if (input.width < 18 || input.width > 150) return "Width must be between 18 and 150 ft.";
  if (input.length < 18 || input.length > 250) return "Length must be between 18 and 250 ft.";
  if (!Number.isInteger(input.floorsAbove) || input.floorsAbove < 0 || input.floorsAbove > 8) {
    return "Floors above ground must be a whole number from 0 to 8.";
  }
  if (!["N", "E", "S", "W"].includes(input.facing)) return "Choose a facing direction.";
  const instances = expandCounts(input.counts);
  if (!instances.length) return "Choose at least one room.";
  if (instances.length > 24) return "Use 24 rooms or fewer for a conceptual plan.";
  const area = input.width * input.length;
  if (area / instances.length < 35) return "Too many rooms for this plot. Reduce the list or enlarge the plot.";
  return null;
}

export function expandCounts(counts: Partial<Record<RoomCategory, number>>): { name: string; category: RoomCategory }[] {
  const rooms: { name: string; category: RoomCategory }[] = [];
  for (const category of CATEGORIES) {
    const count = counts[category] ?? 0;
    if (!Number.isFinite(count) || count <= 0) continue;
    const n = Math.min(12, Math.floor(count));
    for (let i = 0; i < n; i++) {
      const name = n > 1 && (category === "Bedroom" || category === "Bathroom" || category === "Toilet" || category === "Balcony")
        ? `${category} ${i + 1}`
        : n > 1
          ? `${category} ${i + 1}`
          : category;
      rooms.push({ name, category });
    }
  }
  return rooms;
}

function preference(category: RoomCategory, zone: Compass): number {
  const rule = RULES[category];
  if (rule.ideal.includes(zone)) return 5;
  if (rule.acceptable.includes(zone)) return 3;
  if (rule.avoid.includes(zone)) return -4;
  return 0;
}

export function placeOnPlot(
  rooms: { name: string; category: RoomCategory }[],
  width: number,
  length: number,
): PlanRoom[] {
  const load = new Map<Compass, number>();
  const assigned: { name: string; category: RoomCategory; zone: Compass }[] = [];
  const sorted = [...rooms].sort((a, b) => RULES[b.category].weight - RULES[a.category].weight);
  for (const room of sorted) {
    let best: Compass = "N";
    let bestScore = -Infinity;
    for (const zone of ZONES) {
      const count = load.get(zone) ?? 0;
      if (count >= 3) continue;
      const score = preference(room.category, zone) - count * 2.2;
      if (score > bestScore) {
        bestScore = score;
        best = zone;
      }
    }
    load.set(best, (load.get(best) ?? 0) + 1);
    assigned.push({ ...room, zone: best });
  }

  const groups = new Map<Compass, typeof assigned>();
  for (const room of assigned) {
    const list = groups.get(room.zone) ?? [];
    list.push(room);
    groups.set(room.zone, list);
  }

  const placed: PlanRoom[] = [];
  for (const [zone, group] of groups) {
    const cell = CELL[zone];
    const cw = width / 3;
    const ch = length / 3;
    const x0 = cell.col * cw;
    const y0 = cell.row * ch;
    const vertical = ch >= cw;
    group.forEach((room, index) => {
      const sliceW = vertical ? cw : cw / group.length;
      const sliceH = vertical ? ch / group.length : ch;
      const x = vertical ? x0 : x0 + index * sliceW;
      const y = vertical ? y0 + index * sliceH : y0;
      const assessed = assessGenerated(room.category, zone);
      placed.push({
        name: room.name,
        category: room.category,
        x: round(x),
        y: round(y),
        w: round(sliceW),
        h: round(sliceH),
        zone,
        score: assessed.score,
        fit: assessed.fit,
        explanation: assessed.explanation,
      });
    });
  }
  return placed.sort((a, b) => a.y - b.y || a.x - b.x);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function floorScore(rooms: PlanRoom[]): number | null {
  if (!rooms.length) return null;
  const weighted = rooms.reduce(
    (sum, room) => {
      const weight = RULES[room.category].weight;
      return { value: sum.value + room.score * weight, weight: sum.weight + weight };
    },
    { value: 0, weight: 0 },
  );
  return Math.round(weighted.value / weighted.weight);
}

export function distributeFloors(
  rooms: { name: string; category: RoomCategory }[],
  floorsAbove: number,
): { title: string; rooms: { name: string; category: RoomCategory }[] }[] {
  const levels = floorsAbove + 1;
  const buckets = Array.from({ length: levels }, () => [] as { name: string; category: RoomCategory }[]);
  if (levels === 1) {
    buckets[0] = [...rooms];
    return [{ title: "Ground", rooms: buckets[0] }];
  }
  const ground = rooms.filter((room) => !UPPER.has(room.category));
  const upper = rooms.filter((room) => UPPER.has(room.category));
  buckets[0].push(...ground);
  if (!upper.length) {
    return rooms.length
      ? [{ title: "Ground", rooms }]
      : [];
  }
  upper.forEach((room, index) => {
    const floor = 1 + (index % (levels - 1));
    buckets[floor]?.push(room);
  });
  return buckets.map((list, index) => ({
    title: index === 0 ? "Ground" : `Floor ${index}`,
    rooms: list,
  }));
}

export function generateConcept(input: PlanInput): { plans: ConceptFloor[]; error: string | null } {
  const error = validatePlan(input);
  if (error) return { plans: [], error };
  const instances = expandCounts(input.counts);
  const floors = distributeFloors(instances, input.floorsAbove);
  const plans = floors.map((floor, index) => {
    const rooms = floor.rooms.length ? placeOnPlot(floor.rooms, input.width, input.length) : [];
    const notes = [
      "Conceptual zoning only. Not a construction drawing.",
      "Rooms are packed into the traditional 3×3 grid. Sizes are equal splits of a zone, not designed room modules.",
      `Plot faces ${facingName(input.facing)}. North is the top of the drawing.`,
      floor.rooms.length ? "" : "No rooms were assigned to this level. Add bedrooms or studies if upper floors should be occupied.",
    ].filter(Boolean);
    if (input.floorsAbove > 0 && index === 0 && !floor.rooms.some((room) => room.category === "Staircase") && instances.some((room) => room.category === "Staircase")) {
      notes.push("The stair is drawn on the level it was assigned. Check that each floor can actually reach it.");
    }
    return {
      index,
      title: floor.title,
      width: input.width,
      length: input.length,
      facing: input.facing,
      rooms,
      score: floorScore(rooms),
      notes,
    };
  });
  return { plans, error: null };
}

export function facingName(facing: Facing): string {
  return { N: "North", E: "East", S: "South", W: "West" }[facing];
}

export function preferenceSummary(category: RoomCategory): string {
  const rule = RULES[category];
  return `${listZones(rule.ideal)}${rule.acceptable.length ? ` (also ${listZones(rule.acceptable)})` : ""}`;
}
