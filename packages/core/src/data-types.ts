/** Every data entry carries where it came from and when it was last checked. */
export interface Sourced {
  source: string;
  secondary_source?: string;
  /** ISO date */
  last_verified: string;
  /** "official" = checked against the official source; "secondary" = only against secondary sources. */
  verification: "official" | "secondary";
}

export interface Dataset<T extends Sourced> {
  dataset: string;
  version: string;
  description: string;
  entries: T[];
}
