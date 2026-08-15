import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") || host.startsWith("127.") ? "http" : "https";
  const image = `${protocol}://${host}/og.png`;
  const title = "市场与组合研究 · Tushare 数据驾驶舱";
  const description = "基于 Tushare 的市场风格、行业轮动、资金方向与证据链研究工作台。";
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
