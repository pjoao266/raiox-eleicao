import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Raio-X Eleitoral 2026",
  description: "Explore a votação de candidatos por cidades, estados e zonas com dados oficiais do TSE.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
