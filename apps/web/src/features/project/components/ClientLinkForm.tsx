import { tip } from "@/shared/lib/tip";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import type { ClientContact } from "@/features/project/hooks/useClientContact";

/**
 * The form behind every client link a shoot sends — a selection link, a download link: the
 * client's name, one setting of the link's own, and whether to email it. Ids are prefixed
 * per link kind so labels stay tied to their fields when two forms share a page.
 */
export function ClientLinkForm(props: {
  idPrefix: string;
  nameLabel: string;
  name: string;
  onNameChange: (name: string) => void;
  /** The link's own setting: how many photos a client may pick, how many days a download lasts. */
  setting: { label: string; value: string; onChange: (value: string) => void; min: number; max?: number };
  submit: { label: string; pendingLabel: string; tip: string; pending: boolean; onSubmit: () => void };
  contact: ClientContact;
  sendEmail: boolean;
  onSendEmailChange: (send: boolean) => void;
  /** Present once the shoot already has links, so the form can be folded away again. */
  onCancel?: (() => void) | undefined;
}) {
  const { t } = useLanguage();
  const { idPrefix, contact } = props;
  return (
    <div className="link-form">
      <div className="pick-create">
        <div className="field">
          <label htmlFor={`${idPrefix}-client-name`}>{props.nameLabel}</label>
          <input id={`${idPrefix}-client-name`} value={props.name} onChange={(event) => props.onNameChange(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-setting`}>{props.setting.label}</label>
          <input
            id={`${idPrefix}-setting`}
            type="number"
            min={props.setting.min}
            {...(props.setting.max !== undefined ? { max: props.setting.max } : {})}
            value={props.setting.value}
            onChange={(event) => props.setting.onChange(event.target.value)}
          />
        </div>
        <button
          type="button"
          className="button button--primary"
          disabled={props.submit.pending}
          onClick={props.submit.onSubmit}
          {...tip(props.submit.tip)}
        >
          {props.submit.pending ? props.submit.pendingLabel : props.submit.label}
        </button>
      </div>
      <div className="client-invite">
        <div className="field">
          <label htmlFor={`${idPrefix}-client-email`}>{t("client.email")}</label>
          <input
            id={`${idPrefix}-client-email`}
            type="email"
            value={contact.email}
            placeholder={t("client.email.placeholder")}
            onChange={(event) => contact.setEmail(event.target.value)}
          />
        </div>
        <label>
          <input
            type="checkbox"
            checked={props.sendEmail}
            disabled={!contact.email}
            onChange={(event) => props.onSendEmailChange(event.target.checked)}
          />
          {t("client.sendEmail")}
        </label>
        <select
          value={contact.emailLanguage}
          aria-label={t("client.emailLanguage")}
          onChange={(event) => contact.setEmailLanguage(event.target.value as "en" | "ro")}
        >
          <option value="en">English</option>
          <option value="ro">Română</option>
        </select>
      </div>
      {props.onCancel && (
        <button type="button" className="button button--small" onClick={props.onCancel}>
          {t("common.cancel")}
        </button>
      )}
    </div>
  );
}
