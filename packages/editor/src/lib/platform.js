function isMac() {
  if (typeof navigator === "undefined") return false;
  if (navigator.userAgentData?.platform) {
    return navigator.userAgentData.platform === "macOS";
  }
  return /Mac|iPhone|iPod|iPad/.test(navigator.platform);
}

/**
 * Returns a human-readable shortcut label.
 * On Mac: "⌘S", "⌘⇧S". On Windows/Linux: "Ctrl+S", "Ctrl+Shift+S".
 */
export function shortcutLabel(key, { mod = false, shift = false } = {}) {
  const mac = isMac();
  const parts = [];
  if (mod) parts.push(mac ? "⌘" : "Ctrl");
  if (shift) parts.push(mac ? "⇧" : "Shift");
  parts.push(key.toUpperCase());
  return mac ? parts.join("") : parts.join("+");
}
