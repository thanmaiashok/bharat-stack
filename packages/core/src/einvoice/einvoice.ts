import { TAX_DISCLAIMER } from "../disclaimer.js";
import type { Issue } from "../errors.js";
import type { Invoice, Party } from "../invoice/types.js";
import { gstRule } from "../rules.js";
import { toUQC } from "../uqc.js";
import { type SchemaError, validateEInvoiceSchema } from "./validate.js";

export const EINVOICE_SCHEMA_VERSION = "1.1";

export type EInvoiceSupplyType = "B2B" | "SEZWP" | "SEZWOP" | "EXPWP" | "EXPWOP" | "DEXP";

export interface EInvoiceOptions {
  /** Override the derived supply type (e.g. "DEXP" for deemed exports). */
  supplyType?: EInvoiceSupplyType;
  /** GSTIN of the e-commerce operator, if sold through one. */
  ecomGstin?: string;
  /** Export details for EXPWP / EXPWOP. */
  export?: {
    shippingBillNo?: string;
    shippingBillDate?: string;
    /** Port code, e.g. "INBLR4". */
    port?: string;
    /** ISO 3166 alpha-2 country code, e.g. "US". */
    countryCode?: string;
    /** ISO 4217 currency, e.g. "USD". */
    currency?: string;
  };
}

/** E-invoice request JSON (INV-01, version 1.1). Field names follow the IRP schema. */
export type EInvoiceJson = Record<string, unknown> & { Version: string };

export interface EInvoiceResult {
  ok: boolean;
  json: EInvoiceJson | null;
  errors: (Issue & { path?: string })[];
  warnings: Issue[];
  /** Applicability notes (thresholds). Information only. */
  info: string[];
  schemaVersion: string;
  /** How the bundled JSON schema was checked. See data/schemas. */
  schemaVerification: "official" | "secondary";
  disclaimer: string;
}

const ddmmyyyy = (iso: string) => iso.split("-").reverse().join("/");
const digits = (s: string | null) => (s ? s.replace(/\D/g, "") : "");
const cut = (s: string | undefined, max: number) => (s && s.length > max ? s.slice(0, max) : s);

function partyBlock(p: Party, role: "Seller" | "Buyer", errors: Issue[], isExportBuyer = false) {
  const addr1 = p.address[0];
  const addr2 = p.address.slice(1).join(", ");
  if (!addr1)
    errors.push({
      code: `${role.toUpperCase()}_ADDRESS`,
      message: `${role} address line is required for an e-invoice.`,
    });
  if (!p.city)
    errors.push({
      code: `${role.toUpperCase()}_CITY`,
      message: `${role} city (location) is required for an e-invoice.`,
    });
  let pin = Number(digits(p.pincode));
  if (isExportBuyer) pin = 999999;
  else if (!/^\d{6}$/.test(digits(p.pincode))) {
    errors.push({
      code: `${role.toUpperCase()}_PINCODE`,
      message: `${role} 6-digit PIN code is required for an e-invoice.`,
    });
  }
  const phone = digits(p.phone).replace(/^91(?=\d{10}$)/, "");
  return {
    LglNm: p.name,
    Addr1: cut(addr1, 100) ?? "",
    ...(addr2 ? { Addr2: cut(addr2, 100) } : {}),
    Loc: cut(p.city ?? "", 100),
    Pin: pin,
    ...(phone.length >= 6 && phone.length <= 12 ? { Ph: phone } : {}),
    ...(p.email ? { Em: p.email } : {}),
  };
}

/**
 * Convert an invoice from createInvoice into e-invoice (IRN) request JSON, then validate it
 * against the bundled schema. This only creates the file; it never calls the IRP.
 */
