export function formatLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  return `[old] ${normalized}`;
}
