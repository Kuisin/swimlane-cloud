/** The single `acquireVsCodeApi()` handle — calling it twice throws. */
export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): Record<string, string> | undefined;
  setState(state: Record<string, string>): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let api: VsCodeApi | null = null;

export function vscodeApi(): VsCodeApi {
  if (!api) api = acquireVsCodeApi();
  return api;
}
