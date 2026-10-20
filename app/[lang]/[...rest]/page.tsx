import { notFound } from "next/navigation";

// Any path inside a locale that no route matches ("/es/nope") lands here,
// so the visitor gets app/[lang]/not-found.tsx in their own language
// instead of Next's bare default 404.
export default function CatchAll() {
  notFound();
}
