# bharat-stack

**India business toolkit for Claude & AI agents — GST invoices, UPI QR, Tally, e-invoice JSON. Offline. Open source.**

> 🚧 Work in progress. Phases 1–2 are done: core formats, GSTIN/PAN, and the GST invoice engine with PDF + UPI QR. Install instructions arrive with the plugin in Phase 5.

**See real output:** [inter-state invoice PDF](examples/gst-invoice/bengaluru-to-mumbai.pdf) (Bengaluru → Mumbai, IGST, UPI QR) · [intra-state PDF](examples/gst-invoice/bengaluru-intra-state.pdf) (CGST + SGST) · [invoice JSON](examples/gst-invoice/bengaluru-to-mumbai.json)

## What works today (`@bharat-stack/core`)

| Function                              | Example                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `formatINR`                           | `12345678.5` → `₹1,23,45,678.50`                                           |
| `amountInWords`                       | `12345678.5` → `Rupees One Crore Twenty-Three Lakh … and Fifty Paise Only` |
| `validateGSTIN`                       | state, embedded PAN, holder type, mod-36 checksum                          |
| `validatePAN`                         | structure + holder type (P, C, H, F, A, T, B, L, J, G)                     |
| `generateTestGSTIN`                   | synthetic GSTINs with valid checksums, for tests only                      |
| `fyOf`, `quarterOf`, `parseFY`        | `04-11-2026` → `2026-27`, `Q3`                                             |
| `parseIndianDate`, `formatIndianDate` | `dd-mm-yyyy` ⇄ ISO                                                         |
| `gstReturnDueDates`                   | GSTR-1 / GSTR-3B / IFF / PMT-06 due dates (monthly and QRMP)               |
| `getState`, `findStateByName`         | all GST state/UT codes incl. 26 (DNH & DD), 38 (Ladakh), 97                |

## Roadmap

- [x] P0 — Read current docs, agree structure ([decisions](docs/decisions.md))
- [x] P1 — Core: Indian formats, GSTIN/PAN, state codes, tests
- [x] P2 — GST invoice engine + PDF + UPI QR
- [ ] P3 — Tally XML + e-invoice / e-way bill JSON
- [ ] P4 — IFSC / pincode offline lookup
- [ ] P5 — Skills + Claude Code plugin + marketplace
- [ ] P6 — MCP server
- [ ] P7 — Docs, examples, v0.1.0

## Development

Needs Node 22.12+ and pnpm 10 (the published packages themselves run on Node 20.10+).

```bash
pnpm install
pnpm check      # lint + typecheck + tests with coverage
pnpm examples   # rebuild the files in examples/
```

## Disclaimer

Not tax/legal advice. Verify rates with official GST sources. All GSTINs/PANs in tests and examples are synthetic.

## License

MIT
