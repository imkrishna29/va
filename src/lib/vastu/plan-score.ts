import type { Compass, RoomCategory } from "./types.ts";
import { RULES, SCORE_VALUES, listZones, zoneName } from "./rules.ts";

export function assessGenerated(category: RoomCategory, zone: Compass): {
  score: number;
  fit: string;
  explanation: string;
} {
  const rule = RULES[category];
  let score: number = SCORE_VALUES.neutral;
  let fit = "Not a listed preference";
  if (rule.ideal.includes(zone)) {
    score = SCORE_VALUES.ideal;
    fit = "Preferred zone";
  } else if (rule.acceptable.includes(zone)) {
    score = SCORE_VALUES.acceptable;
    fit = "Accepted alternative";
  } else if (rule.avoid.includes(zone)) {
    score = SCORE_VALUES.avoid;
    fit = "Avoided zone";
  }
  const explanation = `${category} is in the ${zoneName(zone)}. This tradition prefers ${listZones(rule.ideal)}.`;
  return { score, fit, explanation };
}
