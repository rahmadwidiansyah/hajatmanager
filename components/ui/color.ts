// M3 Expressive — single source untuk peran warna agar colorful tapi konsisten.
// Jangan tulis hex manual di komponen; pakai helper ini.

export type RoleKind = "OWNER" | "ADMIN" | "VIEWER" | string;
export type MethodKind = "AMPLOP" | "CASH" | "QRIS" | "TRANSFER" | "BARANG" | string;

const base =
  "border border-[var(--outline-variant)]";

export function roleChipClass(role: RoleKind): string {
  if (role === "OWNER")
    return `bg-[var(--primary-container)] text-[var(--on-primary-container)] ${base}`;
  if (role === "ADMIN")
    return `bg-[var(--warning-container)] text-[var(--on-warning-container)] ${base}`;
  return `bg-[var(--surface-container)] text-[var(--on-surface-variant)] ${base}`;
}

export function methodChipClass(method: MethodKind): string {
  if (method === "AMPLOP" || method === "CASH")
    return `bg-[var(--primary-container)] text-[var(--on-primary-container)] ${base}`;
  if (method === "QRIS")
    return `bg-[var(--tertiary-container)] text-[var(--on-tertiary-container)] ${base}`;
  if (method === "TRANSFER")
    return `bg-[var(--surface-container-high)] text-[var(--on-surface-variant)] ${base}`;
  // BARANG / lainnya — netral dashed
  return `bg-[var(--surface-container)] text-[var(--on-surface-variant)] ${base} border-dashed`;
}

export function methodDotClass(method: MethodKind): string {
  if (method === "AMPLOP" || method === "CASH") return "bg-[var(--primary)]";
  if (method === "QRIS") return "bg-[var(--tertiary)]";
  if (method === "TRANSFER") return "bg-[var(--warning)]";
  return "bg-[var(--outline)]";
}
