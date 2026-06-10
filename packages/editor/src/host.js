/**
 * EditorHost contract.
 *
 * `<DslEditor host={...} />` drives all persistence through this object. The
 * editor knows nothing about git, auth, networking, Electron, or the file
 * system: every read/write goes through `host`. Only the required methods
 * (`list`, `read`, `writeDraft`, `create`) must be implemented; every other
 * member is optional and the editor feature-detects it before use.
 *
 * @typedef {Object} FileRef
 * @property {string} id    POSIX relative path, e.g. "ops/onboarding/flow.txt".
 * @property {string} name  Display name (typically the basename).
 * @property {number} [mtime]
 *
 * @typedef {'page'|'option'|'role'|'block'|'prop'} TemplateSection
 *
 * @typedef {Object} SectionTemplate
 * @property {string} slug
 * @property {string} name
 * @property {string} body
 * @property {boolean} [isDefault]
 *
 * @typedef {Object} TemplatePolicy
 * @property {'optional'|'default'|'forced'} mode
 * @property {string} [forcedTemplateId]
 * @property {string} [forcedBody]
 *
 * @typedef {Object} EditorCapabilities
 * @property {boolean} [readOnly]
 * @property {boolean} [versioning]
 *
 * @typedef {Object} WatchEvent
 * @property {string} id
 * @property {string|null} dsl
 * @property {'add'|'change'|'unlink'} type
 *
 * @typedef {Object} EditorHost
 * @property {() => Promise<string|null>} [root]
 * @property {() => Promise<FileRef[]>} list
 * @property {(id: string) => Promise<string>} read
 * @property {(id: string, dsl: string) => Promise<void>} writeDraft
 * @property {(updates: {id: string, dsl: string}[]) => Promise<void>} [writeDraftMany]
 * @property {(opts: {message?: string, files?: {id: string, dsl: string}[]}) => Promise<void>} [checkpoint]
 * @property {(id: string, dsl: string) => Promise<void>} create
 * @property {(dirPath: string) => Promise<void>} [mkdir]
 * @property {(id: string) => Promise<void>} [delete]
 * @property {(dirPath: string) => Promise<void>} [rmdir]
 * @property {(fromId: string, toId: string) => Promise<void>} [rename]
 * @property {(cb: (e: WatchEvent) => void) => (() => void)} [watch]
 * @property {(commitSha: string, opts: {name: string, note?: string}) => Promise<void>} [flagNewVersion]
 * @property {(section: TemplateSection) => Promise<SectionTemplate[]>} [listSectionTemplates]
 * @property {() => Promise<Record<TemplateSection, TemplatePolicy>>} [getTemplatePolicies]
 * @property {EditorCapabilities} [capabilities]
 */

export const TEMPLATE_SECTIONS = ["page", "option", "role", "block", "prop"];

/** True when the host advertises a usable implementation of `method`. */
export function hostHas(host, method) {
  return Boolean(host && typeof host[method] === "function");
}

/** True when host capabilities permit version-control actions. */
export function hostSupportsVersioning(host) {
  return Boolean(host?.capabilities?.versioning);
}

export function hostIsReadOnly(host) {
  return Boolean(host?.capabilities?.readOnly);
}
