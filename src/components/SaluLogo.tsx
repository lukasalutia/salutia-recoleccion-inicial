import Image from "next/image";

export default function SaluLogo() {
  return (
    <Image
      src="/salutia-logo.png"
      alt="Salutia"
      width={32}
      height={32}
      className="rounded-full"
      priority
    />
  );
}
