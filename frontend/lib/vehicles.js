export const KIND_LABEL = { car: "Car", suv: "SUV", van: "Van", traveller: "Tempo Traveller", mini_bus: "Mini bus", bus: "Bus" };
export const KINDS = Object.entries(KIND_LABEL);

// With a text function t (from getT or useLang) the line is in the visitor's language; without it, English for the host pages.
export const kindName = (kind, t) => (t && KIND_LABEL[kind] ? t(`veh.kind.${kind}`) : KIND_LABEL[kind] || kind);

export function vehicleLine(v, t) {
  if (t) return t("veh.line", { kind: kindName(v.kind, t), seats: v.seats, ac: t(v.ac ? "veh.ac" : "veh.nonac"), city: v.city });
  return `${KIND_LABEL[v.kind] || v.kind} · ${v.seats} seats · ${v.ac ? "AC" : "Non-AC"} · ${v.city}`;
}
