import type { Compass, RoomCategory } from "./types.ts";

/**
 * One documented traditional school, not every Vastu lineage.
 * Ideal zones score 100, accepted alternatives 74, unlisted zones 58,
 * and avoided zones 32. See scoring.ts for the overall weighted mean.
 */
export type VastuRule = {
  ideal: Compass[];
  acceptable: Compass[];
  avoid: Compass[];
  weight: number;
  note: string;
};

export const RULES: Record<RoomCategory, VastuRule> = {
  Entrance: {
    ideal: ["N", "E", "NE"],
    acceptable: ["NW"],
    avoid: ["S", "SW"],
    weight: 1.5,
    note: "Many texts prefer a north or east entry. A south entry is treated as a mismatch in this school, not as a structural fault.",
  },
  "Living Room": {
    ideal: ["N", "E", "NE"],
    acceptable: ["NW", "C"],
    avoid: ["SW"],
    weight: 1.15,
    note: "North, east, and northeast are the usual social zones. A living room that reaches the center is accepted here.",
  },
  "Master Bedroom": {
    ideal: ["SW"],
    acceptable: ["S", "W"],
    avoid: ["NE", "C"],
    weight: 1.35,
    note: "Southwest is the common preference for the principal bedroom. Northeast is traditionally avoided.",
  },
  Bedroom: {
    ideal: ["S", "W"],
    acceptable: ["SW", "NW"],
    avoid: ["NE", "C"],
    weight: 1.1,
    note: "Secondary bedrooms are often placed south or west. Each bedroom is scored on its own.",
  },
  Kitchen: {
    ideal: ["SE"],
    acceptable: ["NW"],
    avoid: ["NE", "C", "SW"],
    weight: 1.4,
    note: "Southeast is the usual fire corner. Some interpretations also accept northwest. Northeast is avoided in this school.",
  },
  "Pooja Room": {
    ideal: ["NE"],
    acceptable: ["E", "N"],
    avoid: ["S", "SW", "C"],
    weight: 1.3,
    note: "Northeast is the common prayer zone. A clean corner can stand in when the plan cannot move.",
  },
  Bathroom: {
    ideal: ["NW", "W"],
    acceptable: ["SE", "S"],
    avoid: ["NE", "C"],
    weight: 1.25,
    note: "Northwest or west is the usual preference. Northeast and the center are avoided.",
  },
  Toilet: {
    ideal: ["NW", "W"],
    acceptable: ["S", "SE"],
    avoid: ["NE", "E", "C"],
    weight: 1.25,
    note: "Kept separate from bathrooms so a combined label can be corrected. Northeast is avoided.",
  },
  Staircase: {
    ideal: ["S", "SW", "W"],
    acceptable: ["NW"],
    avoid: ["NE", "C"],
    weight: 1.15,
    note: "South, southwest, or west is the usual stair zone. Turning a stair is a structural change and is not advised here.",
  },
  Parking: {
    ideal: ["NW", "N"],
    acceptable: ["SE", "E"],
    avoid: ["C", "SW"],
    weight: 1.05,
    note: "A garage label is scored as parking. Northwest is the common preference.",
  },
  "Dining Room": {
    ideal: ["W", "E"],
    acceptable: ["N", "S"],
    avoid: ["C"],
    weight: 1.05,
    note: "West or east dining is the preference used here. The center is left clearer when the plan allows.",
  },
  Storage: {
    ideal: ["SW", "NW", "W"],
    acceptable: ["S"],
    avoid: ["NE"],
    weight: 0.9,
    note: "Storage and store are the same category. Northeast storage is the mismatch this school flags.",
  },
  Study: {
    ideal: ["W", "E", "NE"],
    acceptable: ["N"],
    avoid: ["SW"],
    weight: 1,
    note: "West, east, or northeast. A studio label is never rewritten into a study automatically.",
  },
  Studio: {
    ideal: ["W", "NW", "N"],
    acceptable: ["E"],
    avoid: ["SW"],
    weight: 1,
    note: "Studio stays a studio. Rename it to Study only if that is what the room actually is.",
  },
  Lobby: {
    ideal: ["N", "E", "NE"],
    acceptable: ["W"],
    avoid: ["SW"],
    weight: 1,
    note: "A lobby is scored as arrival space, close to the entrance preferences.",
  },
  Garden: {
    ideal: ["N", "E", "NE"],
    acceptable: ["W", "NW"],
    avoid: [],
    weight: 0.85,
    note: "Open space is not converted into a living room. Other quadrants are noted, not treated as a severe mismatch.",
  },
  Balcony: {
    ideal: ["N", "E"],
    acceptable: ["NE", "NW"],
    avoid: [],
    weight: 0.8,
    note: "North or east open edges are preferred. No severe penalty is applied to other edges.",
  },
  Utility: {
    ideal: ["NW", "SE"],
    acceptable: ["W"],
    avoid: ["NE", "C"],
    weight: 0.9,
    note: "Utility is grouped with service spaces: northwest or southeast.",
  },
};

export const SCORE_VALUES = {
  ideal: 100,
  acceptable: 74,
  neutral: 58,
  avoid: 32,
} as const;

export function listZones(zones: Compass[]): string {
  return zones.map((z) => zoneName(z)).join(", ");
}

export function zoneName(zone: Compass): string {
  const names: Record<Compass, string> = {
    N: "North",
    NE: "Northeast",
    E: "East",
    SE: "Southeast",
    S: "South",
    SW: "Southwest",
    W: "West",
    NW: "Northwest",
    C: "Center",
  };
  return names[zone];
}
