import type { GlossaryEntry } from "@/lib/glossary";
import PositionAnimation from "@/components/PositionAnimation";
import DistortionAnimation from "@/components/DistortionAnimation";
import MarkerAnimation from "@/components/MarkerAnimation";
import { t } from "@/i18n";

/**
 * Symbol, name, matching animation (if the entry has one), definición and
 * ejecución for one glossary entry. Extracted from app/glosario/page.tsx so
 * the tab renderer's hover/tap popup (components/TechniquePopup.tsx) can
 * show the exact same content instead of a second copy.
 */
export default function GlossaryEntryDetail({ entry }: { entry: GlossaryEntry }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <span className="font-mono text-accent">{entry.symbol}</span>
        {entry.name}
      </h2>
      {entry.visualType === "posicion" && (
        <div className="flex justify-center">
          <PositionAnimation visual={entry.visual} />
        </div>
      )}
      {entry.visualType === "distorsion" && (
        <div className="flex justify-center">
          <DistortionAnimation visual={entry.visual} />
        </div>
      )}
      {entry.visualType === "marcador" && (
        <div className="flex justify-center">
          <MarkerAnimation visual={entry.visual} />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{t("glossary.definitionHeading")}</h3>
        <p className="text-sm">{entry.definicion}</p>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{t("glossary.executionHeading")}</h3>
        <p className="text-sm">{entry.ejecucion}</p>
      </div>
    </div>
  );
}
