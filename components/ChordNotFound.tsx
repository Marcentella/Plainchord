import Image from "next/image";

export default function ChordNotFound({ name }: { name: string }) {
  return (
    <figure className="flex flex-col items-center gap-1 w-[110px]">
      <Image
        src="/notfound.png"
        alt="Acorde no encontrado"
        width={110}
        height={95}
        className="dark:invert opacity-60"
      />
      <figcaption className="text-sm font-medium">{name}</figcaption>
      <p className="text-xs text-muted">
        no encontrado
      </p>
    </figure>
  );
}
