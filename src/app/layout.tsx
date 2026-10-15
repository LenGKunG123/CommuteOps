import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CommuteOps — วางแผนเดินทาง",
  description: "เปรียบเทียบทางเลือกการเดินทางในกรุงเทพฯ",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CommuteOps",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",   // ต้องตรงกับพื้นหลังใน globals.css
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if ("serviceWorker" in navigator) { window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {})); }`,
          }}
        />
      </body>
    </html>
  );
}
