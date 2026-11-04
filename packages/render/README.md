# @bharat-stack/render

Turn a computed invoice from `@bharat-stack/core` into an A4 PDF or HTML, and UPI links into QR codes.

```ts
import { createInvoice } from "@bharat-stack/core";
import { renderInvoicePdf, upiQr } from "@bharat-stack/render";

const { invoice, errors, warnings } = createInvoice(input);
const pdfBytes = await renderInvoicePdf(invoice); // Uint8Array
const { uri, svg, png } = await upiQr({ vpa: "shop@okaxis", payeeName: "Shop", amount: 499 });
```

The PDF uses the built-in Helvetica font, so "₹" is printed as "Rs." and characters the font cannot draw become "?".
UPI QR codes are static payment requests; they never confirm that a payment was made.

Not tax/legal advice. Verify rates with official GST sources.
