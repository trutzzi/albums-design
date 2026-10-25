import type { ClientStyle } from "@albumflow/contracts";
import { useLanguage } from "@/shared/i18n/LanguageContext";

const NETWORKS = ["instagram", "facebook", "tiktok"] as const;

/** The studio's social profiles as a row of links; nothing when it has none. */
export function SocialLinks({ social }: { social: ClientStyle["social"] }) {
  const { t } = useLanguage();
  const links = NETWORKS.filter((network) => social[network]);
  if (links.length === 0) return null;
  return (
    <ul className="social-links">
      {links.map((network) => (
        <li key={network}>
          <a href={social[network]!} target="_blank" rel="noopener noreferrer">
            {t(`social.${network}`)}
          </a>
        </li>
      ))}
    </ul>
  );
}
