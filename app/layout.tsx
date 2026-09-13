import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import PalettePicker from "@/components/PalettePicker";
import Footer from "@/components/Footer";
import { t } from "@/i18n";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Omnifret",
  description: "Aprendizaje visual de guitarra: acordes, notación y dificultad de transición, en una sola pantalla.",
};

// Sets the .dark class and the chosen palette's data-theme before first
// paint so there's no flash of the wrong theme/palette. Any non-empty
// palette value gets applied as-is (not just "salmon") — azul is never
// stored (represented by the attribute's absence), so this stays correct
// as more palettes are added, no future edit needed here.
const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);var p=localStorage.getItem('palette');if(p)document.documentElement.setAttribute('data-theme',p);}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <header className="flex items-center justify-between px-6 py-4">
          <Image
            src="/logo.png"
            alt="Omnifret"
            width={150}
            height={54}
            className="dark:invert h-9 w-auto"
            priority
          />
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="transition-colors hover-fine:text-accent">
              {t("nav.chords")}
            </Link>
            <Link href="/glosario" className="transition-colors hover-fine:text-accent">
              {t("nav.glossary")}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <PalettePicker />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
