export const title = "Privacy Policy | PlainChord";

export default function PrivacyEn() {
  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <article className="w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-medium">Privacy Policy | PlainChord</h1>
          <p className="text-xs text-muted mt-1">
            Last updated: October 18, 2026
          </p>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">1. What data PlainChord collects</h2>
          <p className="text-sm">
            PlainChord&apos;s free features (chord library, glossary,
            difficulty system) don&apos;t require an account and don&apos;t
            collect personal data to work.
          </p>
          <p className="text-sm">
            If sign-in (for example, with Google) is enabled in the future to
            access premium features, only the basic information needed to
            identify the account (name and associated email) will be
            collected, and this policy will be updated before that feature is
            turned on.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">
            2. Audio (tuner and Play mode)
          </h2>
          <p className="text-sm">
            The tuner asks for microphone access only when the user
            explicitly turns it on from its window. Audio is processed
            directly in the browser (Web Audio API and the Pitchy library) to
            detect the note and tuning of the string being played; it is
            never sent to or stored on any server. When the tuner window is
            closed, PlainChord releases the microphone immediately and the
            processed audio doesn&apos;t persist anywhere PlainChord
            controls.
          </p>
          <p className="text-sm">
            The same applies to the chord library&apos;s Play mode: it asks
            for the microphone only when you press Play, recognizes the chord
            being played directly in the browser (Web Audio API and the Meyda
            library), and releases the microphone when you press Stop. The
            audio is never sent to or stored on any server.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">
            3. Content imported by the user (tabs)
          </h2>
          <p className="text-sm">
            Any tab or file the user imports into the App is treated as the
            user&apos;s personal content:
          </p>
          <ul className="text-sm list-disc pl-5 flex flex-col gap-1">
            <li>It is not shared with other users.</li>
            <li>It is not manually reviewed by PlainChord.</li>
            <li>
              During playback, the sound is generated in the browser itself;
              the tab is never sent to any server. The only thing downloaded
              is the guitar sound the player uses, and the mute preference is
              saved only in the browser.
            </li>
            <li>
              The user is responsible for that content, as detailed in the
              Terms of Service.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">
            4. Cookies, local storage and analytics
          </h2>
          <p className="text-sm">
            PlainChord doesn&apos;t use tracking cookies or analytics tools.
            It uses a single functional cookie, called &quot;lang&quot;, that
            saves the language you chose so the site shows up in that
            language on your next visit. It doesn&apos;t identify you,
            doesn&apos;t record your activity and isn&apos;t shared with
            third parties.
          </p>
          <p className="text-sm">
            PlainChord also saves some data in your own browser&apos;s
            storage (localStorage and IndexedDB): your preferences (theme,
            color palette, notation and whether sound is muted), the last
            chord progression you typed, and your history of imported tabs.
            This data never leaves your device, and you can delete it at any
            time from your browser&apos;s settings.
          </p>
          <p className="text-sm">
            If an analytics tool is added in the future (for example, basic
            Vercel analytics), this section will be updated to detail what is
            measured and whether the data is anonymous.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">5. Third-party services</h2>
          <p className="text-sm">
            PlainChord may use third-party services for its technical
            operation (for example, Vercel for hosting). These services may
            process basic technical data (such as IP addresses) under their
            own privacy policies.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">6. User rights</h2>
          <p className="text-sm">
            Users can request information about any data PlainChord may have
            associated with their account (if applicable), and request its
            deletion, by writing to example@placeholder.app.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">7. Minors</h2>
          <p className="text-sm">
            PlainChord is not specifically directed at children under 13 and
            does not knowingly collect personal data from children under that
            age.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">8. Changes to this policy</h2>
          <p className="text-sm">
            This policy may be updated as the App adds new features (for
            example, user accounts or the premium plan). Relevant changes will
            be announced within the App.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">9. Contact</h2>
          <p className="text-sm">
            For questions about this policy: example@placeholder.app
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">10. Language</h2>
          <p className="text-sm">
            This policy is available in English and Spanish. If the two
            versions differ, the English version prevails.
          </p>
        </section>

        <p className="text-xs text-muted border-t border-line pt-4">
          Note: this Policy may be updated as PlainChord adds new features
          that involve handling data (for example, user accounts). We
          recommend checking it from time to time.
        </p>
      </article>
    </div>
  );
}
