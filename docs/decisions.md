# Design decisions (Phase 0)

Agreed on 2026-11-04.

| #   | Decision                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | npm packages are scoped: `@bharat-stack/core`, `@bharat-stack/render`, `@bharat-stack/mcp`. Fallback if the npm org can't be created: `bharat-stack`, `bharat-stack-mcp`. |
| 2   | GitHub home: `thanmaiashok/bharat-stack`. One repo is both the Claude Code plugin and its marketplace (`"source": "./"`).                                                 |
| 3   | Every data entry has `source`, `last_verified` and `verification` (`official` or `secondary`). Entries checked only against secondary sources say so.                     |
| 4   | E-invoice / e-way bill schemas are written from the INV-01 v1.1 field list and marked unverified until the official NIC schema file is added under `data/schemas/`.       |
| 5   | IFSC: bundle the compact razorpay/ifsc map (existence + bank name). Full branch details via an optional download script.                                                  |
| 6   | Pincode: nothing bundled (data.gov.in download needs a captcha). An import script reads a CSV the user downloaded (GODL-India licence).                                   |

## Format facts used (checked 2026-11-04)

- Plugin: `.claude-plugin/plugin.json` (only `name` required); skills auto-discovered at `skills/<name>/SKILL.md`. https://code.claude.com/docs/en/plugins/manifest-reference.md
- Marketplace: `.claude-plugin/marketplace.json` with `name`, `owner`, `plugins[]`. https://code.claude.com/docs/en/plugins/marketplace-reference.md
- SKILL.md: `name` ≤ 64 chars (lowercase, digits, hyphens), `description` ≤ 1,024 chars. Portable extra fields only: `license`, `compatibility`, `metadata`, `allowed-tools`. https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- Skills call bundled scripts by path relative to the skill folder, so they also work outside Claude Code (`${CLAUDE_SKILL_DIR}` is Claude Code-only).
- MCP: TypeScript SDK v2, `@modelcontextprotocol/server` (v1 `@modelcontextprotocol/sdk` is maintenance-only). https://github.com/modelcontextprotocol/typescript-sdk

## GST facts to encode later (secondary sources, re-check against official text)

- Rate slabs from 1 Feb 2026: 0, 0.25, 1.5, 3, 5, 18, 40 %. The 28 % slab and compensation cess were removed (Notifications 9/2025 and 19/2025-Central Tax (Rate)).
- E-invoice schema INV-01, `Version` = "1.1". Mandatory above ₹5 crore AATO; 30-day reporting limit at AATO ≥ ₹10 crore.
- E-way bill when consignment value exceeds ₹50,000 (CGST Rule 138). Last confirmed bulk tool version string: `1.0.0618`.
- Invoice number: ≤ 16 chars, letters, digits, `-` and `/`, unique per financial year (CGST Rule 46(b)).
- HSN on invoices: 4 digits up to ₹5 crore AATO, 6 digits above (Notification 78/2020-CT).
