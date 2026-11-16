import Link from "next/link";
import LandingCompare from "@/components/LandingCompare";
import LandingHero from "@/components/LandingHero";
import LandingSteps from "@/components/LandingSteps";
import { getT } from "@/i18n";
import type { TKey } from "@/i18n/t";
import type { Locale } from "@/i18n/locales";
import { alternates, href } from "@/i18n/routes";

// A calm hero that answers a progression; then the clutter other apps add,
// shown against PlainChord on a slider; the suggested path; one way into the
// library. Every visual is a real component or the real difficulty data.

// What the slider takes away, said plainly.
const LEFT_OUT: TKey[] = ["landing.leftOut1", "landing.leftOut2", "landing.leftOut3"];

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
        {/* Phones stack heading, slider, list; from lg the slider sits beside both. */}
        <section className="grid min-h-svh content-center gap-12 py-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-x-20">
          <div className="flex max-w-2xl flex-col gap-4">
            <h2 className="text-balance text-[1.875rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.5rem]">{t("landing.leftOutTitle")}</h2>
            <p className="text-pretty text-lg leading-relaxed text-muted">{t("landing.leftOutBody")}</p>
          </div>
          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
            <LandingCompare />
          </div>
          <ul className="flex max-w-md flex-col">
            {LEFT_OUT.map((key) => (
              <li key={key} className="border-t border-line py-5 text-2xl font-medium tracking-tight last:border-b">
                {t(key)}
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
