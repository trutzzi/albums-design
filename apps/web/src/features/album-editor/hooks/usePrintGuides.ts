import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listPrintProfiles } from "@/shared/api";

/** Never a real print profile's id — those come from the server's PRINT_PROFILES list. */
export const CUSTOM_PROFILE_ID = "custom";

/**
 * The trim and safe-area guides drawn over spreads, and the print profile whose bleed and
 * margin they come from: one of the server's profiles, or a custom one.
 */
export function usePrintGuides() {
  const [show, setShow] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [customBleedMm, setCustomBleedMm] = useState(3);
  const [customSafeMarginMm, setCustomSafeMarginMm] = useState(5);
  const profiles = useQuery({ queryKey: ["print-profiles"], queryFn: listPrintProfiles });

  const customProfile = {
    id: CUSTOM_PROFILE_ID,
    name: "Custom",
    dpi: 300,
    bleedMm: customBleedMm,
    safeMarginMm: customSafeMarginMm,
    drawTrimMarks: true,
  };
  const selected =
    profileId === CUSTOM_PROFILE_ID
      ? customProfile
      : (profiles.data?.find((profile) => profile.id === profileId) ?? profiles.data?.[0]);

  return {
    show,
    setShow,
    modalOpen,
    setModalOpen,
    profileId,
    setProfileId,
    customBleedMm,
    setCustomBleedMm,
    customSafeMarginMm,
    setCustomSafeMarginMm,
    profiles,
    selected,
  };
}

export type PrintGuides = ReturnType<typeof usePrintGuides>;
