import { useLanguage } from "@/shared/i18n/LanguageContext";
import { ALL_CLIENTS, picksOf, type ClientSelection } from "@/shared/lib/client-picks";

/**
 * Whose picks are marked: everyone's, or one client's. Shown only once more than one client
 * has sent a selection; with a single one there is nothing to choose.
 */
export function ClientPicksSelect({
  selections,
  value,
  onChange,
  className,
}: {
  selections: readonly ClientSelection[];
  value: string;
  onChange: (sessionId: string) => void;
  className?: string;
}) {
  const { t } = useLanguage();
  if (selections.length < 2) return null;
  const current = selections.some((selection) => selection.sessionId === value) ? value : ALL_CLIENTS;
  return (
    <label className={`client-picks-select ${className ?? ""}`}>
      {t("picks.from")}{" "}
      <select value={current} onChange={(event) => onChange(event.target.value)}>
        <option value={ALL_CLIENTS}>{t("picks.allClients", { count: picksOf(selections, ALL_CLIENTS).size })}</option>
        {selections.map((selection, index) => (
          <option key={selection.sessionId} value={selection.sessionId}>
            {t("picks.oneClient", {
              name: selection.clientName || t("picks.unnamedClient", { number: index + 1 }),
              count: selection.photoIds.length,
            })}
          </option>
        ))}
      </select>
    </label>
  );
}
