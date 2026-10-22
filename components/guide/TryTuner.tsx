"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import TunerModal from "@/components/TunerModal";
import { useT } from "@/i18n/LocaleProvider";

// The tuner is a modal (NavMenu opens it too), not a page, so the tuning
// article's "try it" is a button rather than a link like the others.
export default function TryTuner({ className }: { className: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        {t("guide.tryTuner")}
        <ArrowRight size={14} aria-hidden />
      </button>
      <TunerModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
