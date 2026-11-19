import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { BlueprintEditor } from "@/components/vastu/editor";
import { CompassControl } from "@/components/vastu/compass";
import { Dashboard } from "@/components/vastu/dashboard";
import { Planner } from "@/components/vastu/planner";
import { assertFile, canvasUrl, fileToCanvas, renderPdf, rotateCanvas } from "@/lib/vision/documents";
import { readBlueprint } from "@/lib/vision/recognize";
import { annotatedJpeg } from "@/lib/report/annotate";
import { publicUrl } from "@/lib/public-url";
import { analyzeLayout, suggestFrameMode } from "@/lib/vastu/scoring";
import { confidenceWord } from "@/lib/vision/assemble";
import {
  CATEGORIES,
  ZONE_LABEL,
  type Diagnostics,
  type FrameMode,
  type NorthHeading,
  type Point,
  type Room,
} from "@/lib/vastu/types";

type Stage = "home" | "review" | "report" | "plan";

export function Studio() {
  const [stage, setStage] = useState<Stage>("home");
  const [fileName, setFileName] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [sheetNote, setSheetNote] = useState<string | null>(null);
  const [north, setNorth] = useState<NorthHeading>("unknown");
  const [frameMode, setFrameMode] = useState<FrameMode>("sheet");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfRef = useRef<ArrayBuffer | null>(null);
  const urlRef = useRef<string | null>(null);
  const runRef = useRef(0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const analysis = useMemo(() => analyzeLayout(rooms, north, frameMode), [rooms, north, frameMode]);
  const selected = rooms.find((room) => room.id === selectedId) ?? null;
  const preview = analysis.rooms.find((room) => room.roomId === selectedId) ?? null;

  async function adopt(
    canvas: HTMLCanvasElement,
    name: string,
    pageNumber: number,
    pages: number,
    note: string | null,
  ) {
    const token = ++runRef.current;
    canvasRef.current = canvas;
    setFileName(name);
    setPage(pageNumber);
    setPageCount(pages);
    setSheetNote(note);
    setBusy("Reading the sheet");
    setProgress(0.1);
    setError(null);
    setStage("review");
    try {
      const url = await canvasUrl(canvas);
      if (token !== runRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setImageUrl(url);
      const result = await readBlueprint(canvas, (label, pct) => {
        if (token !== runRef.current) return;
        setBusy(label);
        setProgress(pct);
      });
      if (token !== runRef.current) return;
      setRooms(result.rooms);
      setFrameMode(suggestFrameMode(result.rooms));
      setSelectedId(result.rooms[0]?.id ?? null);
      setNorth("unknown");
      setDiagnostics({ ...result.diagnostics, page: pageNumber, pageCount: pages });
      const found = result.diagnostics.matchedLabels.length;
      toast.message(
        found
          ? `Read ${found} room name${found === 1 ? "" : "s"}. Confirm them before scoring.`
          : "No room names were read. You can draw them.",
      );
    } catch (err) {
      if (token !== runRef.current) return;
      setError(err instanceof Error ? err.message : "The sheet could not be read.");
    } finally {
      if (token === runRef.current) setBusy(null);
    }
  }

  async function openFile(file: File, pageNumber = 1) {
    const problem = assertFile(file);
    if (problem) {
      setError(problem);
      toast.error(problem);
      return;
    }
    setBusy("Opening the sheet");
    setProgress(0.04);
    setError(null);
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (isPdf) pdfRef.current = await file.arrayBuffer();
      else pdfRef.current = null;
      const rendered =
        isPdf && pdfRef.current ? await renderPdf(pdfRef.current, pageNumber) : await fileToCanvas(file, pageNumber);
      if (rendered.note) toast.message(rendered.note);
      await adopt(rendered.canvas, file.name, pageNumber, rendered.pageCount, rendered.note);
    } catch (err) {
      setBusy(null);
      const message = err instanceof Error ? err.message : "Could not open that file.";
      setError(message);
      toast.error(message);
    }
  }

  async function changePage(next: number) {
    const buffer = pdfRef.current;
    if (!buffer || !fileName) return;
    setBusy("Opening the page");
    try {
      const rendered = await renderPdf(buffer, next);
      await adopt(rendered.canvas, fileName, next, rendered.pageCount, rendered.note);
    } catch (err) {
      setBusy(null);
      toast.error(err instanceof Error ? err.message : "Could not open that page.");
    }
  }

  async function rotate() {
    const canvas = canvasRef.current;
    if (!canvas || !fileName) return;
    toast.message("Rotated the sheet. Reading it again.");
    await adopt(rotateCanvas(canvas), fileName, page, pageCount, sheetNote);
  }

  async function openSample() {
    setBusy("Opening the sample sheet");
    try {
      const response = await fetch(publicUrl("sample-plan.png"));
      if (!response.ok) throw new Error("The sample sheet is unavailable.");
      const blob = await response.blob();
      await openFile(new File([blob], "sample-plan.png", { type: "image/png" }));
    } catch (err) {
      setBusy(null);
      toast.error(err instanceof Error ? err.message : "Could not open the sample.");
    }
  }

  function patchRoom(id: string, patch: Partial<Room>) {
    setRooms((current) => current.map((room) => (room.id === id ? { ...room, ...patch } : room)));
  }

  function onGeometry(id: string, polygon: Point[], shape: Room["shape"]) {
    patchRoom(id, { polygon, shape, boundaryStatus: "user", source: "user" });
  }

  function onCreate(polygon: Point[], shape: Room["shape"]) {
    const room: Room = {
      id: crypto.randomUUID(),
      name: "New room",
      category: "Unlabeled",
      polygon,
      shape,
      source: "user",
      boundaryStatus: "user",
      confidence: 1,
      verified: false,
      notes: ["Drawn by you."],
    };
    setRooms((current) => [...current, room]);
    setSelectedId(room.id);
  }

  function confirmNamed() {
    let skipped = 0;
    setRooms((current) =>
      current.map((room) => {
        if (room.category === "Unlabeled") {
          skipped += 1;
          return room;
        }
        return { ...room, verified: true };
      }),
    );
    if (skipped) {
      toast.message(
        `${skipped} unlabeled region${skipped === 1 ? "" : "s"} still need a use before they can be confirmed.`,
      );
    } else toast.message("Named rooms confirmed. Set North if you have not already.");
  }

  const annotated = canvasRef.current && stage === "report" ? annotatedJpeg(canvasRef.current, rooms, north) : null;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-ink text-paper">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <button type="button" onClick={() => setStage("home")} className="text-left">
            <span className="font-serif text-2xl tracking-wide">VASTU</span>
            <span className="ml-2 text-xs tracking-widest text-gold">AI</span>
          </button>
          <nav className="ml-auto flex gap-2">
            <NavButton
              active={stage === "home" || stage === "review" || stage === "report"}
              onClick={() => setStage(imageUrl ? "review" : "home")}
            >
              Blueprint
            </NavButton>
            <NavButton active={stage === "plan"} onClick={() => setStage("plan")}>
              Plan
            </NavButton>
          </nav>
        </div>
        <div className="h-0.5 bg-gold" />
      </header>
      {busy ? (
        <div className="h-1 bg-paper-2" aria-hidden="true">
          <div className="h-full bg-teal" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6">
        {stage === "plan" ? (
          <Planner />
        ) : stage === "home" || !imageUrl ? (
          <Home
            dragOver={dragOver}
            busy={busy}
            error={error}
            onBrowse={() => fileRef.current?.click()}
            onSample={() => void openSample()}
            onDrop={(file) => void openFile(file)}
            setDragOver={setDragOver}
          />
        ) : stage === "report" ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs tracking-widest text-gold uppercase">Review</p>
                <h2 className="font-serif text-4xl">{fileName}</h2>
              </div>
              <button
                type="button"
                className="h-11 rounded-md border border-line bg-card px-4 text-sm"
                onClick={() => setStage("review")}
              >
                Back to the sheet
              </button>
            </div>
            <Dashboard analysis={analysis} fileName={fileName ?? "plan"} image={annotated} diagnostics={diagnostics} />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="mr-auto font-serif text-3xl">{fileName}</h2>
                {pageCount > 1 ? (
                  <label className="flex items-center gap-2 text-sm">
                    Page
                    <select
                      className="field w-auto"
                      value={page}
                      onChange={(event) => void changePage(Number(event.target.value))}
                      disabled={!!busy}
                    >
                      {Array.from({ length: pageCount }, (_, index) => (
                        <option key={index + 1} value={index + 1}>
                          {index + 1} of {pageCount}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-2 rounded-md border border-line bg-card px-3 text-sm"
                  onClick={() => void rotate()}
                  disabled={!!busy}
                >
                  <RotateCw className="size-4" />
                  Rotate
                </button>
              </div>
              {sheetNote ? <p className="mb-3 text-sm text-warn">{sheetNote}</p> : null}
              {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
              {busy ? <p className="mb-3 text-sm text-teal">{busy}</p> : null}
              <BlueprintEditor
                imageUrl={imageUrl}
                rooms={rooms}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onGeometry={onGeometry}
                onCreate={onCreate}
                onDelete={(id) => {
                  setRooms((current) => current.filter((room) => room.id !== id));
                  setSelectedId((current) => (current === id ? null : current));
                }}
              />
            </section>
            <aside className="grid content-start gap-5">
              <div className="rounded-lg border border-line bg-card p-4">
                <CompassControl value={north} onChange={setNorth} />
              </div>
              <div className="rounded-lg border border-line bg-card p-4">
                <p className="text-sm font-medium">Direction frame</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <FrameButton active={frameMode === "rooms"} onClick={() => setFrameMode("rooms")} label="Marked rooms" />
                  <FrameButton active={frameMode === "sheet"} onClick={() => setFrameMode("sheet")} label="Full sheet" />
                </div>
                <p className="mt-2 text-sm text-muted">{analysis.frameNote}</p>
              </div>
              <div className="rounded-lg border border-line bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{rooms.length} marked</p>
                  <button type="button" className="text-sm text-teal" onClick={confirmNamed}>
                    Confirm named
                  </button>
                </div>
                <ul className="mt-3 grid max-h-80 gap-2 overflow-auto">
                  {rooms.map((room) => {
                    const row = analysis.rooms.find((item) => item.roomId === room.id);
                    return (
                      <li key={room.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(room.id)}
                          className={`w-full rounded-md border px-3 py-2 text-left ${
                            room.id === selectedId ? "border-teal bg-teal-soft" : "border-line"
                          }`}
                        >
                          <span className="block text-sm font-medium">{room.name}</span>
                          <span className="block text-xs text-muted">
                            {confidenceWord(room.confidence)} confidence
                            {room.verified ? " · confirmed" : " · unconfirmed"}
                            {north !== "unknown" && row && row.zone !== "unknown" ? ` · ${ZONE_LABEL[row.zone]}` : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {selected ? (
                  <div className="mt-4 grid gap-3 border-t border-line pt-4">
                    <label className="grid gap-1 text-sm">
                      Name
                      <input
                        className="field"
                        value={selected.name}
                        onChange={(event) => patchRoom(selected.id, { name: event.target.value })}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Use
                      <select
                        className="field"
                        value={selected.category}
                        onChange={(event) => {
                          const category = event.target.value as Room["category"];
                          const rename =
                            selected.category === "Unlabeled" ||
                            selected.name === "New room" ||
                            selected.name === "Unlabeled region";
                          patchRoom(selected.id, {
                            category,
                            name: rename && category !== "Unlabeled" ? category : selected.name,
                          });
                        }}
                      >
                        <option value="Unlabeled">Choose a use</option>
                        {CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="h-11 rounded-md border border-line text-sm"
                      onClick={() => patchRoom(selected.id, { verified: !selected.verified })}
                      disabled={selected.category === "Unlabeled"}
                    >
                      {selected.verified ? "Mark unconfirmed" : "Confirm this room"}
                    </button>
                    {selected.notes.map((note) => (
                      <p key={note} className="text-sm text-muted">
                        {note}
                      </p>
                    ))}
                    {preview && north !== "unknown" ? (
                      <p className="text-sm text-ink-soft">
                        Zone preview: {preview.zone === "unknown" ? "not available" : ZONE_LABEL[preview.zone]}. Scores
                        stay off until you confirm.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={!!analysis.blockedReason}
                  onClick={() => setStage("report")}
                  className="mt-4 h-11 w-full rounded-md bg-teal text-sm font-medium text-card disabled:opacity-50"
                >
                  Score confirmed rooms
                </button>
                {analysis.blockedReason ? <p className="mt-2 text-sm text-muted">{analysis.blockedReason}</p> : null}
              </div>
              {diagnostics ? <DiagnosticsPanel diagnostics={diagnostics} /> : null}
            </aside>
          </div>
        )}
        <p className="text-xs text-muted">
          Readings stay in this browser. Traditional Vastu guidance is not a scientific, structural, or legal assessment.
        </p>
      </main>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/tiff,.pdf"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void openFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function Home({
  dragOver,
  busy,
  error,
  onBrowse,
  onSample,
  onDrop,
  setDragOver,
}: {
  dragOver: boolean;
  busy: string | null;
  error: string | null;
  onBrowse: () => void;
  onSample: () => void;
  onDrop: (file: File) => void;
  setDragOver: (value: boolean) => void;
}) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div>
        <p className="text-xs font-medium tracking-widest text-gold uppercase">Blueprint studio</p>
        <h1 className="mt-3 max-w-xl font-serif text-5xl leading-tight text-ink sm:text-6xl">
          Confirm the plan before you score it.
        </h1>
        <p className="mt-4 max-w-xl text-base text-ink-soft">
          Upload a floor plan. Room names and likely walls are read on this device. Nothing is scored until you set
          North and confirm each room. The result is traditional guidance, not a rating of safety or quality.
        </p>
        <div
          className={`mt-6 rounded-lg border border-dashed p-6 ${dragOver ? "border-teal bg-teal-soft" : "border-line bg-card"}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files[0];
            if (file) onDrop(file);
          }}
        >
          <Upload className="size-5 text-teal" />
          <p className="mt-3 font-medium">Drop a PNG, JPG, WEBP, TIFF, or PDF</p>
          <p className="mt-1 text-sm text-muted">Up to 12 MB. Multi-page PDFs ask which sheet to read.</p>
          {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
          {busy ? <p className="mt-2 text-sm text-teal">{busy}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onBrowse} className="h-11 rounded-md bg-teal px-4 text-sm font-medium text-card">
              Choose a file
            </button>
            <button type="button" onClick={onSample} className="h-11 rounded-md border border-line px-4 text-sm">
              Use the sample plan
            </button>
          </div>
        </div>
        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          <Step n="01" title="Read" text="Labels and enclosed regions, with a note when either fails." />
          <Step n="02" title="Correct" text="Rename, redraw, delete, and set the North edge." />
          <Step n="03" title="Interpret" text="A weighted traditional score, plain remedies, and a PDF." />
        </ol>
      </div>
      <SampleFigure />
    </div>
  );
}

function SampleFigure() {
  return (
    <figure className="rounded-lg border border-line bg-card p-4">
      <svg viewBox="0 0 320 240" className="w-full" aria-hidden="true">
        <rect x="16" y="20" width="288" height="188" fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="2" />
        <path d="M16 90 H304 M16 160 H304 M120 20 V160 M210 90 V208" fill="none" stroke="var(--color-ink)" strokeWidth="1.4" />
        <text x="68" y="60" textAnchor="middle" fontSize="11" fill="var(--color-ink)">
          Living
        </text>
        <text x="165" y="60" textAnchor="middle" fontSize="11" fill="var(--color-ink)">
          Lobby
        </text>
        <text x="256" y="60" textAnchor="middle" fontSize="11" fill="var(--color-ink)">
          Kitchen
        </text>
        <text x="68" y="128" textAnchor="middle" fontSize="11" fill="var(--color-ink)">
          Bedroom
        </text>
        <text x="256" y="150" textAnchor="middle" fontSize="11" fill="var(--color-ink)">
          Garden
        </text>
        <polygon points="28,12 34,20 40,12 34,15" fill="var(--color-teal)" />
        <text x="48" y="18" fontSize="10" fill="var(--color-teal)">
          N
        </text>
      </svg>
      <figcaption className="mt-2 text-sm text-muted">
        A sheet is a proposal until the rooms and North are confirmed.
      </figcaption>
    </figure>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <li className="rounded-md border border-line bg-card p-3">
      <p className="text-xs text-gold">{n}</p>
      <p className="mt-1 font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </li>
  );
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className={`h-11 rounded-md px-3 text-sm ${active ? "bg-card text-ink" : "text-paper"}`}>
      {children}
    </button>
  );
}

function FrameButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-md border text-sm ${active ? "border-teal bg-teal text-card" : "border-line"}`}
    >
      {label}
    </button>
  );
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: Diagnostics }) {
  return (
    <details className="rounded-lg border border-line bg-card p-4 text-sm">
      <summary className="cursor-pointer font-medium">How this sheet was read</summary>
      <p className="mt-3 text-muted">{diagnostics.segmentNote}</p>
      <p className="mt-2 text-muted">
        {diagnostics.ms} ms · {diagnostics.ocrCharacters} text characters · {diagnostics.regionCount} regions ·{" "}
        {diagnostics.labelsInsideRegions} labels inside a region
      </p>
      <p className="mt-2">Names kept: {diagnostics.matchedLabels.join(", ") || "none"}</p>
      {diagnostics.rawSnippets.length ? (
        <p className="mt-2 text-muted">Text seen: {diagnostics.rawSnippets.join(" · ")}</p>
      ) : null}
      <ul className="mt-2 grid gap-1 text-muted">
        {diagnostics.passes.map((pass) => (
          <li key={`${pass.psm}-${pass.ms}`}>
            Pass PSM {pass.psm}: {pass.words} words in {pass.ms} ms{pass.error ? ` · ${pass.error}` : ""}
          </li>
        ))}
      </ul>
      <ul className="mt-2 grid gap-1">
        {diagnostics.warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </details>
  );
}
