import { TAX_DISCLAIMER } from "../disclaimer.js";
import { BharatInputError, type Issue } from "../errors.js";
import type { Invoice, Party } from "../invoice/types.js";
import { paiseToDecimalString, toPaise } from "../money.js";
import { el, renderXml, type XmlNode } from "../xml.js";

export type TallyVoucherKind = "Sales" | "Purchase";

export interface TallyLedgerNames {
  /** Sales/purchase ledger for a GST rate. Default "Sales @ 18%" / "Purchase @ 18%", "Sales - Nil Rated" for 0%. */
  salesOrPurchase?: (gstRate: number, kind: TallyVoucherKind) => string;
  cgst?: string;
  sgst?: string;
  utgst?: string;
  igst?: string;
  roundOff?: string;
}

export interface TallyExportOptions {
  /** "Sales" (default): you are the seller. "Purchase": you are the buyer, the seller becomes the party. */
  voucherType?: TallyVoucherKind;
  /** Tally company name. If set, Tally imports into that company. */
  companyName?: string;
  /** Include ledger masters so the import creates missing ledgers. Default true. */
  includeMasters?: boolean;
  ledgerNames?: TallyLedgerNames;
}

export interface TallyLedger {
  name: string;
  group: string;
  kind: "party" | "income" | "expense" | "tax" | "roundoff";
}

export interface TallyVoucherSummary {
  voucherNumber: string;
  date: string;
  party: string;
  /** Sum of debit amounts (rupees). */
  debit: number;
  /** Sum of credit amounts (rupees). */
  credit: number;
  entries: { ledger: string; amount: number; side: "Dr" | "Cr" }[];
}

export interface TallyExportResult {
  xml: string;
  ledgers: TallyLedger[];
  vouchers: TallyVoucherSummary[];
  warnings: Issue[];
  disclaimer: string;
}

const tallyDate = (iso: string) => iso.replace(/-/g, "");

function defaultSalesLedger(rate: number, kind: TallyVoucherKind) {
  return rate === 0 ? `${kind} - Nil Rated` : `${kind} @ ${rate}%`;
}

function registrationType(p: Party): string {
  return p.gstin ? "Regular" : "Unregistered/Consumer";
}

interface Entry {
  ledger: string;
  /** Positive = debit, negative = credit (paise). */
  paise: number;
}

/**
 * Convert invoices from createInvoice into TallyPrime import XML (accounting vouchers).
 * Import in TallyPrime: Gateway of Tally > Import > Transactions (or Masters), choose the file.
 */
