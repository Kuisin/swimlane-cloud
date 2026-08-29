/**
 * TypeScript view of the EditorHost contract.
 *
 * The contract itself is JSDoc on `packages/editor/src/host.js:37-54`; the
 * package ships plain JS with no .d.ts, so each TypeScript consumer restates
 * it. `apps/saas/src/lib/saas-host.ts:13-42` is the other copy. Worth
 * consolidating into a real `host.d.ts` in the editor package eventually — this
 * is now the second hand-maintained transcription of the same interface.
 */

export interface FileRef {
  id: string;
  name: string;
  mtime?: number;
}

export interface EditorHost {
  root?(): Promise<string | null>;
  list(): Promise<FileRef[]>;
  read(id: string): Promise<string>;
  writeDraft(id: string, dsl: string): Promise<void>;
  writeDraftMany?(updates: { id: string; dsl: string }[]): Promise<void>;
  checkpoint?(opts: { message?: string; files?: { id: string; dsl: string }[] }): Promise<void>;
  create(id: string, dsl: string): Promise<void>;
  mkdir?(dirPath: string): Promise<void>;
  delete?(id: string): Promise<void>;
  rmdir?(dirPath: string): Promise<void>;
  rename?(fromId: string, toId: string): Promise<void>;
  flagNewVersion?(commitSha: string, opts: { name: string; note?: string }): Promise<void>;
  capabilities?: { readOnly?: boolean; versioning?: boolean };
}
