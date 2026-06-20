import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'rjsf-formulas',
  description: 'RJSF extension for computed fields driven by formulas',
  base: '/rjsf-formulas/',
  themeConfig: {
    nav: [
      { text: 'Quick Start', link: '/quick-start' },
      { text: 'Customization', link: '/customization' },
      { text: 'API', link: '/api/README' },
      { text: 'Live Demo', link: 'https://a-ludi.github.io/rjsf-formulas/demo/' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Quick Start', link: '/quick-start' },
          { text: 'Customization', link: '/customization' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Overview', link: '/api/README' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/a-ludi/rjsf-formulas' },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Arne Ludwig',
    },
    editLink: {
      pattern: 'https://github.com/a-ludi/rjsf-formulas/edit/main/website/:path',
    },
  },
})
