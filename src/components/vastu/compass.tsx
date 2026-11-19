import type { NorthHeading } from "@/lib/vastu/types";

const HEADS: { id: Exclude<NorthHeading, "unknown">; label: string; className: string }[] = [
  { id: "N", label: "Top", className: "left-1/2 top-0 -translate-x-1/2" },
  { id: "E", label: "Right", className: "right-0 top-1/2 -translate-y-1/2" },
  { id: "S", label: "Bottom", className: "bottom-0 left-1/2 -translate-x-1/2" },
  { id: "W", label: "Left", className: "left-0 top-1/2 -translate-y-1/2" },
];

const ROTATION: Record<NorthHeading, number> = { N: 0, E: 90, S: 180, W: 270, unknown: 0 };

export function CompassControl({
  value,
  onChange,
}: {
  value: NorthHeading;
  onChange: (value: NorthHeading) => void;
}) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-3 text-sm font-medium text-ink">Where is North on this sheet?</legend>
      <div className="relative mx-auto size-44">
        <svg viewBox="0 0 100 100" className="size-full" aria-hidden="true">
          <circle cx="50" cy="50" r="30" className="fill-card stroke-line" strokeWidth="1" />
          <g className={value === "unknown" ? "needle opacity-25" : "needle"} style={{ transform: `rotate(${ROTATION[value]}deg)` }}>
            <polygon points="50,24 55,50 50,46 45,50" className="fill-teal" />
            <polygon points="50,76 55,50 50,54 45,50" className="fill-gold" />
          </g>
        </svg>
        {HEADS.map((head) => (
          <button
            key={head.id}
            type="button"
            aria-pressed={value === head.id}
            onClick={() => onChange(head.id)}
            className={`absolute flex h-11 min-w-11 items-center justify-center rounded-full border px-2 text-xs font-medium ${head.className} ${
              value === head.id ? "border-teal bg-teal text-card" : "border-line bg-card text-ink"
            }`}
          >
            <span className="font-serif text-base leading-none">{head.id}</span>
            <span className="sr-only">{head.label} edge is North</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={value === "unknown"}
        onClick={() => onChange("unknown")}
        className={`mt-3 w-full rounded-md border px-3 py-2 text-sm ${
          value === "unknown" ? "border-gold bg-gold-soft text-ink" : "border-line bg-card text-ink-soft"
        }`}
      >
        North is not marked
      </button>
      <p className="mt-2 text-sm text-muted">
        The top of a drawing is not assumed to be North. Zones are withheld until you choose an edge.
      </p>
    </fieldset>
  );
}
