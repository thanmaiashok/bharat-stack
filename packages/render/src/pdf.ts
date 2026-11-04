import type { Invoice } from "@bharat-stack/core";
import { PDFDocument, type PDFFont, rgb, StandardFonts } from "pdf-lib";
import { type LayoutOptions, type LayoutPage, layoutInvoice, PAGE } from "./layout.js";
import { qrMatrix } from "./qr.js";

export interface PdfOptions extends Omit<LayoutOptions, "sanitize"> {}

const REPLACEMENTS: Record<string, string> = {
  "₹": "Rs.",
  "–": "-",
  "—": "-",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  " ": " ",
};

function sanitizer(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return (s: string) =>
    Array.from(s)
      .map((ch) => REPLACEMENTS[ch] ?? (supported.has(ch.codePointAt(0) as number) ? ch : "?"))
      .join("");
}

async function setup(inv: Invoice) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  // Fixed metadata so the same invoice always gives the same bytes.
  const when = new Date(`${inv.date}T00:00:00Z`);
  doc.setTitle(`Tax Invoice ${inv.invoiceNo}`);
  doc.setAuthor(inv.seller.name);
  doc.setSubject(`GST tax invoice ${inv.invoiceNo} dated ${inv.dateIndian}`);
  doc.setProducer("bharat-stack");
  doc.setCreator("bharat-stack");
  doc.setCreationDate(when);
  doc.setModificationDate(when);
  const measure = (t: string, size: number, b: boolean) =>
    (b ? bold : regular).widthOfTextAtSize(t, size);
  return { doc, regular, bold, measure, sanitize: sanitizer(regular) };
}

/** Lay out an invoice without drawing it (used for previews and golden tests). */
export async function invoiceLayout(inv: Invoice, options: PdfOptions = {}): Promise<LayoutPage[]> {
  const { measure, sanitize } = await setup(inv);
  return layoutInvoice(inv, measure, { ...options, sanitize });
}

/** Render a computed invoice (from createInvoice) to an A4 PDF. */
export async function renderInvoicePdf(
  inv: Invoice,
  options: PdfOptions = {},
): Promise<Uint8Array> {
  const { doc, regular, bold, measure, sanitize } = await setup(inv);
  const pages = layoutInvoice(inv, measure, { ...options, sanitize });
  const H = PAGE.height;
  for (const lp of pages) {
    const page = doc.addPage([PAGE.width, PAGE.height]);
    for (const op of lp.ops) {
      switch (op.kind) {
        case "text": {
          const font = op.bold ? bold : regular;
          let t = op.text;
          if (op.width !== undefined) {
            while (t.length > 1 && font.widthOfTextAtSize(t, op.size) > op.width)
              t = t.slice(0, -1);
          }
          const w = font.widthOfTextAtSize(t, op.size);
          const x = op.align === "right" ? op.x - w : op.align === "center" ? op.x - w / 2 : op.x;
          const c = op.color ?? 0;
          page.drawText(t, { x, y: H - op.y, size: op.size, font, color: rgb(c, c, c) });
          break;
        }
        case "line":
          page.drawLine({
            start: { x: op.x1, y: H - op.y1 },
            end: { x: op.x2, y: H - op.y2 },
            thickness: op.width,
            color: rgb(0.3, 0.3, 0.3),
          });
          break;
        case "rect":
          page.drawRectangle({
            x: op.x,
            y: H - op.y - op.h,
            width: op.w,
            height: op.h,
            ...(op.fill !== undefined ? { color: rgb(op.fill, op.fill, op.fill) } : {}),
            ...(op.stroke ? { borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 0.6 } : {}),
          });
          break;
        case "qr": {
          const m = qrMatrix(op.text);
          const cell = op.size / (m.length + 2);
          for (const [r, row] of m.entries()) {
            for (const [c, dark] of row.entries()) {
              if (!dark) continue;
              page.drawRectangle({
                x: op.x + (c + 1) * cell,
                y: H - (op.y + (r + 2) * cell),
                width: cell + 0.01,
                height: cell + 0.01,
                color: rgb(0, 0, 0),
              });
            }
          }
          break;
        }
      }
    }
  }
  return doc.save({ useObjectStreams: false });
}
