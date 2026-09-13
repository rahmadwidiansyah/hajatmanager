import Image from "next/image";

export function BrandMark({ size = 28, priority = false }: { size?: number; priority?: boolean }) {
  return (
    <Image
      src="/app-icon.webp"
      alt="HajatManager"
      width={size}
      height={size}
      priority={priority}
      className="rounded-lg object-cover shrink-0"
      style={{ width: size, height: size }}
    />
  );
}
