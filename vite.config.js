import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/pachinko-rank-analyzer/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "差玉ランクアナライザー",
        short_name: "差玉ランク",
        description:
          "出玉推移グラフからピクセル解析で差玉を自動読み取り、S〜Gランク判定するWebアプリ",
        start_url: ".",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0a0a0f",
        theme_color: "#0a0a0f",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
});
