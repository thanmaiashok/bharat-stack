import { TAX_DISCLAIMER } from "../disclaimer.js";
import { BharatInputError, type Issue } from "../errors.js";
import { type CalendarDate, formatIndianDate, toCalendarDate, toISODate } from "../formats/date.js";
import { fyOf } from "../formats/fy.js";
import { formatPaise } from "../formats/inr.js";
import { paiseInWords } from "../formats/words.js";
import { validateGSTIN } from "../gstin.js";
import { toPaise } from "../money.js";
import { gstRateSlabs, gstRule, isValidGSTRate } from "../rules.js";
import { findStateByName, type GSTState, getState } from "../states.js";
import { buildUpiUri } from "../upi.js";
import type {
  Discount,
  HsnSummaryRow,
  Invoice,
  InvoiceInput,
  InvoiceLine,
  InvoiceResult,
  Party,
  PartyInput,
} from "./types.js";

/** Round n / d half away from zero, using BigInt so large amounts never lose precision. */
export function divRound(n: number, d: number): number {
  const bn = BigInt(n);
  const bd = BigInt(d);
  const neg = bn < 0n !== bd < 0n;
  const an = bn < 0n ? -bn : bn;
  const ad = bd < 0n ? -bd : bd;
  const q = (an * 2n + ad) / (ad * 2n);
  const result = Number(neg ? -q : q);
  return Object.is(result, -0) ? 0 : result;
}

const rupees = (paise: number) => paise / 100;

/** Quantity → integer thousandths, rounding half up at the 4th decimal. */
function milli(q: number): number {
  let text = String(q);
  if (/e/i.test(text)) text = q.toFixed(6);
  const [whole = "0", frac = ""] = text.split(".");
  const f = `${frac}0000`;
  let m = Number(whole) * 1000 + Number(f.slice(0, 3));
  if (Number(f[3]) >= 5) m += 1;
  if (!Number.isSafeInteger(m))
    throw new BharatInputError("QTY_INVALID", `Quantity ${q} is too large.`);
  return m;
}

function resolveParty(
  p: PartyInput,
  role: "seller" | "buyer",
  errors: Issue[],
  warnings: Issue[],
): Party {
  const tag = role.toUpperCase();
  if (!p?.name?.trim()) errors.push({ code: `${tag}_NAME`, message: `${role} name is required.` });
  let state: GSTState | undefined;
  let gstin: string | null = null;

  if (p?.gstin?.trim()) {
    const v = validateGSTIN(p.gstin);
    gstin = v.normalized;
    for (const e of v.errors)
      errors.push({ code: `${tag}_${e.code}`, message: `${role} GSTIN: ${e.message}` });
    for (const w of v.warnings)
      warnings.push({ code: `${tag}_${w.code}`, message: `${role} GSTIN: ${w.message}` });
    if (v.stateCode) state = getState(v.stateCode);
  } else if (role === "seller") {
    errors.push({
      code: "SELLER_GSTIN_REQUIRED",
      message: "A tax invoice needs the seller's GSTIN.",
    });
  }

  const fromInput = p?.stateCode
    ? getState(p.stateCode)
    : p?.state
      ? findStateByName(p.state)
      : undefined;
  if ((p?.stateCode || p?.state) && !fromInput) {
    errors.push({
      code: `${tag}_STATE`,
      message: `${role} state "${p.stateCode ?? p.state}" is not recognised.`,
    });
  }
  if (state && fromInput && state.code !== fromInput.code) {
    warnings.push({
      code: `${tag}_STATE_MISMATCH`,
      message: `${role} GSTIN is registered in ${state.name} but state was given as ${fromInput.name}; using the GSTIN state.`,
    });
  }
  state ??= fromInput;

  const address = Array.isArray(p?.address) ? p.address : p?.address ? p.address.split(/\n/) : [];
  return {
    name: p?.name?.trim() ?? "",
    gstin,
    address: address.map((l) => l.trim()).filter(Boolean),
    city: p?.city ?? null,
    pincode: p?.pincode ?? null,
    stateCode: state?.code ?? null,
    stateName: state?.name ?? null,
    phone: p?.phone ?? null,
    email: p?.email ?? null,
    sez: p?.sez ?? false,
  };
}

