/** Escape text for XML element content and attribute values. */
export function escapeXml(s: string): string {
  return (
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
      // Characters not allowed in XML 1.0.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  );
}

export type XmlChild = XmlNode | string | number | null | undefined | false;

export interface XmlNode {
  name: string;
  attrs?: Record<string, string>;
  children: XmlChild[];
}

/** Build an element. Children that are null/undefined/false are skipped. */
export function el(
  name: string,
  attrsOrChild?: Record<string, string> | XmlChild,
  ...children: XmlChild[]
): XmlNode {
  if (attrsOrChild && typeof attrsOrChild === "object" && !("children" in attrsOrChild)) {
    return { name, attrs: attrsOrChild as Record<string, string>, children };
  }
  return { name, children: [attrsOrChild as XmlChild, ...children] };
}

/** Serialise with two-space indentation. Text-only elements stay on one line. */
export function renderXml(node: XmlNode, indent = 0): string {
  const pad = "  ".repeat(indent);
  const attrs = Object.entries(node.attrs ?? {})
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join("");
  const kids = node.children.filter((c) => c !== null && c !== undefined && c !== false);
  if (kids.length === 0) return `${pad}<${node.name}${attrs}/>`;
  if (kids.every((c) => typeof c !== "object")) {
    return `${pad}<${node.name}${attrs}>${kids.map((c) => escapeXml(String(c))).join("")}</${node.name}>`;
  }
  const inner = kids
    .map((c) =>
      typeof c === "object"
        ? renderXml(c as XmlNode, indent + 1)
        : `${pad}  ${escapeXml(String(c))}`,
    )
    .join("\n");
  return `${pad}<${node.name}${attrs}>\n${inner}\n${pad}</${node.name}>`;
}
