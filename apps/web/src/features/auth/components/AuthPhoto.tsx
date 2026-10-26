import { useLanguage } from "@/shared/i18n/LanguageContext";

/** The photo beside every account form, with the board's line across its foot. */
export function AuthPhoto({ src }: { src: string }) {
  const { t } = useLanguage();
  return (
    <figure className="auth-page__photo">
      <img src={src} alt="" className="auth-page__image" />
      <figcaption>{t("auth.photo.caption")}</figcaption>
    </figure>
  );
}
