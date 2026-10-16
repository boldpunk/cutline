import type { Metadata, Viewport } from "next";
import "@fontsource-variable/oswald/index.css";
import "@fontsource-variable/inter/index.css";
import "./globals.css";
import { env } from "@/lib/server/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: { default: "CUTLINE — запись в барбершоп", template: "%s · CUTLINE" },
  description: "Онлайн-запись в барбершоп: услуги, мастера, свободное время по реальному расписанию.",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#171715",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
