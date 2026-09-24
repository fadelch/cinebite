import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { NotificationProvider } from "@/components/ui/notification-provider";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CineBite",
  description: "Cinema food ordering and seat delivery platform.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <NotificationProvider>{children}</NotificationProvider>
      </body>
    </html>
  );
}
