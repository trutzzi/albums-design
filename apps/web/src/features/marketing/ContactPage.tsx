import { useLanguage } from "../../lib/i18n/LanguageContext";

const CONTACT_EMAIL = "contact@valentintruta.ro";

export function ContactPage() {
  const { t } = useLanguage();

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>{t("contact.title")}</h1>
          <p className="muted">{t("contact.subtitle")}</p>
        </div>
      </header>

      <section className="panel contact-panel">
        <p>{t("contact.body")}</p>
        <a href={`mailto:${CONTACT_EMAIL}`} className="button button--primary">
          {CONTACT_EMAIL}
        </a>
      </section>
    </div>
  );
}
