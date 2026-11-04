import { formatPaise, type Invoice, toPaise } from "@bharat-stack/core";
import { qrSvg } from "./qr.js";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const money = (n: number) => formatPaise(toPaise(n), { symbol: false });

/** Self-contained HTML preview of a computed invoice (no external assets). */
export function renderInvoiceHtml(inv: Invoice): string {
  const intra = inv.supplyType === "INTRA_STATE";
  const s = inv.stateTaxLabel;
  const party = (p: Invoice["seller"]) =>
    [
      `<strong>${esc(p.name)}</strong>`,
      ...p.address.map(esc),
      esc([p.city, p.pincode].filter(Boolean).join(" - ")),
      `GSTIN: <strong>${esc(p.gstin ?? "Unregistered")}</strong>`,
      p.stateName ? `State: ${esc(p.stateName)} (${esc(p.stateCode ?? "")})` : "",
    ]
      .filter(Boolean)
      .join("<br>");
  const taxHead = intra ? `<th>CGST</th><th>${s}</th>` : "<th>IGST %</th><th>IGST</th>";
  const rows = inv.items
    .map(
      (r) =>
        `<tr><td>${r.sl}</td><td class="l">${esc(r.description)}</td><td>${esc(r.hsn ?? "")}</td><td>${r.quantity} ${esc(r.unit)}</td><td>${money(r.rate)}</td><td>${r.discount ? money(r.discount) : "-"}</td><td>${money(r.taxable)}</td>${
          intra
            ? `<td>${r.gstRate}%</td><td>${money(r.cgst)}</td><td>${money(r.sgst)}</td>`
            : `<td>${r.igstRate}%</td><td>${money(r.igst)}</td>`
        }<td>${money(r.total)}</td></tr>`,
    )
    .join("");
  const hsn = inv.hsnSummary
    .map(
      (r) =>
        `<tr><td class="l">${esc(r.hsn)}</td><td>${money(r.taxable)}</td><td>${r.gstRate}%</td>${
          intra ? `<td>${money(r.cgst)}</td><td>${money(r.sgst)}</td>` : `<td>${money(r.igst)}</td>`
        }<td>${money(r.totalTax)}</td></tr>`,
    )
    .join("");
  const taxTotals = intra
    ? `<tr><td>CGST</td><td>${money(inv.totals.cgst)}</td></tr><tr><td>${s}</td><td>${money(inv.totals.sgst)}</td></tr>`
    : `<tr><td>IGST</td><td>${money(inv.totals.igst)}</td></tr>`;
  const upi = inv.upi
    ? `<div class="upi">${qrSvg(inv.upi.uri, { size: 120, title: "UPI payment QR code" })}<div>Scan to pay <strong>${esc(formatPaise(toPaise(inv.upi.amount)))}</strong><br>UPI: ${esc(inv.upi.vpa)}</div></div>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tax Invoice ${esc(inv.invoiceNo)}</title>
<style>
body{font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;background:#fff;margin:0;padding:16px}
.inv{max-width:820px;margin:auto;border:1px solid #999;padding:16px}
h1{text-align:center;font-size:20px;margin:0 0 12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;border:1px solid #ccc;padding:10px;margin-bottom:10px}
table{width:100%;border-collapse:collapse;margin:8px 0}
th,td{border:1px solid #ccc;padding:4px 6px;text-align:right;font-variant-numeric:tabular-nums}
th{background:#eee}td.l,th.l{text-align:left}
.totals{display:grid;grid-template-columns:1.2fr 1fr;gap:12px}
.totals table td:first-child{text-align:left}.totals tr:last-child{font-weight:700;background:#eee}
.upi{display:flex;gap:12px;align-items:center}.foot{color:#666;font-size:11px;margin-top:12px}
@media (max-width:600px){.grid,.totals{grid-template-columns:1fr}.scroll{overflow-x:auto}}
</style></head><body><div class="inv">
<h1>TAX INVOICE</h1>
<div class="grid"><div>${party(inv.seller)}</div><div>
Invoice No.: <strong>${esc(inv.invoiceNo)}</strong><br>Date: <strong>${esc(inv.dateIndian)}</strong><br>
Place of Supply: <strong>${esc(inv.placeOfSupply.name)} (${esc(inv.placeOfSupply.code)})</strong><br>
Reverse Charge: <strong>${inv.reverseCharge ? "Yes" : "No"}</strong></div></div>
<div class="grid"><div><small>Bill To</small><br>${party(inv.buyer)}</div><div></div></div>
<div class="scroll"><table><thead><tr><th>#</th><th class="l">Description</th><th>HSN/SAC</th><th>Qty</th><th>Rate</th><th>Disc.</th><th>Taxable</th>${intra ? "<th>GST %</th>" : ""}${taxHead}<th>Amount</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="totals"><div><small>Amount in words</small><br><strong>${esc(inv.amountInWords)}</strong>${upi}</div>
<table><tr><td>Taxable Value</td><td>${money(inv.totals.taxable)}</td></tr>${taxTotals}
${inv.reverseCharge ? `<tr><td>GST payable by recipient (RCM)</td><td>-${money(inv.totals.totalTax)}</td></tr>` : ""}
${inv.totals.roundOff ? `<tr><td>Round Off</td><td>${money(inv.totals.roundOff)}</td></tr>` : ""}
<tr><td>Amount Payable</td><td>${esc(inv.formatted.amountPayable)}</td></tr></table></div>
<h3>HSN/SAC Summary</h3>
<div class="scroll"><table><thead><tr><th class="l">HSN/SAC</th><th>Taxable</th><th>Rate</th>${intra ? `<th>CGST</th><th>${s}</th>` : "<th>IGST</th>"}<th>Total Tax</th></tr></thead><tbody>${hsn}</tbody></table></div>
${inv.notes ? `<p>Notes: ${esc(inv.notes)}</p>` : ""}${inv.terms ? `<p>Terms: ${esc(inv.terms)}</p>` : ""}
<p style="text-align:right">For <strong>${esc(inv.seller.name)}</strong><br><br><br>Authorised Signatory</p>
<p class="foot">This is a computer-generated invoice. ${esc(inv.disclaimer)}</p>
</div></body></html>
`;
}