function discountPaise(d: Discount | undefined, gross: number, sl: number): number {
  if (d === undefined) return 0;
  if (typeof d === "object") {
    if (!Number.isFinite(d.percent) || d.percent < 0 || d.percent > 100) {
      throw new BharatInputError("DISCOUNT_INVALID", `Item ${sl}: discount percent must be 0–100.`);
    }
    return divRound(gross * Math.round(d.percent * 100), 10000);
  }
  return toPaise(d);
}

function checkInvoiceNo(no: string, errors: Issue[]): string {
  const s = String(no ?? "").trim();
  const max = gstRule<number>("invoice_number_max_length");
  const pattern = new RegExp(gstRule<string>("invoice_number_pattern"));
  if (!s) errors.push({ code: "INVOICE_NO_REQUIRED", message: "Invoice number is required." });
  else if (s.length > max)
    errors.push({
      code: "INVOICE_NO_LENGTH",
      message: `Invoice number must be at most ${max} characters (got ${s.length}).`,
    });
  else if (!pattern.test(s))
    errors.push({
      code: "INVOICE_NO_CHARS",
      message: "Invoice number may contain only letters, digits, '-' and '/'.",
    });
  return s;
}

function checkHsn(
  hsn: string | undefined,
  sl: number,
  minDigits: number,
  b2b: boolean,
  warnings: Issue[],
  errors: Issue[],
) {
  const h = hsn?.replace(/\s+/g, "") ?? "";
  if (!h) {
    if (b2b)
      warnings.push({
        code: "HSN_MISSING",
        message: `Item ${sl}: HSN/SAC code is missing (required on B2B invoices).`,
      });
    return null;
  }
  if (!/^\d{4}$|^\d{6}$|^\d{8}$/.test(h)) {
    errors.push({
      code: "HSN_FORMAT",
      message: `Item ${sl}: HSN/SAC "${hsn}" must be 4, 6 or 8 digits.`,
    });
  } else if (h.length < minDigits && (b2b || minDigits > 4)) {
    warnings.push({
      code: "HSN_DIGITS",
      message: `Item ${sl}: use at least ${minDigits} HSN digits for your turnover.`,
    });
  }
  return h;
}

/**
 * Compute a GST tax invoice. Intra-state supplies get CGST + SGST/UTGST (split equally),
 * inter-state and SEZ supplies get IGST. All arithmetic is in integer paise.
 */
