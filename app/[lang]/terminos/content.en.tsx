export const title = "Terms of Service | PlainChord";

export default function TermsEn() {
  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <article className="w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-medium">Terms of Service | PlainChord</h1>
          <p className="text-xs text-muted mt-1">
            Last updated: October 18, 2026
          </p>
        </div>

        <p className="text-sm">
          These Terms of Service (&quot;Terms&quot;) govern your use of
          PlainChord (&quot;the App&quot;, &quot;the Service&quot;). By using
          the App, you accept these Terms.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">1. Description of the service</h2>
          <p className="text-sm">
            PlainChord is a visual reference tool for learning guitar. It lets
            you browse a chord library and a glossary of technical notation,
            and see how difficult the transitions between chords are.
            PlainChord also lets you import and view tabs provided by the user
            themselves.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">
            2. Content imported by the user
          </h2>
          <p className="text-sm">
            PlainChord does not provide, host, index or distribute tabs of
            copyrighted songs.
          </p>
          <ul className="text-sm list-disc pl-5 flex flex-col gap-1">
            <li>
              Any tab, file or content the user imports into the App is
              provided voluntarily by the user, for their personal use.
            </li>
            <li>
              The user is solely responsible for making sure they have the
              legal right to use and view that content.
            </li>
            <li>
              Imported content is processed locally and is not shared with
              other users or stored on PlainChord servers for distribution.
            </li>
            <li>
              PlainChord does not review or verify, and is not responsible
              for, the origin or legality of content imported by users.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">3. Acceptable use</h2>
          <p className="text-sm">
            The user agrees not to use PlainChord to:
          </p>
          <ul className="text-sm list-disc pl-5 flex flex-col gap-1">
            <li>
              Distribute, share or publish copyrighted content without
              authorization.
            </li>
            <li>
              Attempt to use the App as a means of facilitating the
              infringement of third parties&apos; copyright.
            </li>
            <li>
              Reverse engineer, scrape, or make unauthorized automated use of
              the Service.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">4. Free and premium plans</h2>
          <p className="text-sm">
            Features described as the &quot;Free plan&quot; are available at
            no cost. Features marked &quot;Premium (coming soon)&quot; are not
            currently available and are not charged for; their future
            availability and terms will be announced in due course.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">5. No warranties</h2>
          <p className="text-sm">
            The App is provided &quot;as is&quot;. PlainChord does not
            guarantee that the information (chord diagrams, notation,
            difficulty ratings, or audio chord detection results) is 100%
            accurate in every case, especially in components marked as
            exploratory or in development (R&amp;D).
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">
            6. Limitation of liability
          </h2>
          <p className="text-sm">
            To the extent permitted by law, PlainChord and its developer will
            not be liable for damages arising from use of the Service,
            including but not limited to content imported by the user.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">7. Changes to these Terms</h2>
          <p className="text-sm">
            These Terms may be updated. Continued use of the App after an
            update constitutes acceptance of the new Terms.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">8. Third-party credits</h2>
          <p className="text-sm">
            Tab playback uses the guitar sounds from the Fluid R3 GM
            SoundFont, © 2000-2002, 2008 Frank Wen and © 2008 Toby Smithe,
            distributed under the{" "}
            <a href="/soundfont/LICENSE" className="text-accent underline">
              MIT license
            </a>
            . PlainChord includes a modified version: only the guitar sounds,
            converted to mono.
          </p>
          <p className="text-sm">
            Guitar Pro file import and audio synthesis use{" "}
            <a href="https://github.com/CoderLine/alphaTab" className="text-accent underline">
              alphaTab
            </a>{" "}
            by CoderLine, distributed under the Mozilla Public License 2.0.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">9. Contact</h2>
          <p className="text-sm">
            For questions about these Terms: example@placeholder.app
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">10. Language</h2>
          <p className="text-sm">
            These Terms are available in English and Spanish. If the two
            versions differ, the English version prevails.
          </p>
        </section>

        <p className="text-xs text-muted border-t border-line pt-4">
          Note: these Terms may be updated as PlainChord adds new features
          (for example, user accounts or payments). We recommend checking
          them from time to time.
        </p>
      </article>
    </div>
  );
}
