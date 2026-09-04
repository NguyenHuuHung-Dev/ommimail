import { useEffect } from "react";

const SITE_URL = "https://omnimail.io.vn";

type SeoProps = {
  title: string;
  description: string;
  path?: string;
  noIndex?: boolean;
  schema?: Record<string, unknown>;
};

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) =>
    element!.setAttribute(name, value),
  );
}

export function Seo({
  title,
  description,
  path = "/",
  noIndex = false,
  schema,
}: SeoProps) {
  useEffect(() => {
    const canonicalUrl = new URL(path, SITE_URL).toString();
    document.title = title;
    document.documentElement.lang = "vi";

    upsertMeta('meta[name="description"]', {
      name: "description",
      content: description,
    });
    upsertMeta('meta[name="robots"]', {
      name: "robots",
      content: noIndex
        ? "noindex, nofollow"
        : "index, follow, max-image-preview:large",
    });
    upsertMeta('meta[property="og:title"]', {
      property: "og:title",
      content: title,
    });
    upsertMeta('meta[property="og:description"]', {
      property: "og:description",
      content: description,
    });
    upsertMeta('meta[property="og:type"]', {
      property: "og:type",
      content: "website",
    });
    upsertMeta('meta[property="og:locale"]', {
      property: "og:locale",
      content: "vi_VN",
    });
    upsertMeta('meta[property="og:url"]', {
      property: "og:url",
      content: canonicalUrl,
    });
    upsertMeta('meta[property="og:image"]', {
      property: "og:image",
      content: `${SITE_URL}/og.png`,
    });
    upsertMeta('meta[property="og:image:width"]', {
      property: "og:image:width",
      content: "1200",
    });
    upsertMeta('meta[property="og:image:height"]', {
      property: "og:image:height",
      content: "630",
    });
    upsertMeta('meta[name="twitter:card"]', {
      name: "twitter:card",
      content: "summary_large_image",
    });

    let canonical = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (noIndex) {
      canonical?.remove();
    } else {
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;
    }

    const schemaId = "omnimail-structured-data";
    document.getElementById(schemaId)?.remove();
    if (schema && !noIndex) {
      const script = document.createElement("script");
      script.id = schemaId;
      script.type = "application/ld+json";
      script.text = JSON.stringify(schema);
      document.head.appendChild(script);
    }
  }, [description, noIndex, path, schema, title]);

  return null;
}

export const omnimailSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "OmniMail",
  url: SITE_URL,
  applicationCategory: "CommunicationApplication",
  operatingSystem: "Web",
  inLanguage: ["vi", "en"],
  description:
    "Không gian quản lý Gmail, Outlook và email tạm thời trong một giao diện tập trung.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "VND",
  },
};
