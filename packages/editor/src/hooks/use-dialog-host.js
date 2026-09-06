import { useCallback, useRef, useState } from "react";

/**
 * Queues a single alert/confirm/prompt request at a time and exposes it as
 * plain state a `<DialogHost>` can render as a themed modal, instead of the
 * browser's native (unstyled, disabled-in-some-webviews) dialogs. Every
 * editor call site already goes through `dialog.alert/confirm/prompt` and
 * awaits the result before issuing another, so one in-flight request is
 * always enough — no queue beyond that is needed.
 *
 * Return-value semantics intentionally match `window.alert/confirm/prompt`
 * exactly: `confirm` resolves `false` on cancel, `prompt` resolves `null`
 * (not `undefined`/`""`) on cancel — callers rely on `== null` to detect a
 * cancelled prompt.
 */
export function useDialogHost() {
  const [request, setRequest] = useState(null); // { kind, message, defaultValue } | null
  const resolverRef = useRef(null);

  const open = useCallback((kind, message, defaultValue) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setRequest({ kind, message, defaultValue });
    });
  }, []);

  const dialogs = useRef({
    alert: (message) => open("alert", message),
    confirm: (message) => open("confirm", message),
    prompt: (message, defaultValue = "") => open("prompt", message, defaultValue),
  }).current;

  function settle(value) {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(value);
  }

  function handleOk(value) {
    if (request?.kind === "prompt") settle(value);
    else if (request?.kind === "confirm") settle(true);
    else settle(undefined); // alert
  }

  function handleCancel() {
    if (request?.kind === "prompt") settle(null);
    else if (request?.kind === "confirm") settle(false);
    else settle(undefined); // alert has no cancel state to distinguish
  }

  return { request, dialogs, handleOk, handleCancel };
}
