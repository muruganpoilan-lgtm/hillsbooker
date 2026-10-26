export const KIND_LABEL = { car: "Car", suv: "SUV", van: "Van", traveller: "Tempo Traveller", mini_bus: "Mini bus", bus: "Bus" };
export const KINDS = Object.entries(KIND_LABEL);

export function vehicleLine(v) {
  return `${KIND_LABEL[v.kind] || v.kind} · ${v.seats} seats · ${v.ac ? "AC" : "Non-AC"} · ${v.city}`;
}
