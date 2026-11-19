import type { NorthHeading, Room } from "../vastu/types.ts";
import { ZONE_LABEL } from "../vastu/types.ts";

export function annotatedJpeg(source: HTMLCanvasElement, rooms: Room[], north: NorthHeading): string {
  const maxWidth = 1400;
  const scale = Math.min(1, maxWidth / source.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return source.toDataURL("image/jpeg", 0.7);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  ctx.lineWidth = Math.max(2, canvas.width / 500);
  ctx.font = `${Math.max(14, Math.round(canvas.width / 70))}px Helvetica, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const room of rooms) {
    if (room.polygon.length < 3) continue;
    ctx.beginPath();
    room.polygon.forEach((point, index) => {
      const x = point.x * canvas.width;
      const y = point.y * canvas.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = room.category === "Unlabeled" ? "rgba(141,107,58,0.16)" : "rgba(26,95,89,0.16)";
    ctx.strokeStyle = room.verified ? "#1a5f59" : "#8d6b3a";
    ctx.fill();
    ctx.stroke();
    const center = centroid(room.polygon);
    ctx.fillStyle = "#1a1f2b";
    ctx.fillText(room.name, center.x * canvas.width, center.y * canvas.height);
  }
  const label = north === "unknown" ? "North not set" : `North ${ZONE_LABEL[north]}`;
  ctx.fillStyle = "rgba(251,248,243,0.92)";
  ctx.fillRect(16, 16, ctx.measureText(label).width + 28, 36);
  ctx.fillStyle = "#1a1f2b";
  ctx.textAlign = "left";
  ctx.fillText(label, 28, 34);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function centroid(polygon: { x: number; y: number }[]): { x: number; y: number } {
  const sum = polygon.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / polygon.length, y: sum.y / polygon.length };
}
