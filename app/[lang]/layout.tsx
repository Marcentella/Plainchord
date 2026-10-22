import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import NavMenu from "@/components/NavMenu";
import ThemeToggle from "@/components/ThemeToggle";
import PreferencesMenu from "@/components/PreferencesMenu";
import Footer from "@/components/Footer";
import ThemeSync from "@/components/ThemeSync";
import ThemeInitScript from "@/components/ThemeInitScript";
import { applyStoredTheme } from "@/lib/applyStoredTheme";
import { getDictionary, getT } from "@/i18n";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { SITE_URL } from "@/lib/siteUrl";
import { LOCALES, hasLocale } from "@/i18n/locales";
import { href } from "@/i18n/routes";
import { notFound } from "next/navigation";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return {
    metadataBase: new URL(SITE_URL),
    title: "PlainChord",
    description: getT(lang)("meta.description"),
  };
}

// Sets the .dark class and the chosen palette's data-theme before first
// paint so there's no flash of the wrong theme/palette. The function is
// stringified so the same code also runs from ThemeSync after a language
// switch (see lib/applyStoredTheme.ts).
const themeInitScript = `(${applyStoredTheme.toString()})();`;

// Both languages are prebuilt at build time; any other first segment is a
// 404 rather than a render (proxy.ts already redirects anything without a
// locale prefix, so this only guards direct hits like /fr).
export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeInitScript code={themeInitScript} />
      </head>
      {/* suppressHydrationWarning here too (not just <html>): some browser
          extensions (e.g. asbplayer) inject a class/attribute onto <body>
          itself before React hydrates, which otherwise throws a hydration
          mismatch that's really the extension, not app state. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <LocaleProvider dict={getDictionary(lang)}>
        <ThemeSync />
        {/* Sticky so the page scrolls under it. The glass lives on its own
            layer rather than on <header> itself: backdrop-filter makes an
            element the containing block for position:fixed descendants,
            which would trap NavMenu/PreferencesMenu's popovers inside the
            header's box. The mask fades blur and tint out together, top to
            bottom, so there's no hard edge where the header ends. */}
        <header className="sticky top-0 z-40 flex items-center justify-between px-6 py-4">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-white/20 backdrop-blur-[3px] [mask-image:linear-gradient(to_bottom,black_30%,transparent)] dark:bg-white/5"
          />
          {/* Plain text, not an image — the wordmark has no illustration
              right now (temporary, until the new mark is designed). Using
              text-foreground instead of an exported PNG means it already
              tracks every theme AND every color palette automatically
              (same mechanism as all body text), with no invert-filter
              hack, no light/dark image pair, and no re-export step: a
              future rename or restyle is a one-line text/class edit here,
              not a design-and-export round trip. If a real illustrated
              mark replaces this later, prefer an inline SVG with
              fill="currentColor" over a raster image for the same reason
              — see ChordDiagram.tsx for the existing pattern. */}
          <Link
            href={href("home", lang)}
            className="text-2xl font-semibold tracking-tight text-foreground transition-colors hover-fine:text-accent"
          >
            PlainChord
          </Link>
          <div className="flex items-center gap-2">
            <NavMenu />
            <PreferencesMenu />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <Footer locale={lang} />
        </LocaleProvider>
      </body>
    </html>
  );
}
