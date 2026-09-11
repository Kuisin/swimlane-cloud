/**
 * A small debounce/flush scheduler for autosave: `schedule()` (re)starts the
 * timer; `flush()` runs `run` immediately, used on unmount, closing a tab, or
 * a manual save shortcut. A standalone pure module so it is unit-testable
 * without mounting the editor.
 */
export function createFlushScheduler({ delay, run }) {
  let timer = null;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /** (Re)start the debounce timer; a pending run is cancelled and rescheduled. */
  function schedule() {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delay);
  }

  /** Cancel any pending timer and run immediately. */
  async function flush() {
    clearTimer();
    await run();
  }

  /** Cancel any pending timer without running. */
  function cancel() {
    clearTimer();
  }

  return { schedule, flush, cancel };
}
