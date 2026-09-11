"use client";

/**
 * Loading and saving for the Document view.
 *
 * Kept apart from `_markdown-editor.tsx` so the Milkdown bundle stays behind
 * `next/dynamic` — Milkdown touches `document` while it is being constructed
 * and cannot be server-rendered.
 *
 * This reads through the host's `readStored`/`writeStored` rather than the
 * whole-repository snapshot the mobile view uses: the Document view only ever
 * edits one file, and the host already caches exactly these bytes.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import type { MetadataField } from "@/lib/metadata-schema";
import type { SaasEditorHost } from "@/lib/saas-host";

const MarkdownEditor = dynamic(() => import("./_markdown-editor"), {
  ssr: false,
  loading: () => <Centered>…</Centered>,
});

/** Matches the editor's own autosave delay, so both views feel the same. */
const AUTOSAVE_MS = 1500;

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-400">
      {children}
    </div>
  );
}

export function DocumentView({
  host,
  path,
  fields,
  readOnly,
  onSaved,
  onError,
  onPending,
}: {
  host: SaasEditorHost;
  path: string;
  /** The project's declared metadata schema, driving the form beside the prose. */
  fields?: MetadataField[];
  readOnly: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
  onPending: (pending: boolean) => void;
}) {
  const { t } = useT();
  const [stored, setStored] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStored(null);
    setFailed(false);
    host
      .readStored(path)
      .then((text) => {
        if (!cancelled) setStored(text);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [host, path]);

  // One timer per mount. The editor reports every keystroke, so writing on each
  // one would be a request per character.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<string | null>(null);

  const flush = useCallback(() => {
    const next = latest.current;
    latest.current = null;
    timer.current = null;
    if (next == null) return;
    host
      .writeStored(path, next)
      .then(() => {
        onPending(false);
        onSaved();
      })
      .catch((e) => {
        onPending(false);
        onError(e instanceof Error ? e.message : String(e));
      });
  }, [host, path, onSaved, onError, onPending]);

  // Whatever is still queued when the file changes or the view closes must
  // reach the server, or the last edits before a switch are lost.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        flush();
      }
    };
  }, [flush]);

  const onSave = useCallback(
    (_p: string, next: string) => {
      latest.current = next;
      onPending(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, AUTOSAVE_MS);
    },
    [flush, onPending],
  );

  if (failed) return <Centered>{t("edit.fileNotFound")}</Centered>;
  if (stored == null) return <Centered>{t("loading")}</Centered>;
  return (
    <MarkdownEditor
      path={path}
      stored={stored}
      fields={fields}
      readOnly={readOnly}
      onSave={onSave}
    />
  );
}
