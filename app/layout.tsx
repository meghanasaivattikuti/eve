import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_URL } from "./site";
import "./globals.css";

const DESCRIPTION = "Check whether a website is readable by AI agents and crawlers, and audit its SEO and security header fundamentals.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "CrawlSpace",
  description: DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "CrawlSpace",
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "CrawlSpace",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "CrawlSpace",
    description: DESCRIPTION,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "CrawlSpace",
  description: DESCRIPTION,
  url: SITE_URL,
  applicationCategory: "DeveloperApplication",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
