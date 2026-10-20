import { NextResponse, type NextRequest } from "next/server";
import { LANG_COOKIE } from "@/i18n/locales";
import { resolvePath } from "@/i18n/routes";

// Thin wrapper: every routing decision (which language, which slug,
// redirect vs rewrite) lives in resolvePath so it's unit tested
// (i18n/routes.test.ts) instead of only exercised in a browser.
export function proxy(request: NextRequest) {
  const result = resolvePath(
    request.nextUrl.pathname,
    request.cookies.get(LANG_COOKIE)?.value,
    request.headers.get("accept-language"),
  );
  if (result.kind === "next") return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = result.to;
  return result.kind === "redirect" ? NextResponse.redirect(url) : NextResponse.rewrite(url);
}

export const config = {
  // Skips Next internals and any path with a file extension (images,
  // the .sf2 soundfont, synth-worklet.js). soundfont/ is excluded by
  // name too: its LICENSE file has no extension and would otherwise be
  // redirected to /es/soundfont/LICENSE and 404.
  matcher: ["/((?!_next|soundfont|.*\\..*).*)"],
};
