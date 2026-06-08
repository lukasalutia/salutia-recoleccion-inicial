import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Salutia — Recolección inicial de documentos",
  description: "Conectá tus fuentes y dejá que Salutia encuentre tus documentos médicos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${poppins.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-[#fafafa] text-[#333333]">
        {children}
      </body>
    </html>
  );
}
