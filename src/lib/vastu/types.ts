export type Compass = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "C";

export type NorthHeading = "N" | "E" | "S" | "W" | "unknown";

export type Facing = "N" | "E" | "S" | "W";

export type Point = { x: number; y: number };

export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

export const CATEGORIES = [
  "Living Room",
  "Master Bedroom",
  "Bedroom",
  "Kitchen",
  "Pooja Room",
  "Bathroom",
  "Toilet",
  "Staircase",
  "Parking",
  "Dining Room",
  "Storage",
  "Study",
  "Lobby",
  "Studio",
  "Garden",
  "Balcony",
  "Entrance",
  "Utility",
] as const;

export type RoomCategory = (typeof CATEGORIES)[number];

export type RoomCategoryOrUnlabeled = RoomCategory | "Unlabeled";

export type BoundaryStatus = "segment" | "label" | "user";

export type Room = {
  id: string;
  name: string;
  category: RoomCategoryOrUnlabeled;
  polygon: Point[];
  shape: "rect" | "poly";
  source: "ocr" | "segment" | "user";
  boundaryStatus: BoundaryStatus;
  confidence: number;
  verified: boolean;
  notes: string[];
  ocrText?: string;
};

export type FrameMode = "rooms" | "sheet";

export type ZoneShare = { zone: Compass; share: number };

export type ScoreBand = "aligned" | "acceptable" | "mixed" | "differs" | "unverified";

export type Severity = "none" | "low" | "medium" | "high" | "info";

export type Priority = "none" | "low" | "medium" | "high";

export type RoomAssessment = {
  roomId: string;
  name: string;
  category: RoomCategoryOrUnlabeled;
  zone: Compass | "unknown";
  shares: ZoneShare[];
  score: number | null;
  band: ScoreBand;
  severity: Severity;
  priority: Priority;
  preferred: string;
  ruleNote: string;
  fit: string;
  explanation: string;
  remedy: string;
  confidence: number;
  verified: boolean;
  boundaryStatus: BoundaryStatus;
  boundaryNote: string;
};

export type Analysis = {
  overall: number | null;
  interpretation: string;
  disclaimer: string;
  rooms: RoomAssessment[];
  aligned: number;
  acceptable: number;
  differs: number;
  unverified: number;
  frameNote: string;
  confidenceNote: string;
  north: NorthHeading;
  blockedReason: string | null;
};

export type OcrWord = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
};

export type TextBlock = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
  lineCount: number;
};

export type MatchedLabel = {
  name: string;
  category: RoomCategory;
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  confidence: number;
  notes: string[];
};

export type Diagnostics = {
  ms: number;
  page: number;
  pageCount: number;
  ocrCharacters: number;
  passes: { psm: string; words: number; ms: number; error?: string }[];
  rawSnippets: string[];
  matchedLabels: string[];
  regionCount: number;
  labelsInsideRegions: number;
  segmentNote: string;
  warnings: string[];
};

export const DISCLAIMER =
  "Traditional Vastu guidance is a belief system, not a scientific, structural, medical, or legal assessment. A score is not a measure of safety, health, prosperity, or building quality.";

export const ZONE_LABEL: Record<Compass, string> = {
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
