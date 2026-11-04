import { buildUpiUri, type UpiPaymentInput } from "@bharat-stack/core";
import QRCode from "qrcode";

export interface QrOptions {
  /** Error correction: L, M (default), Q, H. */
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  /** Quiet zone in modules. Default 4. */
  margin?: number;
}

/** QR modules as rows of booleans (true = dark). */
export function qrMatrix(text: string, options: QrOptions = {}): boolean[][] {
  const qr = QRCode.create(text, { errorCorrectionLevel: options.errorCorrectionLevel ?? "M" });
  const { size, data } = qr.modules;
  const rows: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) row.push(data[r * size + c] === 1);
    rows.push(row);
  }
  return rows;
}

/** Deterministic SVG for any text (one path, crisp at any size). */
export function qrSvg(
  text: string,
  options: QrOptions & { size?: number; title?: string } = {},
): string {
  const m = qrMatrix(text, options);
  const margin = options.margin ?? 4;
  const n = m.length + margin * 2;
  const px = options.size ?? 256;
  let d = "";
  m.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) d += `M${x + margin} ${y + margin}h1v1h-1z`;
    });
  });
  const title = (options.title ?? "QR code").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges"><title>${title}</title><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** PNG bytes for any text. */
export async function qrPng(
  text: string,
  options: QrOptions & { width?: number } = {},
): Promise<Uint8Array> {
  const buf = await QRCode.toBuffer(text, {
    type: "png",
    errorCorrectionLevel: options.errorCorrectionLevel ?? "M",
    margin: options.margin ?? 4,
    width: options.width ?? 512,
  });
  return new Uint8Array(buf);
}

/** Build a UPI link and its QR code in one go. Static QR only: it cannot confirm payment. */
export async function upiQr(input: UpiPaymentInput, options: QrOptions = {}) {
  const payment = buildUpiUri(input);
  return {
    ...payment,
    svg: qrSvg(payment.uri, { ...options, title: `UPI payment QR for ${payment.payeeName}` }),
    png: await qrPng(payment.uri, options),
  };
}
