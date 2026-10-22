"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/**
 * The before-first-paint theme script, rendered only where it can run: the
 * server HTML (and the hydration pass that adopts it, via the `true`
 * server snapshot). Switching /es <-> /en re-renders the root layout on the
 * client, and a <script> created there never executes — React 19 warns
 * about it ("Encountered a script tag…"). ThemeSync already covers that
 * case, so client renders simply leave it out.
 *
 * Not next/script's beforeInteractive: an inline script with that strategy
 * is queued for Next's runtime instead of running inline, i.e. after the
 * first paint, which would flash the wrong theme on every load.
 */
export default function ThemeInitScript({ code }: { code: string }) {
  const serverPass = useSyncExternalStore(noSubscribe, () => false, () => true);
  return serverPass ? <script dangerouslySetInnerHTML={{ __html: code }} /> : null;
}
