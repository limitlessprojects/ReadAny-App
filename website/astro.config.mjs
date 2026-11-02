// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://codedogqby.github.io",
  base: "/ReadAny",

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [
    starlight({
      title: "ReadAny",
      logo: {
        src: "./public/logo.svg",
      },
      defaultLocale: "root",
      locales: {
        root: { label: "English", lang: "en" },
        zh: { label: "中文", lang: "zh-CN" },
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/codedogQBY/ReadAny" }],
      components: {
        Header: "./src/components/starlight/Header.astro",
        ThemeProvider: "./src/components/starlight/ThemeProvider.astro",
        ThemeSelect: "./src/components/starlight/ThemeSelect.astro",
        LanguageSelect: "./src/components/starlight/LanguageSelect.astro",
        MobileTableOfContents: "./src/components/starlight/MobileTableOfContents.astro",
        MobileMenuFooter: "./src/components/starlight/MobileMenuFooter.astro",
        MobileMenuToggle: "./src/components/starlight/MobileMenuToggle.astro",
      },
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 4,
      },
      sidebar: [
        {
          label: "Getting Started",
          translations: { "zh-CN": "快速开始" },
          items: [
            { slug: "support/getting-started" },
            { slug: "support/installation" },
            { slug: "support/import-books" },
          ],
        },
        {
          label: "Reading",
          translations: { "zh-CN": "阅读" },
          items: [
            { slug: "support/reading/basics" },
            { slug: "support/reading/annotations" },
            { slug: "support/reading/themes" },
            { slug: "support/reading/tts" },
          ],
        },
        {
          label: "AI Features",
          translations: { "zh-CN": "AI 功能" },
          items: [
            { slug: "support/ai/chat" },
            { slug: "support/ai/semantic-search" },
            { slug: "support/ai/providers" },
          ],
        },
        {
          label: "Sync & Export",
          translations: { "zh-CN": "同步与导出" },
          items: [{ slug: "support/sync/webdav" }, { slug: "support/sync/export-notes" }],
        },
        {
          label: "FAQ",
          translations: { "zh-CN": "常见问题" },
          items: [{ slug: "support/faq" }],
        },
      ],
      customCss: ["./src/styles/starlight-custom.css"],
    }),
    react(),
  ],
});
