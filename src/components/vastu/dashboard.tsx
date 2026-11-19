import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import type { Analysis, Diagnostics } from "@/lib/vastu/types";
import { ZONE_LABEL } from "@/lib/vastu/types";
import { RULES } from "@/lib/vastu/rules";
import { CATEGORIES } from "@/lib/vastu/types";
import { analysisPdf, downloadBlob } from "@/lib/report/pdf";

export function Dashboard({
  analysis,
  fileName,
  image,
  diagnostics,
}: {
  analysis: Analysis;
  fileName: string;
  image: string | null;
  diagnostics: Diagnostics | null;
}) {
  const [saving, setSaving] = useState(false);
  const chart = useMemo(
    () =>
      analysis.rooms
        .filter((room) => room.score !== null)
        .map((room) => ({ name: room.name.length > 16 ? `${room.name.slice(0, 15)}…` : room.name, score: room.score ?? 0 })),
    [analysis.rooms],
  );
  const issues = analysis.rooms.filter((room) => room.priority === "high" || room.priority === "medium");

  async function download() {
    setSaving(true);
    try {
      const blob = await analysisPdf({ analysis, fileName, image, diagnostics });
      downloadBlob(blob, "VASTU-AI-review.pdf");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The report could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 rounded-lg border border-line bg-card p-5 lg:grid-cols-[16rem_1fr] lg:p-8">
        <ScoreRing score={analysis.overall} />
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-gold uppercase">Traditional score</p>
          <h2 className="mt-2 font-serif text-4xl text-ink">
            {analysis.overall === null ? "Score held" : analysis.interpretation}
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-ink-soft">{analysis.blockedReason ?? analysis.confidenceNote}</p>
          <p className="mt-3 max-w-2xl text-sm text-muted">{analysis.disclaimer}</p>
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Preferred" value={analysis.aligned} />
            <Stat label="Accepted" value={analysis.acceptable} />
            <Stat label="Differ" value={analysis.differs} />
            <Stat label="Unscored" value={analysis.unverified} />
          </dl>
          <button
            type="button"
            onClick={() => void download()}
            disabled={saving}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-teal px-4 text-sm font-medium text-card disabled:opacity-50"
          >
            <FileDown className="size-4" />
            {saving ? "Preparing the PDF" : "Download the report"}
          </button>
        </div>
      </section>

      {chart.length ? (
        <section className="rounded-lg border border-line bg-card p-5">
          <h3 className="font-serif text-2xl">Confirmed room scores</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <XAxis dataKey="name" tick={{ fill: "var(--color-muted)", fontSize: 12 }} interval={0} angle={-25} textAnchor="end" height={56} />
                <YAxis domain={[0, 100]} tick={{ fill: "var(--color-muted)", fontSize: 12 }} width={32} />
                <Tooltip cursor={{ fill: "var(--color-paper-2)" }} />
                <Bar dataKey="score" fill="var(--color-teal)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3">
        <h3 className="font-serif text-2xl">Rooms</h3>
        {analysis.rooms.map((room) => (
          <article key={room.roomId} className="rounded-lg border border-line bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-serif text-xl">{room.name}</h4>
              <p className="font-medium tabular-nums text-ink">
                {room.score === null ? "Not scored" : `${room.score} / 100`}
                <span className="ml-2 text-sm font-normal text-muted">{room.fit}</span>
              </p>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {room.zone === "unknown" ? "Zone not available" : `Mainly ${ZONE_LABEL[room.zone]}`}
              {room.shares[1] && room.shares[1].share >= 0.18
                ? ` · also ${ZONE_LABEL[room.shares[1].zone]} ${Math.round(room.shares[1].share * 100)}%`
                : ""}
            </p>
            <p className="mt-3 text-sm text-ink">{room.explanation || room.remedy}</p>
            {room.score !== null && room.band !== "aligned" ? <p className="mt-2 text-sm text-ink-soft">{room.remedy}</p> : null}
            <p className="mt-2 text-sm text-muted">{room.boundaryNote}</p>
            {room.priority !== "none" ? (
              <p className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs font-medium ${priorityClass(room.priority)}`}>
                {room.priority} priority
              </p>
            ) : null}
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-line bg-card p-5">
        <h3 className="font-serif text-2xl">What to do about the differences</h3>
        {issues.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No medium or high priority differences among the confirmed rooms.</p>
        ) : (
          <ol className="mt-3 grid gap-3">
            {issues.map((room) => (
              <li key={room.roomId} className="text-sm text-ink-soft">
                <span className="font-medium text-ink">{room.name}. </span>
                {room.remedy}
              </li>
            ))}
          </ol>
        )}
      </section>

      <details className="rounded-lg border border-line bg-card p-5">
        <summary className="cursor-pointer font-medium">Rules used for this score</summary>
        <p className="mt-3 text-sm text-muted">
          One traditional school. Preferred zones score 100, accepted alternatives 74, unlisted zones 58, avoided zones 32.
          The overall figure is a weighted mean. Heavier rooms are entrance, kitchen, principal bedroom, pooja, and bathrooms.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {CATEGORIES.map((category) => (
            <li key={category} className="rounded-md border border-line px-3 py-2 text-sm">
              <span className="font-medium">{category}.</span> {RULES[category].note}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function ScoreRing({ score }: { score: number | null }) {
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const shown = score ?? 0;
  return (
    <div className="grid justify-items-center">
      <svg viewBox="0 0 140 140" className="size-40" aria-hidden="true">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--color-paper-2)" strokeWidth="10" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="var(--color-teal)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - shown / 100)}
          transform="rotate(-90 70 70)"
        />
        <text x="70" y="74" textAnchor="middle" className="fill-ink" fontFamily="Instrument Serif, serif" fontSize="32">
          {score === null ? "—" : score}
        </text>
      </svg>
      <p className="text-sm text-muted">out of 100</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-serif text-2xl tabular-nums">{value}</dd>
    </div>
  );
}

function priorityClass(priority: string): string {
  if (priority === "high") return "bg-danger-soft text-danger";
  if (priority === "medium") return "bg-warn-soft text-warn";
  return "bg-gold-soft text-gold";
}
