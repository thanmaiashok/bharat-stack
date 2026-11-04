import { TAX_DISCLAIMER } from "../disclaimer.js";
import { BharatInputError, type Issue } from "../errors.js";
import { type DateInput, toISODate } from "../formats/date.js";
import type { Invoice } from "../invoice/types.js";
import { toPaise } from "../money.js";
import { gstRule } from "../rules.js";
import { toUQC } from "../uqc.js";
import { validateEWayBillSchema } from "./validate.js";

/** Version string the bulk tool expects. Last confirmed value; update in one place. */
export const EWAYBILL_BULK_VERSION = "1.0.0618";

export interface EWayBillTransport {
  mode: "road" | "rail" | "air" | "ship";
  /** Approximate distance in km (0–4000). */
  distanceKm: number;
  /** Required for road, e.g. "KA01AB1234". */
  vehicleNo?: string;
  /** "regular" (default) or "odc" (over-dimensional cargo). */
  vehicleType?: "regular" | "odc";
  /** Transporter GSTIN / TRANSIN. */
  transporterId?: string;
  transporterName?: string;
  /** LR / RR / airway bill number and date. */
  docNo?: string;
  docDate?: DateInput;
}

export interface EWayBillOptions {
  transport: EWayBillTransport;
  /** Outward (default, you are the seller) or inward. */
  direction?: "outward" | "inward";
  /** Override the bulk tool version string. */
  version?: string;
  /** Where goods actually leave from / go to, if different from the parties' states. */
  actualFromStateCode?: string;
  actualToStateCode?: string;
}

export interface EWayBillResult {
  ok: boolean;
  json: { version: string; billLists: Record<string, unknown>[] } | null;
  errors: (Issue & { path?: string })[];
  warnings: Issue[];
  info: string[];
  schemaVerification: "official" | "secondary";
  disclaimer: string;
}

const MODES = { road: 1, rail: 2, air: 3, ship: 4 } as const;
const ddmmyyyy = (iso: string) => iso.split("-").reverse().join("/");
const VEHICLE =
  /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$|^TM[A-Z0-9]{6}$|^(DF|TR|BP|NP)[A-Z0-9]{4,}$/;

/**
 * Build e-way bill bulk-upload JSON for one or more invoices (goods lines only).
 * This only creates the file for the e-way bill portal's bulk upload; it never submits it.
 */
