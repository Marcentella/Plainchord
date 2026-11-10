import Link from "next/link";
import LandingHero from "@/components/LandingHero";
import LandingSteps from "@/components/LandingSteps";
import { getT } from "@/i18n";
import type { TKey } from "@/i18n/t";
import type { Locale } from "@/i18n/locales";
import { alternates, href } from "@/i18n/routes";

// "Noise to quiet": the hero opens on the
// clutter beginners know and dissolves it on scroll; below it, what fell
// away, the suggested path, and one way into the library. Every visual is a
// real component or the real difficulty data.

// Each thing left out, paired with the clutter card it stands for in the hero.
const LEFT_OUT: [TKey, TKey][] = [
  ["landing.leftOut1", "landing.noise9"],
  ["landing.leftOut2", "landing.noise3"],
  ["landing.leftOut3", "landing.noise1"],
  ["landing.leftOut4", "landing.noise12"],
];

export async function generateMetadata({ params }: PageProps<"/[lang]">) {
  return { alternates: alternates("home", (await params).lang as Locale) };
}

export default async function Landing({ params }: PageProps<"/[lang]">) {
  // The layout already 404s anything that isn't a known locale.
  const lang = (await params).lang as Locale;
  const t = getT(lang);
  return (
    <>
      <LandingHero />

      <div className="mx-auto flex w-full max-w-6xl flex-col px-6">
        <section className="grid min-h-svh content-start gap-12 py-28 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-20">
          <div className="flex flex-col gap-4">
            <h2 className="text-balance text-[1.875rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.5rem]">{t("landing.leftOutTitle")}</h2>
            <p className="text-pretty text-lg leading-relaxed text-muted">{t("landing.leftOutBody")}</p>
          </div>
          <ul className="flex flex-col">
            {LEFT_OUT.map(([plain, noise]) => (
              <li key={plain} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-8 gap-y-3 border-b border-line py-9">
                <span className="text-balance text-xl tracking-tight sm:text-[1.75rem]">{t(plain)}</span>
                <span aria-hidden className="landing-noise-card landing-noise-card--struck">
                  {t(noise)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex min-h-svh flex-col gap-12 py-28">
          <div className="flex max-w-2xl flex-col gap-4">
            <h2 className="text-balance text-[1.875rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.5rem]">{t("landing.pathTitle")}</h2>
            <p className="text-pretty text-lg leading-relaxed text-muted">{t("landing.pathIntro")}</p>
          </div>
          <LandingSteps />
        </section>

        <section className="flex min-h-[70svh] flex-col items-start gap-6 py-28">
          <h2 className="max-w-3xl text-balance text-[1.875rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.5rem]">{t("landing.closeTitle")}</h2>
          <p className="text-lg text-muted">{t("landing.closeBody")}</p>
          <Link
            href={href("chords", lang)}
            className="mt-2 rounded-xl bg-accent px-6 py-4 text-lg font-medium text-dot-text transition hover-fine:-translate-y-px active:scale-[0.97] duration-[160ms] ease-out"
          >
            {t("landing.cta")}
          </Link>
        </section>
      </div>
    </>
  );
}
