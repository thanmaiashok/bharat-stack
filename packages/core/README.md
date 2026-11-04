# @bharat-stack/core

Offline, deterministic Indian business functions. Zero runtime dependencies.

```ts
import { formatINR, amountInWords, validateGSTIN, fyOf } from "@bharat-stack/core";

formatINR(12345678.5); // "₹1,23,45,678.50"
amountInWords(12345678.5); // "Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight and Fifty Paise Only"
fyOf("04-11-2026"); // "2026-27"
validateGSTIN("29..."); // { valid, errors, warnings, stateCode, stateName, pan, panEntityType, ... }
```

Not tax/legal advice. Verify rates with official GST sources.
