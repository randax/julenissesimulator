import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Julius’ slede · En reise gjennom Snøfall",
  description:
    "Ta plass i Julius sin slede. En stemningsfull, interaktiv flytur gjennom en snødekt verden.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
