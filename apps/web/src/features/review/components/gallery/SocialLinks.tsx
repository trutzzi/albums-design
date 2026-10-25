import type { ClientStyle } from "@albumflow/contracts";
import { useLanguage } from "@/shared/i18n/LanguageContext";

const NETWORKS = ["instagram", "facebook", "tiktok"] as const;

/** Simple outline marks, drawn in the text colour so they suit every gallery theme. */
const ICONS: Record<(typeof NETWORKS)[number], string> = {
  instagram:
    "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.5-1.5h.01",
  facebook:
    "M14 21v-8h3l.5-3.5H14V7.5c0-1 .3-1.6 1.7-1.6H17.6V2.8A24 24 0 0 0 15 2.6c-2.6 0-4.3 1.6-4.3 4.5v2.4H7.8V13h2.9v8",
  tiktok: "M14 3v12.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.4 2.6 2.2 4.3 5 4.6",
};

/** The studio's social profiles as a row of links; nothing when it has none. */
export function SocialLinks({ social }: { social: ClientStyle["social"] }) {
  const { t } = useLanguage();
  const links = NETWORKS.filter((network) => social[network]);
  if (links.length === 0) return null;
  return (
    <ul className="social-links">
      {links.map((network) => (
        <li key={network}>
          <a href={social[network]!} target="_blank" rel="noopener noreferrer" aria-label={t(`social.${network}`)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d={ICONS[network]}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
