import { getSiteUrl, SITE } from "@/lib/site";

export function SiteJsonLd() {
  const base = getSiteUrl().origin;
  const data = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: SITE.name,
    description: SITE.description,
    image: `${base}${SITE.logoPath}`,
    url: base,
    servesCuisine: ["Indian", "Chinese", "Continental", "Fast food"],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
