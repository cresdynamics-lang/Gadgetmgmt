import { jsPDF } from "jspdf";

import { encodeCode128 } from "@/lib/code128";
import { phoneLabelTitle, type ScannedDevice } from "@/lib/device-scan";

/** Back-of-phone note, unbranded like a wholesale sticker. 90 × 50 mm landscape matches a standard 3.5 × 2 in label roll. */
export const PHONE_LABEL = { widthMm: 90, heightMm: 50 } as const;

export type PhoneLabelData = ScannedDevice & {
  receivedAt?: string;
  workingNote?: string;
};

function escapeHtml(value: string) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}

function labelDate(device: PhoneLabelData) {
  const source = device.receivedAt ? new Date(device.receivedAt) : new Date();
  return source.toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
}

function workingNote(device: PhoneLabelData) {
  if (device.workingNote) return device.workingNote;
  const battery = Number(device.batteryHealth);
  if (device.batteryHealth && battery >= 95) return "100% Working Phone";
  if (device.batteryHealth) return `Battery ${device.batteryHealth}% · checked`;
  return "Checked and in stock";
}

function barcodeSvg(value: string, widthMm = 72, heightMm = 7.5) {
  const modules = encodeCode128(value);
  const total = modules.reduce((sum, module) => sum + module.width, 0) || 1;
  let x = 0;
  const rects = modules.map((module) => {
    const rect = module.black ? `<rect x="${x}" y="0" width="${module.width}" height="10" fill="#111111"/>` : "";
    x += module.width;
    return rect;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 10" width="${widthMm}mm" height="${heightMm}mm" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`;
}

export function phoneLabelInnerHtml(device: PhoneLabelData) {
  const title = phoneLabelTitle(device) || device.name || "Apple device";
  const barcodeValue = device.imei || device.serial;
  const battery = (device.batteryHealth || "").replace(/[^\d]/g, "").slice(0, 3);
  return `<article class="gh-phone-label" aria-label="Phone label">
    <header class="gh-phone-label__brand">
      <h1>${escapeHtml(title)}</h1>
      <strong>${escapeHtml(device.modelNumber || "")}</strong>
    </header>
    <div class="gh-phone-label__body">
      <dl>
        <div><dt>Sr#</dt><dd>${escapeHtml(device.serial || "—")}</dd></div>
        <div><dt>FMI</dt><dd>${escapeHtml(device.fmi || "—")}</dd></div>
        <div><dt>SIM</dt><dd>${escapeHtml(device.sim || "—")}</dd></div>
        <div><dt>Color</dt><dd>${escapeHtml(device.colour || "—")}</dd></div>
        <div><dt>Version</dt><dd>${escapeHtml(device.version || "—")}</dd></div>
        <div><dt>${escapeHtml(labelDate(device))}</dt><dd>1 PC</dd></div>
      </dl>
      <div class="gh-phone-label__battery">
        <p>Battery health</p>
        <strong>${battery ? `${escapeHtml(battery)}%` : "—"}</strong>
      </div>
    </div>
    <p class="gh-phone-label__note">${escapeHtml(workingNote(device))}</p>
    ${barcodeValue ? `<div class="gh-phone-label__barcode">${barcodeSvg(barcodeValue)}</div><p class="gh-phone-label__imei">${escapeHtml(barcodeValue)}</p>` : ""}
  </article>`;
}

export const phoneLabelCss = `
  .gh-phone-label {
    box-sizing: border-box;
    width: ${PHONE_LABEL.widthMm}mm;
    height: ${PHONE_LABEL.heightMm}mm;
    padding: 2.2mm 2.8mm 1.8mm;
    overflow: hidden;
    color: #111111;
    background: #ffffff;
    border: 0.25mm solid #b4b4b4;
    font-family: Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .gh-phone-label * { box-sizing: border-box; margin: 0; padding: 0; }
  .gh-phone-label__brand {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 2mm;
    margin-top: 0.6mm;
  }
  .gh-phone-label__brand strong { flex-shrink: 0; font-size: 8.4pt; }
  .gh-phone-label h1 {
    font-size: 8.6pt;
    font-weight: 700;
    line-height: 1.15;
  }
  .gh-phone-label__body {
    display: grid;
    grid-template-columns: 1fr 24mm;
    gap: 1.4mm;
    margin-top: 1.4mm;
    align-items: stretch;
  }
  .gh-phone-label dl { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4mm 2mm; font-size: 6.3pt; }
  .gh-phone-label dl div { display: flex; justify-content: space-between; gap: 1.5mm; white-space: nowrap; }
  .gh-phone-label dt { color: #555555; font-weight: 600; }
  .gh-phone-label dd { font-weight: 700; text-align: right; }
  .gh-phone-label__battery {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 0.35mm solid #111111;
    padding: 0.8mm;
    text-align: center;
  }
  .gh-phone-label__battery p {
    font-size: 4.8pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .gh-phone-label__battery strong {
    margin-top: 0.4mm;
    font-size: 13pt;
    font-weight: 800;
    line-height: 1;
  }
  .gh-phone-label__note {
    margin-top: 1mm;
    font-size: 7pt;
    font-weight: 700;
    text-align: center;
  }
  .gh-phone-label__barcode { display: flex; justify-content: center; margin-top: 0.8mm; }
  .gh-phone-label__barcode svg { display: block; }
  .gh-phone-label__imei {
    margin-top: 0.4mm;
    font-size: 7.4pt;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-align: center;
  }
`;

export function phoneLabelPrintDocument(device: PhoneLabelData) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Phone label</title>
  <style>
    @page { size: ${PHONE_LABEL.widthMm}mm ${PHONE_LABEL.heightMm}mm; margin: 0; }
    html, body { width: ${PHONE_LABEL.widthMm}mm; height: ${PHONE_LABEL.heightMm}mm; margin: 0; padding: 0; background: #fff; }
    ${phoneLabelCss}
    .gh-phone-label { border: 0; }
  </style>
</head>
<body>
  ${phoneLabelInnerHtml(device)}
  <script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 200); });</script>