export function invoicesToEWayBill(
  input: Invoice | Invoice[],
  options: EWayBillOptions,
): EWayBillResult {
  const invoices = Array.isArray(input) ? input : [input];
  if (invoices.length === 0) throw new BharatInputError("EWB_EMPTY", "Give at least one invoice.");
  const errors: (Issue & { path?: string })[] = [];
  const warnings: Issue[] = [];
  const info: string[] = [];
  const t = options.transport;
  const outward = (options.direction ?? "outward") === "outward";
  const maxKm = gstRule<number>("eway_bill_max_distance_km");
  const threshold = gstRule<number>("eway_bill_threshold_paise");

  if (!(t.mode in MODES))
    errors.push({ code: "EWB_MODE", message: `Transport mode must be road, rail, air or ship.` });
  if (!Number.isInteger(t.distanceKm) || t.distanceKm < 0 || t.distanceKm > maxKm) {
    errors.push({
      code: "EWB_DISTANCE",
      message: `Distance must be a whole number of km between 0 and ${maxKm}.`,
    });
  }
  const vehicleNo = (t.vehicleNo ?? "").replace(/[\s-]/g, "").toUpperCase();
  if (t.mode === "road" && !vehicleNo && !t.transporterId) {
    errors.push({
      code: "EWB_VEHICLE",
      message: "For road transport give a vehicle number (or a transporter ID for Part-A only).",
    });
  }
  if (vehicleNo && !VEHICLE.test(vehicleNo)) {
    warnings.push({
      code: "EWB_VEHICLE_FORMAT",
      message: `Vehicle number "${t.vehicleNo}" does not look like an Indian registration (e.g. KA01AB1234).`,
    });
  }

  const billLists = invoices.map((inv) => {
    const goods = inv.items.filter((i) => !i.isService);
    if (goods.length === 0) {
      errors.push({
        code: "EWB_NO_GOODS",
        message: `${inv.invoiceNo}: no goods lines (services do not need an e-way bill).`,
      });
    }
    if (goods.length < inv.items.length) {
      warnings.push({
        code: "EWB_SERVICES_SKIPPED",
        message: `${inv.invoiceNo}: service lines were left out of the e-way bill.`,
      });
    }
    if (toPaise(inv.totals.invoiceValue) <= threshold) {
      info.push(
        `${inv.invoiceNo}: consignment value is Rs ${inv.totals.invoiceValue}, at or below Rs ${threshold / 100}. An e-way bill is generally not mandatory (some states differ for intra-state movement).`,
      );
    }
    const missingHsn = goods.find((g) => !g.hsn);
    if (missingHsn)
      errors.push({
        code: "EWB_HSN",
        message: `${inv.invoiceNo} item ${missingHsn.sl}: HSN is required.`,
      });
    for (const p of [inv.seller, inv.buyer]) {
      if (
        !/^\d{6}$/.test(p.pincode ?? "") &&
        !(p === inv.buyer && inv.placeOfSupply.code === "96")
      ) {
        errors.push({
          code: "EWB_PINCODE",
          message: `${inv.invoiceNo}: 6-digit PIN code is required for ${p.name}.`,
        });
      }
    }

    const isExport = inv.placeOfSupply.code === "96";
    const from = inv.seller;
    const to = inv.buyer;
    const fromState = Number(from.stateCode ?? 0);
    const toState = isExport ? 99 : Number(to.stateCode ?? inv.placeOfSupply.code);
    const sum = (k: "taxable" | "cgst" | "sgst" | "igst") =>
      goods.reduce((s, g) => s + toPaise(g[k]), 0) / 100;
    const goodsTotal = goods.reduce((s, g) => s + toPaise(g.total), 0) / 100;
    const mainHsn = [...goods].sort((a, b) => b.taxable - a.taxable)[0]?.hsn;

    return {
      userGstin: (outward ? from.gstin : to.gstin) ?? "",
      supplyType: outward ? "O" : "I",
      subSupplyType: isExport ? 3 : 1,
      subSupplyDesc: "",
      docType: "INV",
      docNo: inv.invoiceNo,
      docDate: ddmmyyyy(inv.date),
      transType: 1,
      fromGstin: from.gstin ?? "URP",
      fromTrdName: from.name.slice(0, 100),
      fromAddr1: (from.address[0] ?? "").slice(0, 120),
      fromAddr2: from.address.slice(1).join(", ").slice(0, 120),
      fromPlace: (from.city ?? "").slice(0, 50),
      fromPincode: Number(from.pincode ?? 0),
      fromStateCode: fromState,
      actualFromStateCode: Number(options.actualFromStateCode ?? fromState),
      toGstin: isExport ? "URP" : (to.gstin ?? "URP"),
      toTrdName: to.name.slice(0, 100),
      toAddr1: (to.address[0] ?? "").slice(0, 120),
      toAddr2: to.address.slice(1).join(", ").slice(0, 120),
      toPlace: (to.city ?? "").slice(0, 50),
      toPincode: isExport ? 999999 : Number(to.pincode ?? 0),
      toStateCode: toState,
      actualToStateCode: Number(options.actualToStateCode ?? toState),
      totalValue: sum("taxable"),
      cgstValue: sum("cgst"),
      sgstValue: sum("sgst"),
      igstValue: sum("igst"),
      cessValue: 0,
      TotNonAdvolVal: 0,
      OthValue: 0,
      totInvValue: goodsTotal,
      transMode: MODES[t.mode] ?? 1,
      transDistance: t.distanceKm,
      transporterName: t.transporterName ?? "",
      transporterId: t.transporterId ?? "",
      transDocNo: t.docNo ?? "",
      transDocDate: t.docDate ? ddmmyyyy(toISODate(t.docDate)) : "",
      vehicleNo,
      vehicleType: t.vehicleType === "odc" ? "O" : "R",
      mainHsnCode: Number(mainHsn ?? 0),
      itemList: goods.map((g, idx) => ({
        itemNo: idx + 1,
        productName: g.description.slice(0, 100),
        productDesc: g.description.slice(0, 100),
        hsnCode: Number(g.hsn ?? 0),
        quantity: g.quantity,
        qtyUnit: toUQC(g.unit).code,
        taxableAmount: g.taxable,
        sgstRate: g.sgstRate,
        cgstRate: g.cgstRate,
        igstRate: g.igstRate,
        cessRate: 0,
        cessNonAdvol: 0,
      })),
    };
  });

  const json = { version: options.version ?? EWAYBILL_BULK_VERSION, billLists };
  if (errors.length === 0) {
    for (const e of validateEWayBillSchema(json)) {
      errors.push({ code: "EWB_SCHEMA", message: `${e.path || "/"} ${e.message}`, path: e.path });
    }
  }
  info.push(
    "Upload this file in the e-way bill portal: Generate Bulk. bharat-stack never submits anything.",
  );
  return {
    ok: errors.length === 0,
    json: errors.length === 0 ? json : null,
    errors,
    warnings,
    info,
    schemaVerification: "secondary",
    disclaimer: TAX_DISCLAIMER,
  };
}