export function invoicesToTallyXml(
  input: Invoice | Invoice[],
  options: TallyExportOptions = {},
): TallyExportResult {
  const invoices = Array.isArray(input) ? input : [input];
  if (invoices.length === 0)
    throw new BharatInputError("TALLY_EMPTY", "Give at least one invoice.");
  const kind = options.voucherType ?? "Sales";
  const isSales = kind === "Sales";
  const prefix = isSales ? "Output" : "Input";
  const names = options.ledgerNames ?? {};
  const salesLedger = names.salesOrPurchase ?? defaultSalesLedger;
  const L = {
    cgst: names.cgst ?? `${prefix} CGST`,
    sgst: names.sgst ?? `${prefix} SGST`,
    utgst: names.utgst ?? `${prefix} UTGST`,
    igst: names.igst ?? `${prefix} IGST`,
    roundOff: names.roundOff ?? "Round Off",
  };
  const warnings: Issue[] = [];
  const ledgers = new Map<string, TallyLedger & { party?: Party; dutyHead?: string }>();
  const addLedger = (l: TallyLedger & { party?: Party; dutyHead?: string }) => {
    if (!ledgers.has(l.name)) ledgers.set(l.name, l);
  };

  const vouchers: XmlNode[] = [];
  const summaries: TallyVoucherSummary[] = [];

  for (const inv of invoices) {
    const party = isSales ? inv.buyer : inv.seller;
    const partyName = party.name;
    addLedger({
      name: partyName,
      group: isSales ? "Sundry Debtors" : "Sundry Creditors",
      kind: "party",
      party,
    });

    // Debit (+) / credit (−) in paise. Sales: party Dr, income and tax Cr. Purchase: the mirror image.
    const sign = isSales ? -1 : 1;
    const entries: Entry[] = [];
    const byRate = new Map<number, number>();
    for (const item of inv.items)
      byRate.set(item.gstRate, (byRate.get(item.gstRate) ?? 0) + toPaise(item.taxable));
    for (const [rate, paise] of byRate) {
      const name = salesLedger(rate, kind);
      addLedger({
        name,
        group: isSales ? "Sales Accounts" : "Purchase Accounts",
        kind: isSales ? "income" : "expense",
      });
      entries.push({ ledger: name, paise: sign * paise });
    }
    const tax = (ledger: string, rupees: number, dutyHead: string) => {
      const paise = toPaise(rupees);
      if (paise === 0) return;
      addLedger({ name: ledger, group: "Duties & Taxes", kind: "tax", dutyHead });
      entries.push({ ledger, paise: sign * paise });
    };
    if (inv.reverseCharge) {
      warnings.push({
        code: "TALLY_REVERSE_CHARGE",
        message: `${inv.invoiceNo}: reverse charge. GST is not part of this voucher; record the RCM liability in Tally separately.`,
      });
    } else {
      tax(L.cgst, inv.totals.cgst, "Central Tax");
      tax(inv.stateTaxLabel === "UTGST" ? L.utgst : L.sgst, inv.totals.sgst, "State Tax");
      tax(L.igst, inv.totals.igst, "Integrated Tax");
    }
    const roundOff = toPaise(inv.totals.roundOff);
    if (roundOff !== 0) {
      addLedger({ name: L.roundOff, group: "Indirect Expenses", kind: "roundoff" });
      entries.push({ ledger: L.roundOff, paise: sign * roundOff });
    }
    const payable = toPaise(inv.totals.amountPayable);
    entries.unshift({ ledger: partyName, paise: -sign * payable });

    const balance = entries.reduce((s, e) => s + e.paise, 0);
    if (balance !== 0) {
      throw new BharatInputError(
        "TALLY_UNBALANCED",
        `${inv.invoiceNo}: debits and credits differ by ${balance} paise.`,
      );
    }

    // Tally convention: debit amounts are negative with ISDEEMEDPOSITIVE Yes.
    const amount = (p: number) => paiseToDecimalString(-p);
    const ledgerEntry = (e: Entry, isParty: boolean) =>
      el(
        "ALLLEDGERENTRIES.LIST",
        el("LEDGERNAME", e.ledger),
        el("ISDEEMEDPOSITIVE", e.paise > 0 ? "Yes" : "No"),
        el("ISPARTYLEDGER", isParty ? "Yes" : "No"),
        el("AMOUNT", amount(e.paise)),
        isParty &&
          el(
            "BILLALLOCATIONS.LIST",
            el("NAME", inv.invoiceNo),
            el("BILLTYPE", "New Ref"),
            el("AMOUNT", amount(e.paise)),
          ),
      );

    const narration = `${isSales ? "Sales" : "Purchase"} invoice ${inv.invoiceNo} dated ${inv.dateIndian}${inv.reverseCharge ? " (reverse charge)" : ""}`;
    vouchers.push(
      el(
        "TALLYMESSAGE",
        { "xmlns:UDF": "TallyUDF" },
        el(
          "VOUCHER",
          { VCHTYPE: kind, ACTION: "Create", OBJVIEW: "Accounting Voucher View" },
          el("DATE", tallyDate(inv.date)),
          el("EFFECTIVEDATE", tallyDate(inv.date)),
          el("VOUCHERTYPENAME", kind),
          isSales && el("VOUCHERNUMBER", inv.invoiceNo),
          el("REFERENCE", inv.invoiceNo),
          !isSales && el("REFERENCEDATE", tallyDate(inv.date)),
          el("PARTYLEDGERNAME", partyName),
          el("PARTYNAME", partyName),
          party.gstin && el("PARTYGSTIN", party.gstin),
          el("GSTREGISTRATIONTYPE", registrationType(party)),
          party.stateName && el("STATENAME", party.stateName),
          el("PLACEOFSUPPLY", inv.placeOfSupply.name),
          el("COUNTRYOFRESIDENCE", inv.placeOfSupply.code === "96" ? "Other Country" : "India"),
          el("PERSISTEDVIEW", "Accounting Voucher View"),
          el("ISINVOICE", "No"),
          el("NARRATION", narration),
          ...entries.map((e, i) => ledgerEntry(e, i === 0)),
        ),
      ),
    );
    const debit = entries.filter((e) => e.paise > 0).reduce((s, e) => s + e.paise, 0);
    summaries.push({
      voucherNumber: inv.invoiceNo,
      date: inv.dateIndian,
      party: partyName,
      debit: debit / 100,
      credit: debit / 100,
      entries: entries.map((e) => ({
        ledger: e.ledger,
        amount: Math.abs(e.paise) / 100,
        side: e.paise > 0 ? "Dr" : "Cr",
      })),
    });
  }

  const masters: XmlNode[] = [];
  if (options.includeMasters ?? true) {
    for (const l of ledgers.values()) {
      const p = l.party;
      masters.push(
        el(
          "TALLYMESSAGE",
          { "xmlns:UDF": "TallyUDF" },
          el(
            "LEDGER",
            { NAME: l.name, ACTION: "Create" },
            el("NAME.LIST", el("NAME", l.name)),
            el("PARENT", l.group),
            l.kind === "party" && el("ISBILLWISEON", "Yes"),
            p &&
              p.address.length > 0 &&
              el("ADDRESS.LIST", { TYPE: "String" }, ...p.address.map((a) => el("ADDRESS", a))),
            p?.stateName && el("LEDSTATENAME", p.stateName),
            p && el("COUNTRYNAME", p.stateCode === "96" ? "Other Country" : "India"),
            p?.pincode && el("PINCODE", p.pincode),
            p && el("GSTREGISTRATIONTYPE", registrationType(p)),
            p?.gstin && el("PARTYGSTIN", p.gstin),
            l.kind === "tax" && el("TAXTYPE", "GST"),
            l.dutyHead && el("GSTDUTYHEAD", l.dutyHead),
          ),
        ),
      );
    }
  }

  const request = (report: string, messages: XmlNode[]) =>
    el(
      "IMPORTDATA",
      el(
        "REQUESTDESC",
        el("REPORTNAME", report),
        options.companyName && el("STATICVARIABLES", el("SVCURRENTCOMPANY", options.companyName)),
      ),
      el("REQUESTDATA", ...messages),
    );

  const envelope = el(
    "ENVELOPE",
    el("HEADER", el("TALLYREQUEST", "Import Data")),
    el(
      "BODY",
      ...(masters.length ? [request("All Masters", masters)] : []),
      request("Vouchers", vouchers),
    ),
  );

  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n${renderXml(envelope)}\n`,
    ledgers: [...ledgers.values()].map(({ name, group, kind: k }) => ({ name, group, kind: k })),
    vouchers: summaries,
    warnings,
    disclaimer: TAX_DISCLAIMER,
  };
}