</body>
</html>`;
}

function line(doc: jsPDF, text: string, x: number, y: number, opts: { bold?: boolean; size?: number; align?: "left" | "center" | "right"; max?: number } = {}) {
  doc.setFont("helvetica", opts.bold ? "bold" : "normal");
  doc.setFontSize(opts.size ?? 7.5);
  const value = opts.max ? doc.splitTextToSize(text, opts.max) : text;
  doc.text(value, x, y, { align: opts.align });
}

export function createPhoneLabelPdf(device: PhoneLabelData) {
  const width = PHONE_LABEL.widthMm;
  const height = PHONE_LABEL.heightMm;
  const doc = new jsPDF({ unit: "mm", format: [width, height], orientation: "landscape" });
  const title = phoneLabelTitle(device) || device.name || "Apple device";
  const barcodeValue = device.imei || device.serial;
  const battery = (device.batteryHealth || "").replace(/[^\d]/g, "").slice(0, 3);

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, width, height, "F");
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.rect(1.4, 1.4, width - 2.8, height - 2.8);

  doc.setTextColor(17, 17, 17);
  line(doc, title, 4, 8.4, { bold: true, size: 9, max: width - 24 });
  if (device.modelNumber) line(doc, device.modelNumber, width - 3.4, 8.4, { bold: true, size: 9, align: "right" });

  const left = 4;
  line(doc, `Sr# ${device.serial || "—"}`, left, 17.2, { size: 7 });
  line(doc, `FMI ${device.fmi || "—"}`, left, 21.2, { size: 7 });
  line(doc, `SIM ${device.sim || "—"}`, 32, 17.2, { size: 7 });
  line(doc, `Color ${device.colour || "—"}`, 32, 21.2, { size: 7 });
  line(doc, `Version ${device.version || "—"}`, left, 25.2, { size: 7 });
  line(doc, `${labelDate(device)}   1 PC`, 32, 25.2, { size: 7 });

  doc.setLineWidth(0.35);
  doc.setDrawColor(17, 17, 17);
  doc.rect(64.5, 15.4, 22, 11.6);
  line(doc, "BATTERY HEALTH", 75.5, 18.4, { bold: true, size: 5, align: "center" });
  line(doc, battery ? `${battery}%` : "—", 75.5, 24.8, { bold: true, size: 14, align: "center" });

  line(doc, workingNote(device), width / 2, 30.4, { bold: true, size: 8, align: "center" });

  if (barcodeValue) {
    const modules = encodeCode128(barcodeValue);
    const total = modules.reduce((sum, module) => sum + module.width, 0) || 1;
    const barWidth = 72;
    const moduleW = barWidth / total;
    let x = (width - barWidth) / 2;
    doc.setFillColor(17, 17, 17);
    for (const bar of modules) {
      if (bar.black) doc.rect(x, 32.4, bar.width * moduleW, 7.6, "F");
      x += bar.width * moduleW;
    }
    line(doc, barcodeValue, width / 2, 43.8, { size: 8, align: "center", bold: true });
  }

  return doc;
}

export function downloadPhoneLabel(device: PhoneLabelData) {
  const name = (device.imei || device.serial || device.modelNumber || "phone").slice(-12);
  createPhoneLabelPdf(device).save(`gadgethub-phone-label-${name}.pdf`);
}

export function printPhoneLabel(device: PhoneLabelData) {
  const html = phoneLabelPrintDocument(device);
  const popup = window.open("", "gadgethub-phone-label", "width=480,height=320");
  if (!popup) {
    downloadPhoneLabel(device);
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
}

export function labelFromInventoryItem(item: {
  name: string;
  mpn?: string | null;
  imei?: string | null;
  colour?: string | null;
  configuration?: string | null;
  catalogNotes?: string | null;
  category?: string | null;
}): PhoneLabelData {
  const notes = item.catalogNotes || "";
  const field = (pattern: RegExp) => notes.match(pattern)?.[1]?.trim() || "";
  return {
    imei: item.imei || "",
    serial: field(/Sr#\s*([A-Z0-9]{8,12})/i),
    mpn: item.mpn || "",
    modelNumber: field(/\b(A\d{4})\b/),
    storage: item.configuration || "",
    colour: item.colour || "",
    batteryHealth: field(/Battery\s*(\d{1,3})/i),
    fmi: field(/FMI\s*(Off|On)/i),
    sim: field(/SIM\s*(Unlocked|Locked)/i),
    version: field(/Version\s*([\d.]+)/i),
    name: item.name,
    category: item.category || "iPhone",
    group: item.name.replace(/\s*\((?:Ex-UK|trade-in)\)\s*$/i, "").replace(/\s+\d+\s*(GB|TB).*/i, "").trim(),
  };
}
