/** Preset colors for GUI color fields. Ported from the reference. */

export const COLOR_PRESET_GROUPS = [
  {
    id: "neutral",
    label: "Gray / White",
    colors: [
      { value: "#ffffff", label: "White" },
      { value: "#f8fafc", label: "Slate 50" },
      { value: "#f5f5f4", label: "Stone 100" },
      { value: "#e5e7eb", label: "Gray 200" },
      { value: "#64748b", label: "Slate 500" },
      { value: "#334155", label: "Slate 700" },
      { value: "#111827", label: "Gray 900" },
    ],
  },
  {
    id: "blue",
    label: "Blue",
    colors: [
      { value: "#eff6ff", label: "Blue 50" },
      { value: "#dbeafe", label: "Blue 100" },
      { value: "#e0e7ff", label: "Indigo 100" },
      { value: "#1e40af", label: "Blue 800" },
      { value: "#2563eb", label: "Blue 600" },
      { value: "#4f46e5", label: "Indigo 600" },
    ],
  },
  {
    id: "green",
    label: "Green",
    colors: [
      { value: "#f0fdf4", label: "Green 50" },
      { value: "#dcfce7", label: "Green 100" },
      { value: "#166534", label: "Green 800" },
      { value: "#16a34a", label: "Green 600" },
    ],
  },
  {
    id: "red",
    label: "Red / Orange",
    colors: [
      { value: "#fee2e2", label: "Red 100" },
      { value: "#ffedd5", label: "Orange 100" },
      { value: "#991b1b", label: "Red 800" },
      { value: "#dc2626", label: "Red 600" },
      { value: "#c2410c", label: "Orange 700" },
    ],
  },
  {
    id: "purple",
    label: "Purple",
    colors: [
      { value: "#faf5ff", label: "Purple 50" },
      { value: "#f3e8ff", label: "Purple 100" },
      { value: "#6b21a8", label: "Purple 800" },
      { value: "#9333ea", label: "Purple 600" },
    ],
  },
  {
    id: "amber",
    label: "Amber",
    colors: [
      { value: "#fffbeb", label: "Amber 50" },
      { value: "#fef3c7", label: "Amber 100" },
      { value: "#92400e", label: "Amber 800" },
    ],
  },
];

export function normalizeHexColor(value) {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return null;
}

export function findMatchingPresetValue(value) {
  const normalized = normalizeHexColor(value);
  if (!normalized) return "";
  for (const group of COLOR_PRESET_GROUPS) {
    for (const color of group.colors) {
      if (normalizeHexColor(color.value) === normalized) return color.value;
    }
  }
  return "";
}