export function createInvoice(input: InvoiceInput): InvoiceResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const fail = (): InvoiceResult => ({
    ok: false,
    invoice: null,
    errors,
    warnings,
    disclaimer: TAX_DISCLAIMER,
  });

  const invoiceNo = checkInvoiceNo(input.invoiceNo, errors);
  let date: CalendarDate | null = null;
  try {
    date = toCalendarDate(input.date);
  } catch (e) {
    errors.push({ code: "DATE_INVALID", message: (e as Error).message });
  }
  const seller = resolveParty(input.seller, "seller", errors, warnings);
  const buyer = resolveParty(input.buyer, "buyer", errors, warnings);

  let pos: GSTState | undefined;
  if (input.placeOfSupply) {
    pos = getState(input.placeOfSupply) ?? findStateByName(input.placeOfSupply);
    if (!pos)
      errors.push({
        code: "POS_INVALID",
        message: `Place of supply "${input.placeOfSupply}" is not a GST state code.`,
      });
  } else if (buyer.stateCode) {
    pos = getState(buyer.stateCode);
  } else {
    errors.push({
      code: "POS_REQUIRED",
      message: "Place of supply is required (or give the buyer's GSTIN or state).",
    });
  }
  if (pos?.legacy)
    warnings.push({
      code: "POS_LEGACY",
      message: `Place of supply ${pos.code} is a legacy state code.`,
    });

  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.push({ code: "ITEMS_REQUIRED", message: "At least one item is required." });
  }
  if (errors.length > 0 || !date || !pos) return fail();

  const sellerState = seller.stateCode ? getState(seller.stateCode) : undefined;
  const intra = !buyer.sez && pos.code !== "96" && sellerState?.code === pos.code;
  const stateTaxLabel = sellerState?.intraStateTax ?? "SGST";
  const b2b = buyer.gstin !== null;

  let minHsn = 4;
  if (input.sellerTurnover !== undefined) {
    const threshold = gstRule<number>("hsn_aato_threshold_paise");
    minHsn =
      toPaise(input.sellerTurnover) > threshold
        ? gstRule<number>("hsn_digits_aato_above_5cr")
        : gstRule<number>("hsn_digits_aato_upto_5cr");
  }

  const iso = toISODate(date);
  const lines: InvoiceLine[] = [];
  const paise = { gross: 0, discount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
  const hsnMap = new Map<
    string,
    HsnSummaryRow & { _t: number; _c: number; _s: number; _i: number; _q: number }
  >();

  input.items.forEach((item, idx) => {
    const sl = idx + 1;
    try {
      if (!item.description?.trim())
        errors.push({ code: "ITEM_DESCRIPTION", message: `Item ${sl}: description is required.` });
      const q = milli(validQty(item.quantity, sl));
      const ratePaise = toPaise(item.rate);
      if (ratePaise < 0)
        throw new BharatInputError("RATE_INVALID", `Item ${sl}: rate cannot be negative.`);
      const gross = divRound(q * ratePaise, 1000);
      const discount = discountPaise(item.discount, gross, sl);
      if (discount < 0 || discount > gross) {
        throw new BharatInputError(
          "DISCOUNT_INVALID",
          `Item ${sl}: discount must be between 0 and the line amount.`,
        );
      }
      const taxable = gross - discount;

      const rate = item.gstRate;
      const rateBp = Math.round(rate * 100);
      if (!Number.isFinite(rate) || rate < 0 || Math.abs(rateBp - rate * 100) > 1e-9) {
        throw new BharatInputError(
          "GST_RATE_INVALID",
          `Item ${sl}: GST rate "${rate}" is not a valid percentage.`,
        );
      }
      if (!isValidGSTRate(rate, iso)) {
        const valid = gstRateSlabs(iso)
          .map((s) => s.rate)
          .join(", ");
        warnings.push({
          code: "GST_RATE_UNUSUAL",
          message: `Item ${sl}: ${rate}% is not a GST slab on ${formatIndianDate(date as CalendarDate)} (valid: ${valid}).`,
        });
      }

      const half = intra ? divRound(taxable * rateBp, 20000) : 0;
      const igst = intra ? 0 : divRound(taxable * rateBp, 10000);
      const hsn = checkHsn(item.hsn, sl, minHsn, b2b, warnings, errors);
      lines.push({
        sl,
        description: item.description?.trim() ?? "",
        hsn,
        isService: hsn?.startsWith("99") ?? false,
        quantity: q / 1000,
        unit: (item.unit ?? "NOS").toUpperCase(),
        rate: rupees(ratePaise),
        gross: rupees(gross),
        discount: rupees(discount),
        taxable: rupees(taxable),
        gstRate: rate,
        cgstRate: intra ? rate / 2 : 0,
        sgstRate: intra ? rate / 2 : 0,
        igstRate: intra ? 0 : rate,
        cgst: rupees(half),
        sgst: rupees(half),
        igst: rupees(igst),
        total: rupees(taxable + 2 * half + igst),
      });
      paise.gross += gross;
      paise.discount += discount;
      paise.taxable += taxable;
      paise.cgst += half;
      paise.sgst += half;
      paise.igst += igst;

      const key = `${hsn ?? "-"}|${rate}`;
      const row = hsnMap.get(key) ?? {
        hsn: hsn ?? "-",
        gstRate: rate,
        quantity: 0,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        totalTax: 0,
        _t: 0,
        _c: 0,
        _s: 0,
        _i: 0,
        _q: 0,
      };
      row._t += taxable;
      row._c += half;
      row._s += half;
      row._i += igst;
      row._q += q;
      hsnMap.set(key, row);
    } catch (e) {
      if (!(e instanceof BharatInputError)) throw e;
      errors.push({
        code: e.code,
        message: e.message.startsWith("Item") ? e.message : `Item ${sl}: ${e.message}`,
      });
    }
  });
  if (errors.length > 0) return fail();

  const totalTax = paise.cgst + paise.sgst + paise.igst;
  const invoiceValue = paise.taxable + totalTax;
  const reverseCharge = input.reverseCharge ?? false;
  const beforeRound = reverseCharge ? paise.taxable : invoiceValue;
  const payable = input.roundOff === false ? beforeRound : divRound(beforeRound, 100) * 100;
  if (reverseCharge) {
    warnings.push({
      code: "REVERSE_CHARGE",
      message: "Reverse charge: the buyer pays the GST shown directly to the government.",
    });
  }

  let upi: Invoice["upi"] = null;
  if (input.upi) {
    try {
      const u = buildUpiUri({
        vpa: input.upi.vpa,
        payeeName: input.upi.payeeName ?? seller.name,
        amount: payable / 100,
        note: `Invoice ${invoiceNo}`,
        txnRef: invoiceNo,
      });
      upi = { uri: u.uri, vpa: u.vpa, payeeName: u.payeeName, amount: u.amount as string };
    } catch (e) {
      if (!(e instanceof BharatInputError)) throw e;
      errors.push({ code: e.code, message: e.message });
      return fail();
    }
  }

  const invoice: Invoice = {
    schema: "bharat-stack/invoice@1",
    documentType: "TAX_INVOICE",
    invoiceNo,
    date: iso,
    dateIndian: formatIndianDate(date),
    financialYear: fyOf(date),
    seller,
    buyer,
    placeOfSupply: { code: pos.code, name: pos.name },
    supplyType: intra ? "INTRA_STATE" : "INTER_STATE",
    stateTaxLabel,
    reverseCharge,
    items: lines,
    hsnSummary: [...hsnMap.values()].map(({ _t, _c, _s, _i, _q, ...r }) => ({
      ...r,
      quantity: _q / 1000,
      taxable: rupees(_t),
      cgst: rupees(_c),
      sgst: rupees(_s),
      igst: rupees(_i),
      totalTax: rupees(_c + _s + _i),
    })),
    totals: {
      gross: rupees(paise.gross),
      discount: rupees(paise.discount),
      taxable: rupees(paise.taxable),
      cgst: rupees(paise.cgst),
      sgst: rupees(paise.sgst),
      igst: rupees(paise.igst),
      totalTax: rupees(totalTax),
      invoiceValue: rupees(invoiceValue),
      roundOff: rupees(payable - beforeRound),
      amountPayable: rupees(payable),
    },
    amountInWords: paiseInWords(payable),
    formatted: {
      amountPayable: formatPaise(payable),
      invoiceValue: formatPaise(invoiceValue),
      totalTax: formatPaise(totalTax),
    },
    upi,
    bank: input.bank ?? null,
    notes: input.notes ?? null,
    terms: input.terms ?? null,
    disclaimer: TAX_DISCLAIMER,
  };
  return { ok: true, invoice, errors, warnings, disclaimer: TAX_DISCLAIMER };
}

function validQty(q: number, sl: number): number {
  if (typeof q !== "number" || !Number.isFinite(q) || q <= 0) {
    throw new BharatInputError("QTY_INVALID", `Item ${sl}: quantity must be a positive number.`);
  }
  if (milli(q) === 0)
    throw new BharatInputError("QTY_INVALID", `Item ${sl}: quantity is too small.`);
  return q;
}
