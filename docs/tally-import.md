# Importing into TallyPrime

bharat-stack turns invoices into TallyPrime import XML: the ledgers they need (masters) and one
**Sales** (or **Purchase**) voucher per invoice in _Accounting Invoice_ mode.

```ts
import { createInvoice, invoicesToTallyXml } from "@bharat-stack/core";

const { invoice } = createInvoice(input);
const { xml, mastersXml, vouchersXml, vouchers } = invoicesToTallyXml([invoice], {
  companyName: "Your Company Name As In Tally", // optional
});
```

`vouchers` lists each voucher's debit and credit entries so you can check them before importing.
Debit always equals credit; the function refuses to produce an unbalanced voucher.

## Before you import

1. **Back up your company** (or try it on a test company first).
2. Make sure the invoice dates are inside the company's financial year and on or after its books-beginning date.
3. Set the voucher type's numbering to **Manual** or **Automatic (Manual Override)**. With plain _Automatic_
   numbering, Tally ignores the invoice number in the file.
4. If you already have ledgers with different names (e.g. "Sales 18%" instead of "Sales @ 18%"), pass
   `ledgerNames` so the vouchers use your names, and `includeMasters: false` to skip creating ledgers.

## Import steps (TallyPrime)

1. Open the company.
2. **Gateway of Tally → Import → Transactions** (Alt+O → Import → Transactions).
3. Choose the file path of `xml` (masters and vouchers together, masters first).
4. Press Enter to import. Tally shows how many ledgers/vouchers were created, altered or had errors.
5. Open **Day Book** and check the vouchers.

If your Tally rejects the combined file, import `mastersXml` first with **Import → Masters**, then
`vouchersXml` with **Import → Transactions**.

## What gets created

| Ledger                                                       | Group                              | Notes                                                  |
| ------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------ |
| Buyer (sales) / seller (purchase)                            | Sundry Debtors / Sundry Creditors  | Bill-wise on; GSTIN, state, address, registration type |
| `Sales @ 18%`, `Sales - Nil Rated`, …                        | Sales Accounts / Purchase Accounts | One per GST rate                                       |
| `Output CGST`, `Output SGST` / `Output UTGST`, `Output IGST` | Duties & Taxes                     | Type of duty: GST; tax head CGST / SGST/UTGST / IGST   |
| `Round Off`                                                  | Indirect Expenses                  | Only when the invoice was rounded                      |

For **purchases** the tax ledgers are `Input CGST` etc. and the supplier's invoice number goes into the
voucher's reference.

### Older Tally versions

TallyPrime 3.0 and later use the tax heads `CGST`, `SGST/UTGST` and `IGST`. For TallyPrime 2.1 and older
(or Tally.ERP 9), pass `tallyVersion: "legacy"` to use `Central Tax`, `State Tax` and `Integrated Tax`.

## Things to check after import

- **Reverse charge** invoices are imported without GST lines (the buyer pays GST to the government).
  Record the RCM liability in Tally separately.
- **Sales ledgers have no HSN/rate set**. GSTR-1 reports in Tally may mark the vouchers "uncertain" until you
  set GST details (rate, HSN) on the sales ledgers or in the vouchers.
- Tally's import response can report `ERRORS=0` and still skip a voucher (`EXCEPTIONS`); check the counts.

## How this was checked

The XML is tested for well-formedness, balanced vouchers, and every ledger used being defined.
The tag layout follows TallyPrime 7.x behaviour documented by open-source integrations
(see `docs/decisions.md`); it has not been imported into Tally by this project's CI. If something does
not import, please open an issue with your TallyPrime version and the error shown.

Not tax/legal advice. Verify rates with official GST sources.
