/**
 * The manual's table of contents — the one allowlist both the route handler
 * and the page work from. A slug that isn't here 404s before anything
 * touches the filesystem, so there is no path built from a request value.
 *
 * Deliberately no `node:fs` in this file: the manual page is a client
 * component (it needs the client-only language preference from `useT()`)
 * and imports this module directly for the slug list, so anything here
 * bundles into client JS. The actual file read is `readManualSection` in
 * `manual-fs.ts`, imported only by the server-only route handler.
 */

export const MANUAL_LANGS = ["en", "ja"] as const;
export type ManualLang = (typeof MANUAL_LANGS)[number];

export function isManualLang(value: string): value is ManualLang {
  return (MANUAL_LANGS as readonly string[]).includes(value);
}

/** Order here is the order the manual's table of contents renders in. */
export const MANUAL_SECTIONS = [
  "overview",
  "projects",
  "branches",
  "editing-gui",
  "editing-text",
  "documents",
  "mobile",
  "templates",
  "versions",
  "pull-requests",
  "sharing",
] as const;
export type ManualSlug = (typeof MANUAL_SECTIONS)[number];

export function isManualSlug(value: string): value is ManualSlug {
  return (MANUAL_SECTIONS as readonly string[]).includes(value);
}
