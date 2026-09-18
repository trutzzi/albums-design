import { useLanguage } from "../../lib/i18n/LanguageContext";
import { CHANGELOG_RELEASES } from "./changelog-data";

export function ChangelogPage() {
  const { t } = useLanguage();

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>{t("changelog.title")}</h1>
          <p className="muted">{t("changelog.subtitle")}</p>
        </div>
      </header>

      {CHANGELOG_RELEASES.map((release) => (
        <section key={`${release.date}-${release.headingKey}`} className="panel changelog-release">
          <div className="panel__head">
            <h2>{t(release.headingKey)}</h2>
            <p className="muted">{release.date}</p>
          </div>
          <ul className="changelog-items">
            {release.items.map((item) => (
              <li key={item.titleKey} className="changelog-item">
                <h3>{t(item.titleKey)}</h3>
                <p>{t(item.descriptionKey)}</p>
                <p className="changelog-item__how">
                  <strong>{t("changelog.howToUse")}</strong> {t(item.howToKey)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
