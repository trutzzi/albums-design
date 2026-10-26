import type { ProjectType } from "@albumflow/contracts";

/** Every kind of shoot, with its label: the new-shoot form, the cards and the shoot page agree. */
export const SHOOT_TYPES: { value: ProjectType; labelKey: string }[] = [
  { value: "WEDDING", labelKey: "projects.new.type.wedding" },
  { value: "BAPTISM", labelKey: "projects.new.type.baptism" },
  { value: "EVENT", labelKey: "projects.new.type.event" },
];

/** The label key for a type; an unknown one falls back to the type itself. */
export function shootTypeKey(type: ProjectType): string {
  return SHOOT_TYPES.find((option) => option.value === type)?.labelKey ?? type;
}
