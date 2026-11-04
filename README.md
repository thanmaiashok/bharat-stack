# bharat-stack

**India business toolkit for Claude & AI agents — GST invoices, UPI QR, Tally, e-invoice JSON. Offline. Open source.**

> 🚧 Work in progress. Phase 1 (core formats + GSTIN/PAN) is done. Install instructions arrive with the plugin in Phase 5.

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
- [ ] P2 — GST invoice engine + PDF + UPI QR
- [ ] P3 — Tally XML + e-invoice / e-way bill JSON
- [ ] P4 — IFSC / pincode offline lookup
- [ ] P5 — Skills + Claude Code plugin + marketplace
- [ ] P6 — MCP server
- [ ] P7 — Docs, examples, v0.1.0

## Development

```bash
pnpm install
pnpm check   # lint + typecheck + tests with coverage
```

## Disclaimer

Not tax/legal advice. Verify rates with official GST sources. All GSTINs/PANs in tests and examples are synthetic.

## License

MIT
