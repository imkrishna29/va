import { useMemo, useState, type ReactNode } from "react";
import { FileDown, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, type Facing, type RoomCategory } from "@/lib/vastu/types";
import { generateConcept, type ConceptFloor, type PlanInput } from "@/lib/vastu/floorplan";
import { ZONE_LABEL } from "@/lib/vastu/types";
import { conceptPdf, downloadBlob } from "@/lib/report/pdf";

const PRIMARY: RoomCategory[] = [
  "Living Room",
  "Master Bedroom",
  "Bedroom",
  "Kitchen",
  "Dining Room",
  "Pooja Room",
  "Bathroom",
  "Toilet",
  "Parking",
  "Storage",
  "Study",
  "Lobby",
  "Garden",
  "Staircase",
];

const MORE = CATEGORIES.filter((category) => !PRIMARY.includes(category));

const PRESET: PlanInput = {
  width: 40,
  length: 50,
  floorsAbove: 1,
  facing: "N",
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
    Garden: 1,
  },
};

export function Planner() {
  const [input, setInput] = useState<PlanInput>({
    width: 36,
    length: 48,
    floorsAbove: 0,
    facing: "N",
    counts: { "Living Room": 1, Kitchen: 1, Bedroom: 2, Bathroom: 1 },
  });
  const [more, setMore] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<ConceptFloor[]>([]);

  const visible = more ? [...PRIMARY, ...MORE] : PRIMARY;

  function setCount(category: RoomCategory, count: number) {
    setInput((current) => ({
      ...current,
      counts: { ...current.counts, [category]: Math.max(0, Math.min(12, count)) },
    }));
  }

  function generate() {
    const result = generateConcept(input);
    setError(result.error);
    setPlans(result.plans);
    setActive(0);
    if (result.error) toast.error(result.error);
  }

  const plan = plans[active] ?? null;
  const facingEdge = useMemo(() => input.facing, [input.facing]);

  async function download() {
    if (!plans.length) return;
    try {
      const blob = await conceptPdf(plans);
      downloadBlob(blob, "VASTU-AI-concept-plan.pdf");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not export the concept plan.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <form
        className="grid gap-4 rounded-lg border border-line bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault();
          generate();
        }}
      >
        <div>
          <h2 className="font-serif text-3xl">Concept plan</h2>
          <p className="mt-2 text-sm text-muted">
            A zoning sketch from plot size, facing, and the rooms you need. It is not a construction drawing.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Width (ft)">
            <input
              className="field"
              inputMode="decimal"
              value={input.width}
              onChange={(event) => setInput({ ...input, width: Number(event.target.value) })}
            />
          </Field>
          <Field label="Length (ft)">
            <input
              className="field"
              inputMode="decimal"
              value={input.length}
              onChange={(event) => setInput({ ...input, length: Number(event.target.value) })}
            />
          </Field>
        </div>
        <Field label="Facing">
          <select
            className="field"
            value={input.facing}
            onChange={(event) => setInput({ ...input, facing: event.target.value as Facing })}
          >
            <option value="N">North</option>
            <option value="E">East</option>
            <option value="S">South</option>
            <option value="W">West</option>
          </select>
        </Field>
        <Field label="Floors above ground">
          <input
            className="field"
            inputMode="numeric"
            value={input.floorsAbove}
            onChange={(event) => setInput({ ...input, floorsAbove: Number(event.target.value) })}
          />
        </Field>
        <div className="grid gap-2">
          {visible.map((category) => (
            <div key={category} className="flex items-center justify-between gap-3">
              <span className="text-sm">{category}</span>
              <div className="flex items-center gap-2">
                <button type="button" className="step" onClick={() => setCount(category, (input.counts[category] ?? 0) - 1)} aria-label={`Fewer ${category}`}>
                  <Minus className="size-4" />
                </button>
                <span className="w-6 text-center text-sm tabular-nums">{input.counts[category] ?? 0}</span>
                <button type="button" className="step" onClick={() => setCount(category, (input.counts[category] ?? 0) + 1)} aria-label={`More ${category}`}>
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="text-left text-sm text-teal" onClick={() => setMore((value) => !value)}>
          {more ? "Hide extra rooms" : "Studio, balcony, entrance, utility"}
        </button>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="h-11 rounded-md bg-teal px-4 text-sm font-medium text-card">
            Generate concept
          </button>
          <button type="button" className="h-11 rounded-md border border-line px-4 text-sm" onClick={() => setInput(PRESET)}>
            Two-bedroom example
          </button>
        </div>
      </form>

      <section className="min-w-0 rounded-lg border border-line bg-card p-5">
        {!plan ? (
          <div className="grid min-h-80 content-center">
            <h3 className="font-serif text-3xl">Nothing drawn yet</h3>
            <p className="mt-2 max-w-md text-sm text-muted">
              North stays at the top. Rooms are placed into the nine traditional zones, then split if a zone is shared.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs tracking-[0.16em] text-gold uppercase">Conceptual</p>
                <h3 className="font-serif text-3xl">{plan.title}</h3>
                <p className="text-sm text-muted">
                  {plan.width} × {plan.length} ft · facing {facingEdge} · traditional fit {plan.score ?? "—"}/100
                </p>
              </div>
              <button type="button" onClick={() => void download()} className="inline-flex h-11 items-center gap-2 rounded-md border border-line px-3 text-sm">
                <FileDown className="size-4" />
                PDF
              </button>
            </div>
            {plans.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto">
                {plans.map((item, index) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => setActive(index)}
                    className={`h-11 shrink-0 rounded-md border px-3 text-sm ${index === active ? "border-teal bg-teal text-card" : "border-line"}`}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            ) : null}
            <PlanSvg plan={plan} />
            <ul className="grid gap-2">
              {plan.notes.map((note) => (
                <li key={note} className="text-sm text-muted">
                  {note}
                </li>
              ))}
            </ul>
            <ul className="grid gap-2 sm:grid-cols-2">
              {plan.rooms.map((room) => (
                <li key={`${room.name}-${room.zone}`} className="rounded-md border border-line px-3 py-2 text-sm">
                  <span className="font-medium">{room.name}</span>
                  <span className="text-muted"> · {ZONE_LABEL[room.zone]} · {room.score}/100 · {room.fit}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function PlanSvg({ plan }: { plan: ConceptFloor }) {
  const pad = 8;
  return (
    <svg viewBox={`${-pad} ${-pad} ${plan.width + pad * 2} ${plan.length + pad * 2}`} className="w-full rounded-md border border-line bg-paper">
      <rect x="0" y="0" width={plan.width} height={plan.length} fill="var(--color-card)" stroke="var(--color-teal)" strokeWidth="0.6" />
      {plan.rooms.map((room) => (
        <g key={`${room.name}-${room.x}-${room.y}`}>
          <rect x={room.x} y={room.y} width={room.w} height={room.h} fill="var(--color-teal-soft)" stroke="var(--color-ink-soft)" strokeWidth="0.25" />
          <text x={room.x + room.w / 2} y={room.y + room.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(room.w, room.h) * 0.16} fill="var(--color-ink)">
            {room.name}
          </text>
        </g>
      ))}
      <text x={plan.width / 2} y={-3} textAnchor="middle" fontSize="3" fill="var(--color-teal)">
        N
      </text>
    </svg>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}
