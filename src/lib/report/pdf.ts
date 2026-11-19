import type { Analysis, Diagnostics } from "../vastu/types.ts";
import { ZONE_LABEL } from "../vastu/types.ts";
import type { ConceptFloor } from "../vastu/floorplan.ts";
import { facingName } from "../vastu/floorplan.ts";

type JsPDF = import("jspdf").jsPDF;

function footer(doc: JsPDF, page: number): void {
  const h = doc.internal.pageSize.getHeight();
  doc.setFont("times", "italic");
  doc.setFontSize(8);
  doc.setTextColor(90, 84, 74);
  doc.text("Traditional guidance only. Not a structural, scientific, or legal assessment.", 14, h - 10);
  doc.text(String(page), doc.internal.pageSize.getWidth() - 14, h - 10, { align: "right" });
}

function heading(doc: JsPDF, text: string, y: number): number {
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.setTextColor(26, 31, 43);
  doc.text(text, 14, y);
  return y + 8;
}

export async function analysisPdf(options: {
  analysis: Analysis;
  fileName: string;
  image: string | null;
  diagnostics: Diagnostics | null;
}): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const date = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  let page = 1;
  doc.setFillColor(26, 31, 43);
  doc.rect(0, 0, width, 28, "F");
  doc.setTextColor(243, 239, 231);
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.text("VASTU AI", 14, 12);
  doc.setFont("times", "normal");
  doc.setFontSize(10);
  doc.text("Blueprint review", 14, 19);
  doc.text(date, width - 14, 16, { align: "right" });

  let y = 40;
  doc.setTextColor(26, 31, 43);
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.text("Executive summary", 14, y);
  y += 8;
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  const score = options.analysis.overall === null ? "Not scored" : `${options.analysis.overall} / 100`;
  const lines = [
    `Sheet: ${options.fileName || "Untitled"}`,
    `Overall traditional score: ${score}`,
    options.analysis.interpretation,
    `Rooms marked: ${options.analysis.rooms.length}. Preferred: ${options.analysis.aligned}. Accepted alternatives: ${options.analysis.acceptable}. Differences: ${options.analysis.differs}. Not scored: ${options.analysis.unverified}.`,
    `North: ${options.analysis.north === "unknown" ? "not set" : ZONE_LABEL[options.analysis.north]}.`,
    options.analysis.confidenceNote,
    options.analysis.frameNote,
    options.analysis.disclaimer,
  ];
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, width - 28) as string[];
    doc.text(wrapped, 14, y);
    y += wrapped.length * 5.2 + 2;
  }
  footer(doc, page);

  if (options.image) {
    doc.addPage();
    page += 1;
    y = heading(doc, "Blueprint overview", 18);
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    doc.text("Marked rooms on the sheet you reviewed. Gold outlines were not confirmed.", 14, y);
    y += 4;
    const props = doc.getImageProperties(options.image);
    const maxW = width - 28;
    const maxH = 210;
    const ratio = Math.min(maxW / props.width, maxH / props.height);
    doc.addImage(options.image, "JPEG", 14, y, props.width * ratio, props.height * ratio);
    footer(doc, page);
  }

  doc.addPage();
  page += 1;
  y = heading(doc, "Room-wise analysis", 18);
  doc.setFontSize(9);
  for (const room of options.analysis.rooms) {
    if (y > 250) {
      footer(doc, page);
      doc.addPage();
      page += 1;
      y = heading(doc, "Room-wise analysis", 18);
    }
    doc.setFont("times", "bold");
    doc.setFontSize(11);
    doc.setTextColor(26, 31, 43);
    const zone = room.zone === "unknown" ? "Zone unknown" : ZONE_LABEL[room.zone];
    const score = room.score === null ? "not scored" : `${room.score}/100`;
    doc.text(`${room.name} · ${zone} · ${score}`, 14, y);
    y += 5;
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    const body = [
      room.preferred,
      room.fit,
      room.explanation,
      room.boundaryNote,
      room.verified ? "Confirmed by the reviewer." : "Not confirmed.",
    ]
      .filter(Boolean)
      .join(" ");
    const wrapped = doc.splitTextToSize(body, width - 28) as string[];
    doc.text(wrapped, 14, y);
    y += wrapped.length * 4.2 + 4;
  }
  footer(doc, page);

  doc.addPage();
  page += 1;
  y = heading(doc, "Differences and practical options", 18);
  const issues = options.analysis.rooms.filter((room) => room.priority === "high" || room.priority === "medium");
  doc.setFont("times", "normal");
  doc.setFontSize(10);
  if (!issues.length) {
    doc.text("No medium or high priority differences among the confirmed rooms.", 14, y);
    y += 8;
  }
  for (const room of issues) {
    if (y > 250) {
      footer(doc, page);
      doc.addPage();
      page += 1;
      y = heading(doc, "Differences and practical options", 18);
    }
    doc.setFont("times", "bold");
    doc.text(`${room.priority === "high" ? "High" : "Medium"} · ${room.name}`, 14, y);
    y += 5;
    doc.setFont("times", "normal");
    const wrapped = doc.splitTextToSize(room.remedy, width - 28) as string[];
    doc.text(wrapped, 14, y);
    y += wrapped.length * 4.4 + 4;
  }
  footer(doc, page);

  doc.addPage();
  page += 1;
  y = heading(doc, "Method and limits", 18);
  doc.setFont("times", "normal");
  doc.setFontSize(10);
  const method = [
    "Room names come from on-device text recognition. The image is contrast-stretched, then read with sparse-text and block page modes. A black-and-white pass runs only if few names are found. Split lines such as LIVING / ROOM are joined. Names are matched to a fixed list. Studio is not rewritten as study, and garden is not rewritten as a living room.",
    "Walls are estimated by local contrast on a reduced image. Door gaps are bridged lightly, then enclosed light regions are traced. A label inside one region inherits that region. Otherwise the editable box sits on the text. Neither result is a measured survey.",
    options.diagnostics
      ? `This run took ${options.diagnostics.ms} ms. Text characters read: ${options.diagnostics.ocrCharacters}. Traced regions: ${options.diagnostics.regionCount}. Labels inside a region: ${options.diagnostics.labelsInsideRegions}. ${options.diagnostics.segmentNote}`
      : "Detection notes were not available for this export.",
    "Directions use a 3×3 grid of the chosen frame after rotating the sheet so the selected North points up. A room that crosses grid lines is scored on the zone that contains most of its marked area. The overall score is a weighted mean of confirmed rooms only. Unconfirmed rooms are excluded, not treated as perfect.",
    "The weights favor entrance, kitchen, principal bedroom, pooja, and bathrooms. Scores are 100 in a preferred zone, 74 in an accepted alternative, 58 in an unlisted zone, and 32 in an avoided zone.",
    options.analysis.disclaimer,
    "This report does not check structure, fire egress, ventilation, setbacks, or local building rules. Do not alter load-bearing walls, stairs, or plumbing from this document alone.",
  ];
  for (const paragraph of method) {
    const wrapped = doc.splitTextToSize(paragraph, width - 28) as string[];
    if (y + wrapped.length * 4.6 > 270) {
      footer(doc, page);
      doc.addPage();
      page += 1;
      y = 18;
    }
    doc.text(wrapped, 14, y);
    y += wrapped.length * 4.6 + 3;
  }
  footer(doc, page);
  return doc.output("blob");
}

