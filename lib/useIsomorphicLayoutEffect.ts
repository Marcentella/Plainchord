import { useEffect, useLayoutEffect } from "react";

// Next.js server-renders "use client" components too, and useLayoutEffect
// logs a warning when it runs during SSR (there's no DOM to act on yet
// there) — falls back to plain useEffect on the server, where neither
// actually does anything before the client takes over anyway. Standard
// pattern (Framer Motion, Redux, etc. ship the same helper) for exactly this
// "sync client-only state without a visible flash" case: it runs before the
// browser paints the hydrated commit, so restoring a saved value different
// from the hardcoded default lands in that SAME paint instead of a separate,
// later one that would visibly resize/shift the page after it already
// looked settled.
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;
