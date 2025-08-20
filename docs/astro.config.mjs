// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "UBGHub Docs",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/maddox05/ubghub",
        },
      ],
      sidebar: [
        {
          label: "Guides",
          items: [
            // Each item here is one entry in the navigation menu.
            { label: "Guide List", slug: "guides" },
            { label: "SEO", slug: "guides/seo" },
          ],
        },
      ],
    }),
  ],
});
