import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, MousePointer2, Move, Pentagon, Square, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { pointInPolygon, polygonBBox, rectPolygon } from "@/lib/vastu/geometry";
import type { Point, Room } from "@/lib/vastu/types";

type Tool = "select" | "pan" | "rect" | "poly";

type Drag =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { kind: "move"; id: string; last: Point }
  | { kind: "vertex"; id: string; index: number }
  | { kind: "rect"; origin: Point; current: Point };

export function BlueprintEditor({
  imageUrl,
  rooms,
  selectedId,
  onSelect,
  onGeometry,
  onCreate,
  onDelete,
}: {
  imageUrl: string;
  rooms: Room[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onGeometry: (id: string, polygon: Point[], shape: Room["shape"]) => void;
  onCreate: (polygon: Point[], shape: Room["shape"]) => void;
  onDelete: (id: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [view, setView] = useState({ x: 24, y: 24, scale: 1 });
  const [tool, setTool] = useState<Tool>("select");
  const [draft, setDraft] = useState<Point[] | null>(null);
  const [poly, setPoly] = useState<Point[]>([]);
  const viewRef = useRef(view);
  const roomsRef = useRef(rooms);
  const dragRef = useRef<Drag | null>(null);
  const naturalRef = useRef(natural);
  viewRef.current = view;
  roomsRef.current = rooms;
  naturalRef.current = natural;

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const size = { w: image.naturalWidth, h: image.naturalHeight };
      setNatural(size);
      naturalRef.current = size;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        canvas.width = size.w;
        canvas.height = size.h;
        ctx.drawImage(image, 0, 0);
      }
      fit(size);
    };
    image.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY < 0 ? 1.08 : 1 / 1.08);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "Escape") setPoly([]);
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) onDelete(selectedId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDelete, selectedId]);

  function fit(size = naturalRef.current) {
    const el = viewportRef.current;
    if (!el) return;
    const pad = 28;
    const scale = Math.min((el.clientWidth - pad) / size.w, (el.clientHeight - pad) / size.h);
    const safe = Number.isFinite(scale) && scale > 0 ? scale : 1;
    setView({
      scale: safe,
      x: (el.clientWidth - size.w * safe) / 2,
      y: (el.clientHeight - size.h * safe) / 2,
    });
  }

  function zoomAt(sx: number, sy: number, factor: number) {
    const current = viewRef.current;
    const next = Math.min(8, Math.max(0.08, current.scale * factor));
    const k = next / current.scale;
    setView({ scale: next, x: sx - (sx - current.x) * k, y: sy - (sy - current.y) * k });
  }

  function toImage(clientX: number, clientY: number): Point | null {
    const el = viewportRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const current = viewRef.current;
    const size = naturalRef.current;
    return {
      x: (clientX - rect.left - current.x) / current.scale / size.w,
      y: (clientY - rect.top - current.y) / current.scale / size.h,
    };
  }

  function screenDistance(a: Point, b: Point): number {
    const current = viewRef.current;
    const size = naturalRef.current;
    return Math.hypot((a.x - b.x) * size.w * current.scale, (a.y - b.y) * size.h * current.scale);
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const point = toImage(event.clientX, event.clientY);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "pan") {
      dragRef.current = { kind: "pan", sx: event.clientX, sy: event.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
      return;
    }
    if (tool === "rect") {
      dragRef.current = { kind: "rect", origin: point, current: point };
      setDraft(rectPolygon(point.x, point.y, 0.001, 0.001));
      return;
    }
    if (tool === "poly") {
      if (poly.length >= 3 && screenDistance(point, poly[0]!) < 16) {
        onCreate(poly, "poly");
        setPoly([]);
        return;
      }
      setPoly([...poly, clampPoint(point)]);
      return;
    }
    const selected = roomsRef.current.find((room) => room.id === selectedId);
    if (selected) {
      const hit = selected.polygon.findIndex((vertex) => screenDistance(point, vertex) < 16);
      if (hit >= 0) {
        dragRef.current = { kind: "vertex", id: selected.id, index: hit };
        return;
      }
    }
    const hitRoom = [...roomsRef.current].reverse().find((room) => pointInPolygon(point, room.polygon));
    if (hitRoom) {
      onSelect(hitRoom.id);
      dragRef.current = { kind: "move", id: hitRoom.id, last: point };
      return;
    }
    onSelect(null);
    dragRef.current = { kind: "pan", sx: event.clientX, sy: event.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "pan") {
      setView({ ...viewRef.current, x: drag.vx + event.clientX - drag.sx, y: drag.vy + event.clientY - drag.sy });
      return;
    }
    const point = toImage(event.clientX, event.clientY);
    if (!point) return;
    if (drag.kind === "rect") {
      drag.current = point;
      const x = Math.min(drag.origin.x, point.x);
      const y = Math.min(drag.origin.y, point.y);
      setDraft(rectPolygon(x, y, Math.abs(point.x - drag.origin.x), Math.abs(point.y - drag.origin.y)));
      return;
    }
    if (drag.kind === "move") {
      const room = roomsRef.current.find((item) => item.id === drag.id);
      if (!room) return;
      const dx = point.x - drag.last.x;
      const dy = point.y - drag.last.y;
      drag.last = point;
      onGeometry(room.id, translate(room.polygon, dx, dy), room.shape);
      return;
    }
    const room = roomsRef.current.find((item) => item.id === drag.id);
    if (!room) return;
    if (room.shape === "rect") onGeometry(room.id, resizeRect(room.polygon, drag.index, clampPoint(point)), "rect");
    else {
      const next = room.polygon.map((vertex, index) => (index === drag.index ? clampPoint(point) : vertex));
      onGeometry(room.id, next, "poly");
    }
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.kind === "rect") {
      const x = Math.min(drag.origin.x, drag.current.x);
      const y = Math.min(drag.origin.y, drag.current.y);
      const w = Math.abs(drag.current.x - drag.origin.x);
      const h = Math.abs(drag.current.y - drag.origin.y);
      setDraft(null);
      if (w > 0.02 && h > 0.02) onCreate(rectPolygon(x, y, w, h), "rect");
    }
  }

  const transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToolButton active={tool === "select"} onClick={() => setTool("select")} label="Select">
          <MousePointer2 className="size-4" />
        </ToolButton>
        <ToolButton active={tool === "pan"} onClick={() => setTool("pan")} label="Pan">
          <Move className="size-4" />
        </ToolButton>
        <ToolButton active={tool === "rect"} onClick={() => setTool("rect")} label="Rectangle">
          <Square className="size-4" />
        </ToolButton>
        <ToolButton active={tool === "poly"} onClick={() => setTool("poly")} label="Polygon">
          <Pentagon className="size-4" />
        </ToolButton>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <ToolButton active={false} onClick={() => zoomAt(200, 200, 1.15)} label="Zoom in">
          <ZoomIn className="size-4" />
        </ToolButton>
        <ToolButton active={false} onClick={() => zoomAt(200, 200, 1 / 1.15)} label="Zoom out">
          <ZoomOut className="size-4" />
        </ToolButton>
        <ToolButton active={false} onClick={() => fit()} label="Fit">
          <Maximize2 className="size-4" />
        </ToolButton>
        {selectedId ? (
          <button
            type="button"
            onClick={() => onDelete(selectedId)}
            className="ml-auto inline-flex h-11 items-center gap-2 rounded-md border border-line bg-card px-3 text-sm text-danger"
          >
            <Trash2 className="size-4" />
            Delete
          </button>
        ) : null}
      </div>
      {tool === "poly" ? (
        <p className="text-sm text-muted">
          Click each corner. Click the first point to close the room. Escape cancels.
          {poly.length >= 3 ? (
            <button type="button" className="ml-2 text-teal underline" onClick={() => { onCreate(poly, "poly"); setPoly([]); }}>
              Close shape
            </button>
          ) : null}
        </p>
      ) : (
        <p className="text-sm text-muted">Drag a room to move it. Drag a corner to resize. Scroll or pinch-zoom with the buttons.</p>
      )}
      <div ref={viewportRef} className="stage-canvas relative overflow-hidden rounded-lg border border-line bg-paper-2">
        <canvas ref={canvasRef} className="absolute top-0 left-0 origin-top-left" style={{ transform }} />
        <svg
          className="absolute inset-0 h-full w-full"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <g style={{ transform }}>
            {[...rooms, ...(draft ? [{ id: "draft", polygon: draft, category: "Unlabeled" as const, verified: false, name: "" }] : [])].map((room) => {
              const active = room.id === selectedId;
              const unlabeled = room.category === "Unlabeled" || room.id === "draft";
              const points = room.polygon.map((point) => `${point.x * natural.w},${point.y * natural.h}`).join(" ");
              return (
                <g key={room.id}>
                  <polygon
                    points={points}
                    fill={unlabeled ? "var(--color-gold-soft)" : "var(--color-teal-soft)"}
                    fillOpacity={0.9}
                    stroke={active ? "var(--color-teal-deep)" : unlabeled ? "var(--color-gold)" : "var(--color-teal)"}
                    strokeWidth={active ? 3 / view.scale : 2 / view.scale}
                    strokeDasharray={room.verified ? undefined : `${8 / view.scale} ${6 / view.scale}`}
                  />
                  {room.name ? (
                    <text
                      x={centroid(room.polygon).x * natural.w}
                      y={centroid(room.polygon).y * natural.h}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="var(--color-ink)"
                      fontSize={Math.max(12, natural.w * 0.016) }
                      fontFamily="Outfit, sans-serif"
                    >
                      {room.name}
                    </text>
                  ) : null}
                  {active
                    ? room.polygon.map((point, index) => (
                        <circle
                          key={`${room.id}-${index}`}
                          cx={point.x * natural.w}
                          cy={point.y * natural.h}
                          r={7 / view.scale}
                          fill="var(--color-card)"
                          stroke="var(--color-teal)"
                          strokeWidth={2 / view.scale}
                        />
                      ))
                    : null}
                </g>
              );
            })}
            {poly.length ? (
              <polyline
                points={poly.map((point) => `${point.x * natural.w},${point.y * natural.h}`).join(" ")}
                fill="none"
                stroke="var(--color-gold)"
                strokeWidth={2 / view.scale}
              />
            ) : null}
          </g>
        </svg>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex h-11 items-center gap-2 rounded-md border px-3 text-sm ${
        active ? "border-teal bg-teal text-card" : "border-line bg-card text-ink"
      }`}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function centroid(polygon: Point[]): Point {
  if (!polygon.length) return { x: 0, y: 0 };
  const box = polygonBBox(polygon);
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

function clampPoint(point: Point): Point {
  return { x: Math.min(1, Math.max(0, point.x)), y: Math.min(1, Math.max(0, point.y)) };
}

function translate(polygon: Point[], dx: number, dy: number): Point[] {
  let next = polygon.map((point) => ({ x: point.x + dx, y: point.y + dy }));
  const box = polygonBBox(next);
  let fixX = 0;
  let fixY = 0;
  if (box.minX < 0) fixX = -box.minX;
  if (box.maxX > 1) fixX = 1 - box.maxX;
  if (box.minY < 0) fixY = -box.minY;
  if (box.maxY > 1) fixY = 1 - box.maxY;
  if (fixX || fixY) next = next.map((point) => ({ x: point.x + fixX, y: point.y + fixY }));
  return next;
}

function resizeRect(polygon: Point[], index: number, point: Point): Point[] {
  const xs = polygon.map((vertex) => vertex.x);
  const ys = polygon.map((vertex) => vertex.y);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (index === 0 || index === 3) minX = point.x;
  else maxX = point.x;
  if (index === 0 || index === 1) minY = point.y;
  else maxY = point.y;
  if (maxX < minX) [minX, maxX] = [maxX, minX];
  if (maxY < minY) [minY, maxY] = [maxY, minY];
  return rectPolygon(minX, minY, Math.max(0.01, maxX - minX), Math.max(0.01, maxY - minY));
}