export async function conceptPdf(plans: ConceptFloor[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  plans.forEach((plan, index) => {
    if (index) doc.addPage();
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    doc.setFont("times", "bold");
    doc.setFontSize(16);
    doc.setTextColor(26, 31, 43);
    doc.text(`VASTU AI · ${plan.title}`, 14, 16);
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    doc.text(
      `Conceptual plan · ${plan.width} × ${plan.length} ft · Facing ${facingName(plan.facing)} · Traditional fit ${plan.score ?? "—"}/100`,
      14,
      23,
    );
    const ox = 20;
    const oy = 34;
    const drawW = width - 40;
    const drawH = 150;
    const scale = Math.min(drawW / plan.width, drawH / plan.length);
    doc.setDrawColor(26, 95, 89);
    doc.setLineWidth(0.6);
    doc.rect(ox, oy, plan.width * scale, plan.length * scale);
    for (const room of plan.rooms) {
      const x = ox + room.x * scale;
      const y = oy + room.y * scale;
      const w = room.w * scale;
      const h = room.h * scale;
      doc.setDrawColor(58, 65, 80);
      doc.setLineWidth(0.2);
      doc.rect(x, y, w, h);
      doc.setFontSize(8);
      doc.text(room.name, x + w / 2, y + h / 2, { align: "center", maxWidth: w - 2 });
    }
    const north = oy - 4;
    doc.setFontSize(9);
    doc.text("N", ox + (plan.width * scale) / 2, north, { align: "center" });
    let y = oy + plan.length * scale + 10;
    doc.setFontSize(9);
    for (const room of plan.rooms) {
      if (y > height - 20) break;
      doc.text(`${room.name}: ${room.zone}, ${room.score}/100, ${room.fit}`, 14, y);
      y += 4.5;
    }
    doc.setFont("times", "italic");
    doc.setFontSize(8);
    doc.text(plan.notes[0] ?? "Conceptual only.", 14, height - 12);
  });
  return doc.output("blob");
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
