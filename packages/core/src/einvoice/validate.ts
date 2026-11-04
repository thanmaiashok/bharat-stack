import { einvoice, ewaybill } from "./validators.generated.js";

export interface SchemaError {
  /** JSON pointer, e.g. "/ItemList/0/HsnCd". */
  path: string;
  message: string;
}

type GeneratedValidator = ((data: unknown) => boolean) & {
  errors?: { instancePath: string; message?: string; params?: Record<string, unknown> }[] | null;
};

function run(validator: GeneratedValidator, data: unknown): SchemaError[] {
  if (validator(data)) return [];
  return (validator.errors ?? []).map((e) => {
    const allowed = e.params?.allowedValues as unknown[] | undefined;
    const extra = e.params?.additionalProperty as string | undefined;
    let message = e.message ?? "is invalid";
    if (allowed) message += `: ${allowed.join(", ")}`;
    if (extra) message += `: "${extra}"`;
    return { path: e.instancePath, message };
  });
}

/** Validate e-invoice JSON against the bundled INV-01 v1.1 schema. */
export function validateEInvoiceSchema(data: unknown): SchemaError[] {
  return run(einvoice as GeneratedValidator, data);
}

/** Validate e-way bill bulk-upload JSON against the bundled schema. */
export function validateEWayBillSchema(data: unknown): SchemaError[] {
  return run(ewaybill as GeneratedValidator, data);
}
