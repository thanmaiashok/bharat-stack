import { formatPaise, type Invoice, toPaise } from "@bharat-stack/core";

/** A4 in PDF points. */
export const PAGE = { width: 595.28, height: 841.89, margin: 36 };

export type Align = "left" | "right" | "center";

export type Op =
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      size: number;
      bold: boolean;
      align: Align;
      width?: number;
      color?: number;
    }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; width: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill?: number; stroke?: boolean }
  | { kind: "qr"; x: number; y: number; size: number; text: string };

/** One page of drawing operations; y is measured from the top of the page. */
export interface LayoutPage {
  ops: Op[];
}

export type Measure = (text: string, size: number, bold: boolean) => number;

export interface LayoutOptions {
  /** Shown under the title. Default "Original for Recipient". */
  copyLabel?: string;
  /** Footer line. Default "This is a computer-generated invoice." */
  footer?: string;
  /** Characters the font can draw; anything else is replaced. */
  sanitize?: (s: string) => string;
}

const money = (n: number) => formatPaise(toPaise(n), { symbol: false });
const pct = (n: number) => `${n}%`;
const qtyText = (n: number) => String(n);

interface Column {
  title: string;
  width: number;
  align: Align;
  value: (row: Invoice["items"][number]) => string;
}

/** Lay out an invoice as pages of drawing operations (pure: no PDF library involved). */
export function layoutInvoice(
  inv: Invoice,
  measure: Measure,
  options: LayoutOptions = {},
): LayoutPage[] {
  const clean = options.sanitize ?? ((s: string) => s);
  const { width: W, height: H, margin: M } = PAGE;
  const CW = W - 2 * M;
  const pages: LayoutPage[] = [];
  let ops: Op[] = [];
  let y = M;
  const newPage = () => {
    ops = [];
    pages.push({ ops });
    y = M;
  };
  newPage();

  const text = (
    x: number,
    yy: number,
    s: string,
    size = 8,
    bold = false,
    align: Align = "left",
    width?: number,
  ) => {
    const op: Op = { kind: "text", x, y: yy, text: clean(s), size, bold, align };
    if (width !== undefined) op.width = width;
    ops.push(op);
  };
  const hline = (yy: number, x1 = M, x2 = W - M, w = 0.5) =>
    ops.push({ kind: "line", x1, y1: yy, x2, y2: yy, width: w });
  const vline = (x: number, y1: number, y2: number) =>
    ops.push({ kind: "line", x1: x, y1, x2: x, y2, width: 0.5 });
  const box = (x: number, yy: number, w: number, h: number) =>
    ops.push({ kind: "rect", x, y: yy, w, h, stroke: true });

  /** Split text into lines that fit width. */
  const wrap = (s: string, width: number, size: number, bold = false): string[] => {
    const words = clean(s).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (measure(next, size, bold) <= width) {
        cur = next;
        continue;
      }
      if (cur) lines.push(cur);
      // Hard-break a single word that is too long.
      let word = w;
      while (measure(word, size, bold) > width && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && measure(word.slice(0, cut), size, bold) > width) cut--;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      cur = word;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  };

  // ---- Title
  text(W / 2, y + 14, "TAX INVOICE", 15, true, "center");
  text(W - M, y + 10, options.copyLabel ?? "Original for Recipient", 7, false, "right");
  y += 24;

  // ---- Seller + invoice meta
  const half = CW / 2;
  const sellerLines: [string, number, boolean][] = [[inv.seller.name, 11, true]];
  for (const l of inv.seller.address) sellerLines.push([l, 8, false]);
  const cityLine = [inv.seller.city, inv.seller.pincode].filter(Boolean).join(" - ");
  if (cityLine) sellerLines.push([cityLine, 8, false]);
  if (inv.seller.gstin) sellerLines.push([`GSTIN: ${inv.seller.gstin}`, 8, true]);
  if (inv.seller.stateName)
    sellerLines.push([`State: ${inv.seller.stateName} (${inv.seller.stateCode})`, 8, false]);
  const contact = [inv.seller.phone, inv.seller.email].filter(Boolean).join("  |  ");
  if (contact) sellerLines.push([contact, 8, false]);

  const meta: [string, string][] = [
    ["Invoice No.", inv.invoiceNo],
    ["Invoice Date", inv.dateIndian],
    ["Place of Supply", `${inv.placeOfSupply.name} (${inv.placeOfSupply.code})`],
    ["Reverse Charge", inv.reverseCharge ? "Yes" : "No"],
    ["Financial Year", inv.financialYear],
  ];

  const top = y;
  let ly = y + 6;
  for (const [s, size, bold] of sellerLines) {
    for (const l of wrap(s, half - 12, size, bold)) {
      ly += size + 3;
      text(M + 6, ly, l, size, bold);
    }
  }
  let ry = y + 6;
  for (const [k, v] of meta) {
    ry += 12;
    text(M + half + 6, ry, k, 8, false);
    text(M + half + 82, ry, `: ${v}`, 8, true);
  }
  y = Math.max(ly, ry) + 8;
  box(M, top, CW, y - top);
  vline(M + half, top, y);

  // ---- Buyer
  const btop = y;
  ly = y + 6;
  ly += 10;
  text(M + 6, ly, "Bill To", 7, true);
  const buyerLines: [string, number, boolean][] = [[inv.buyer.name, 10, true]];
  for (const l of inv.buyer.address) buyerLines.push([l, 8, false]);
  const bCity = [inv.buyer.city, inv.buyer.pincode].filter(Boolean).join(" - ");
  if (bCity) buyerLines.push([bCity, 8, false]);
  buyerLines.push([`GSTIN: ${inv.buyer.gstin ?? "Unregistered"}`, 8, true]);
  if (inv.buyer.stateName)
    buyerLines.push([`State: ${inv.buyer.stateName} (${inv.buyer.stateCode})`, 8, false]);
  if (inv.buyer.sez) buyerLines.push(["SEZ unit", 8, true]);
  for (const [s, size, bold] of buyerLines) {
    for (const l of wrap(s, CW - 12, size, bold)) {
      ly += size + 3;
      text(M + 6, ly, l, size, bold);
    }
  }
  y = ly + 8;
  box(M, btop, CW, y - btop);
  y += 10;

  // ---- Items table
  const intra = inv.supplyType === "INTRA_STATE";
  const sTax = inv.stateTaxLabel;
  const cols: Column[] = intra
    ? [
        { title: "#", width: 18, align: "center", value: (r) => String(r.sl) },
        { title: "Description", width: 103, align: "left", value: (r) => r.description },
        { title: "HSN/SAC", width: 44, align: "center", value: (r) => r.hsn ?? "" },
        {
          title: "Qty",
          width: 40,
          align: "right",
          value: (r) => `${qtyText(r.quantity)} ${r.unit}`,
        },
        { title: "Rate", width: 50, align: "right", value: (r) => money(r.rate) },
        {
          title: "Disc.",
          width: 34,
          align: "right",
          value: (r) => (r.discount ? money(r.discount) : "-"),
        },
        { title: "Taxable", width: 60, align: "right", value: (r) => money(r.taxable) },
        { title: "GST %", width: 30, align: "right", value: (r) => pct(r.gstRate) },
        { title: "CGST", width: 42, align: "right", value: (r) => money(r.cgst) },
        { title: sTax, width: 42, align: "right", value: (r) => money(r.sgst) },
        { title: "Amount", width: 60, align: "right", value: (r) => money(r.total) },
      ]
    : [
        { title: "#", width: 18, align: "center", value: (r) => String(r.sl) },
        { title: "Description", width: 129, align: "left", value: (r) => r.description },
        { title: "HSN/SAC", width: 46, align: "center", value: (r) => r.hsn ?? "" },
        {
          title: "Qty",
          width: 44,
          align: "right",
          value: (r) => `${qtyText(r.quantity)} ${r.unit}`,
        },
        { title: "Rate", width: 52, align: "right", value: (r) => money(r.rate) },
        {
          title: "Disc.",
          width: 40,
          align: "right",
          value: (r) => (r.discount ? money(r.discount) : "-"),
        },
        { title: "Taxable", width: 58, align: "right", value: (r) => money(r.taxable) },
        { title: "IGST %", width: 28, align: "right", value: (r) => pct(r.igstRate) },
        { title: "IGST", width: 50, align: "right", value: (r) => money(r.igst) },
        { title: "Amount", width: 58, align: "right", value: (r) => money(r.total) },
      ];
  const FS = 7.5;
  const bottomLimit = H - M - 24;

  const tableHeader = () => {
    ops.push({ kind: "rect", x: M, y, w: CW, h: 16, fill: 0.9 });
    let x = M;
    for (const c of cols) {
      const tx =
        c.align === "left" ? x + 3 : c.align === "right" ? x + c.width - 3 : x + c.width / 2;
      text(tx, y + 11, c.title, FS, true, c.align);
      x += c.width;
    }
    hline(y);
    y += 16;
    hline(y);
  };
  tableHeader();

  for (const row of inv.items) {
    const descLines = wrap(row.description, (cols[1] as Column).width - 6, FS);
    const h = descLines.length * (FS + 2.5) + 6;
    if (y + h > bottomLimit) {
      newPage();
      text(M, y + 8, `${inv.invoiceNo} (continued)`, 8, true);
      y += 16;
      tableHeader();
    }
    let x = M;
    for (const c of cols) {
      if (c.title === "Description") {
        descLines.forEach((l, i) => {
          text(x + 3, y + 10 + i * (FS + 2.5), l, FS);
        });
      } else {
        const tx =
          c.align === "left" ? x + 3 : c.align === "right" ? x + c.width - 3 : x + c.width / 2;
        text(tx, y + 10, c.value(row), FS, false, c.align);
      }
      x += c.width;
    }
    y += h;
    hline(y, M, W - M, 0.25);
  }
  hline(y);

  // ---- Totals (right) + amount in words (left)
  const totals: [string, string, boolean][] = [["Taxable Value", money(inv.totals.taxable), false]];
  if (inv.totals.discount) {
    totals.unshift(
      ["Gross Amount", money(inv.totals.gross), false],
      ["Discount", `-${money(inv.totals.discount)}`, false],
    );
  }
  if (intra) {
    totals.push(["CGST", money(inv.totals.cgst), false], [sTax, money(inv.totals.sgst), false]);
  } else {
    totals.push(["IGST", money(inv.totals.igst), false]);
  }
  totals.push(["Invoice Value", money(inv.totals.invoiceValue), false]);
  if (inv.reverseCharge)
    totals.push(["GST payable by recipient (RCM)", `-${money(inv.totals.totalTax)}`, false]);
  if (inv.totals.roundOff) totals.push(["Round Off", money(inv.totals.roundOff), false]);
  totals.push(["Amount Payable (Rs.)", money(inv.totals.amountPayable), true]);

  const wordsLines = wrap(inv.amountInWords, CW * 0.55 - 12, 8, true);
  const blockH = Math.max(totals.length * 13, 14 + wordsLines.length * 11) + 10;
  if (y + blockH > bottomLimit) newPage();
  const tTop = y;
  const tx = M + CW * 0.55;
  let tyy = y + 4;
  for (const [k, v, bold] of totals) {
    tyy += 13;
    if (bold) ops.push({ kind: "rect", x: tx, y: tyy - 10, w: W - M - tx, h: 14, fill: 0.9 });
    text(tx + 6, tyy, k, 8, bold);
    text(W - M - 6, tyy, v, bold ? 9 : 8, bold, "right");
  }
  let wy = y + 4;
  wy += 12;
  text(M + 6, wy, "Amount in words", 7, false);
  for (const l of wordsLines) {
    wy += 11;
    text(M + 6, wy, l, 8, true);
  }
  y = Math.max(tyy, wy) + 8;
  box(M, tTop, CW, y - tTop);
  vline(tx, tTop, y);
  y += 10;

  // ---- HSN summary
  const hcols: [string, number, Align][] = intra
    ? [
        ["HSN/SAC", 90, "left"],
        ["Taxable Value", 100, "right"],
        ["Rate", 50, "right"],
        ["CGST", 90, "right"],
        [sTax, 90, "right"],
        ["Total Tax", 103, "right"],
      ]
    : [
        ["HSN/SAC", 110, "left"],
        ["Taxable Value", 120, "right"],
        ["Rate", 60, "right"],
        ["IGST", 110, "right"],
        ["Total Tax", 123, "right"],
      ];
  const hsnH = 14 + 12 * (inv.hsnSummary.length + 1) + 4;
  if (y + hsnH > bottomLimit) newPage();
  text(M, y + 8, "HSN/SAC Summary", 8, true);
  y += 12;
  ops.push({ kind: "rect", x: M, y, w: CW, h: 13, fill: 0.9 });
  const cell = (cells: string[], bold: boolean) => {
    let x = M;
    hcols.forEach(([, w, align], i) => {
      text(align === "left" ? x + 4 : x + w - 4, y + 9.5, cells[i] ?? "", 7.5, bold, align);
      x += w;
    });
    y += 12;
  };
  cell(
    hcols.map((c) => c[0]),
    true,
  );
  for (const r of inv.hsnSummary) {
    cell(
      intra
        ? [r.hsn, money(r.taxable), pct(r.gstRate), money(r.cgst), money(r.sgst), money(r.totalTax)]
        : [r.hsn, money(r.taxable), pct(r.gstRate), money(r.igst), money(r.totalTax)],
      false,
    );
  }
  cell(
    intra
      ? [
          "Total",
          money(inv.totals.taxable),
          "",
          money(inv.totals.cgst),
          money(inv.totals.sgst),
          money(inv.totals.totalTax),
        ]
      : [
          "Total",
          money(inv.totals.taxable),
          "",
          money(inv.totals.igst),
          money(inv.totals.totalTax),
        ],
    true,
  );
  hline(y);
  y += 12;

  // ---- Payment (UPI + bank), notes, signature
  const QR = 92;
  const extras: string[] = [];
  const b = inv.bank;
  if (b) {
    if (b.name) extras.push(`Bank: ${b.name}`);
    if (b.accountName) extras.push(`A/c Name: ${b.accountName}`);
    if (b.accountNumber) extras.push(`A/c No.: ${b.accountNumber}`);
    if (b.ifsc) extras.push(`IFSC: ${b.ifsc}`);
    if (b.branch) extras.push(`Branch: ${b.branch}`);
  }
  const noteLines = [
    ...(inv.notes ? wrap(`Notes: ${inv.notes}`, CW - QR - 190, 7.5) : []),
    ...(inv.terms ? wrap(`Terms: ${inv.terms}`, CW - QR - 190, 7.5) : []),
  ];
  const payH = Math.max(inv.upi ? QR + 24 : 0, 14 + (extras.length + noteLines.length) * 10, 70);
  if (y + payH > bottomLimit) newPage();
  const pTop = y;
  let px = M;
  if (inv.upi) {
    ops.push({ kind: "qr", x: M + 4, y: y + 4, size: QR, text: inv.upi.uri });
    text(
      M + 4 + QR / 2,
      y + QR + 12,
      `Scan to pay Rs. ${money(Number(inv.upi.amount))}`,
      7,
      true,
      "center",
    );
    text(M + 4 + QR / 2, y + QR + 21, `UPI: ${inv.upi.vpa}`, 6.5, false, "center");
    px = M + QR + 14;
  }
  let ey = y + 2;
  if (extras.length) {
    ey += 10;
    text(px, ey, "Payment details", 7.5, true);
    for (const e of extras) {
      ey += 10;
      text(px, ey, e, 7.5);
    }
  }
  for (const n of noteLines) {
    ey += 10;
    text(px, ey, n, 7.5);
  }

  const sx = W - M - 170;
  text(W - M - 4, y + 12, `For ${inv.seller.name}`, 8, true, "right", 166);
  hline(y + payH - 16, sx + 20, W - M - 4, 0.5);
  text(W - M - 4, y + payH - 6, "Authorised Signatory", 7.5, false, "right");
  y = pTop + payH;

  // ---- Footer on every page
  const footer = options.footer ?? "This is a computer-generated invoice.";
  pages.forEach((p, i) => {
    p.ops.push({
      kind: "text",
      x: M,
      y: H - M + 10,
      text: clean(footer),
      size: 6.5,
      bold: false,
      align: "left",
      color: 0.4,
    });
    p.ops.push({
      kind: "text",
      x: W - M,
      y: H - M + 10,
      text: `Page ${i + 1} of ${pages.length}`,
      size: 6.5,
      bold: false,
      align: "right",
      color: 0.4,
    });
  });
  return pages;
}

/** Plain text of a layout, page by page, for golden tests and quick previews. */
export function layoutText(pages: LayoutPage[]): string[][] {
  return pages.map((p) =>
    p.ops.filter((o) => o.kind === "text").map((o) => (o as { text: string }).text),
  );
}
