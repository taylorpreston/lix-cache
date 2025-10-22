import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    starlight({
      title: 'Lix Cache',
      description: 'TypeScript-first caching with exceptional developer experience',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/your-org/lix-cache' },
      ],
      customCss: ['./src/styles/custom.css'],
      plugins: [
        starlightTypeDoc({
          entryPoints: ['../lix-cache-sdk/src/index.ts'],
          tsconfig: '../lix-cache-sdk/tsconfig.json',
          output: 'api',
          sidebar: {
            label: 'API Reference',
            collapsed: false,
          },
        }),
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', link: '/' },
            { label: 'Installation', link: '/getting-started/installation' },
            { label: 'Quick Start', link: '/getting-started/quick-start' },
            { label: 'Configuration', link: '/getting-started/configuration' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Collections', link: '/guides/collections' },
            { label: 'Values', link: '/guides/values' },
            { label: 'Remember Pattern', link: '/guides/remember' },
            { label: 'Automatic Batching', link: '/guides/batching' },
            { label: 'React Integration', link: '/guides/react' },
            { label: 'Error Handling', link: '/guides/errors' },
          ],
        },
        {
          label: 'Backend',
          items: [
            { label: 'Architecture', link: '/backend/architecture' },
            { label: 'API Endpoints', link: '/backend/endpoints' },
            { label: 'Deployment', link: '/backend/deployment' },
          ],
        },
        {
          label: 'Examples',
          autogenerate: { directory: 'examples' },
        },
        typeDocSidebarGroup,
      ],
    }),
  ],
});
