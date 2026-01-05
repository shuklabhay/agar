import type { Metadata } from "next";
import "./globals.css";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { Toaster } from "@/components/ui/sonner";
import { CookieBanner } from "@/components/CookieBanner";

export const metadata: Metadata = {
  title: "Agar",
  description: "Agar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en">
        <body className="antialiased">
          <ConvexClientProvider>{children}</ConvexClientProvider>
          <CookieBanner />
          <Toaster />
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