export function invoiceToEInvoice(inv: Invoice, options: EInvoiceOptions = {}): EInvoiceResult {
  const errors: (Issue & { path?: string })[] = [];
  const warnings: Issue[] = [];
  const isExport = inv.placeOfSupply.code === "96";
  const igstPaid = inv.totals.igst > 0;

  let supplyType: EInvoiceSupplyType = options.supplyType ?? "B2B";
  if (!options.supplyType) {
    if (isExport) supplyType = igstPaid ? "EXPWP" : "EXPWOP";
    else if (inv.buyer.sez) supplyType = igstPaid ? "SEZWP" : "SEZWOP";
  }
  if (!isExport && !inv.buyer.gstin) {
    errors.push({
      code: "EINVOICE_B2C",
      message: "E-invoices are for B2B, SEZ and export supplies. The buyer has no GSTIN (B2C).",
    });
  }

  const intraStateIgst =
    inv.supplyType === "INTER_STATE" &&
    !isExport &&
    inv.seller.stateCode === inv.placeOfSupply.code;

  const items = inv.items.map((it) => {
    const uqc = toUQC(it.unit);
    if (!uqc.known && !it.isService) {
      warnings.push({
        code: "EINVOICE_UNIT",
        message: `Item ${it.sl}: unit "${it.unit}" is not a GST UQC; sent as OTH.`,
      });
    }
    if (!it.hsn)
      errors.push({
        code: "EINVOICE_HSN",
        message: `Item ${it.sl}: HSN/SAC is required.`,
        path: `/ItemList/${it.sl - 1}/HsnCd`,
      });
    return {
      SlNo: String(it.sl),
      PrdDesc: cut(it.description, 300),
      IsServc: it.isService ? "Y" : "N",
      HsnCd: it.hsn ?? "",
      Qty: it.quantity,
      Unit: uqc.code,
      UnitPrice: it.rate,
      TotAmt: it.gross,
      Discount: it.discount,
      AssAmt: it.taxable,
      GstRt: it.gstRate,
      IgstAmt: it.igst,
      CgstAmt: it.cgst,
      SgstAmt: it.sgst,
      CesRt: 0,
      CesAmt: 0,
      CesNonAdvlAmt: 0,
      StateCesRt: 0,
      StateCesAmt: 0,
      StateCesNonAdvlAmt: 0,
      OthChrg: 0,
      TotItemVal: it.total,
    };
  });

  const seller = partyBlock(inv.seller, "Seller", errors);
  const buyer = partyBlock(inv.buyer, "Buyer", errors, isExport);
  const totInvVal = inv.reverseCharge ? inv.totals.invoiceValue : inv.totals.amountPayable;
  const rndOff = inv.reverseCharge ? 0 : inv.totals.roundOff;

  const json: EInvoiceJson = {
    Version: EINVOICE_SCHEMA_VERSION,
    TranDtls: {
      TaxSch: "GST",
      SupTyp: supplyType,
      RegRev: inv.reverseCharge ? "Y" : "N",
      ...(options.ecomGstin ? { EcmGstin: options.ecomGstin } : {}),
      IgstOnIntra: intraStateIgst ? "Y" : "N",
    },
    DocDtls: { Typ: "INV", No: inv.invoiceNo, Dt: ddmmyyyy(inv.date) },
    SellerDtls: { Gstin: inv.seller.gstin ?? "", ...seller, Stcd: inv.seller.stateCode ?? "" },
    BuyerDtls: {
      Gstin: isExport ? "URP" : (inv.buyer.gstin ?? ""),
      ...buyer,
      Pos: inv.placeOfSupply.code,
      Stcd: isExport ? "96" : (inv.buyer.stateCode ?? inv.placeOfSupply.code),
    },
    ItemList: items,
    ValDtls: {
      AssVal: inv.totals.taxable,
      CgstVal: inv.totals.cgst,
      SgstVal: inv.totals.sgst,
      IgstVal: inv.totals.igst,
      CesVal: 0,
      StCesVal: 0,
      Discount: 0,
      OthChrg: 0,
      RndOffAmt: rndOff,
      TotInvVal: totInvVal,
    },
  };

  if (inv.bank?.accountNumber && inv.bank.ifsc) {
    json.PayDtls = {
      Nm: inv.bank.accountName ?? inv.seller.name,
      AccDet: inv.bank.accountNumber,
      FinInsBr: inv.bank.ifsc,
    };
  }
  if (isExport) {
    const e = options.export ?? {};
    json.ExpDtls = {
      ...(e.shippingBillNo ? { ShipBNo: e.shippingBillNo } : {}),
      ...(e.shippingBillDate ? { ShipBDt: e.shippingBillDate } : {}),
      ...(e.port ? { Port: e.port } : {}),
      ...(e.currency ? { ForCur: e.currency } : {}),
      ...(e.countryCode ? { CntCode: e.countryCode } : {}),
    };
  }

  if (errors.length === 0) {
    for (const e of validateEInvoiceSchema(json)) errors.push(schemaIssue(e));
  }

  // 1 crore rupees = 10^9 paise.
  const threshold = gstRule<number>("einvoice_aato_threshold_paise") / 1e9;
  const limit30 = gstRule<number>("einvoice_30_day_limit_aato_paise") / 1e9;
  const days = gstRule<number>("einvoice_reporting_days");
  return {
    ok: errors.length === 0,
    json: errors.length === 0 ? json : null,
    errors,
    warnings,
    info: [
      `E-invoicing applies if your aggregate annual turnover exceeded Rs ${threshold} crore in any year since 2017-18.`,
      `If your turnover is Rs ${limit30} crore or more, report the invoice to the IRP within ${days} days of the invoice date.`,
      "Upload this JSON on the IRP (or via your GSP). bharat-stack never submits anything.",
    ],
    schemaVersion: EINVOICE_SCHEMA_VERSION,
    schemaVerification: "secondary",
    disclaimer: TAX_DISCLAIMER,
  };
}

function schemaIssue(e: SchemaError): Issue & { path: string } {
  return { code: "EINVOICE_SCHEMA", message: `${e.path || "/"} ${e.message}`, path: e.path };
}
