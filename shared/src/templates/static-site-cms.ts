import type { ArchitectureGraph } from '../schema.ts';

export const staticSiteCms = {
  schemaVersion: 1,
  title: 'Static website with a headless CMS',
  description:
    'Marketing site prebuilt into static pages. Editors publish in a hosted CMS, a webhook starts a build that uploads the pages to private object storage behind a CDN, and a small function handles the contact form.',
  provider: 'generic',
  nodes: [
    { id: 'visitor', kind: 'user', label: 'Visitor' },
    { id: 'editor', kind: 'user', label: 'Content editor' },
    { id: 'dns', kind: 'dns', label: 'DNS' },
    { id: 'cdn', kind: 'cdn', label: 'CDN' },
    {
      id: 'site-files',
      kind: 'object-storage',
      label: 'Site files',
      attributes: { publiclyAccessible: false },
    },
    { id: 'contact-form', kind: 'function', label: 'Contact form handler' },
    { id: 'email', kind: 'external-system', label: 'Email service' },
    { id: 'cms', kind: 'external-system', label: 'Headless CMS' },
    { id: 'build', kind: 'batch-job', label: 'Site build' },
  ],
  edges: [
    { id: 'visitor-dns', source: 'visitor', target: 'dns', label: 'Resolve domain' },
    { id: 'visitor-cdn', source: 'visitor', target: 'cdn', protocol: 'https' },
    {
      id: 'cdn-site',
      source: 'cdn',
      target: 'site-files',
      label: 'Pages and assets',
      protocol: 'https',
    },
    {
      id: 'cdn-form',
      source: 'cdn',
      target: 'contact-form',
      label: 'POST /contact',
      protocol: 'https',
    },
    { id: 'form-email', source: 'contact-form', target: 'email', protocol: 'https' },
    {
      id: 'editor-cms',
      source: 'editor',
      target: 'cms',
      label: 'Edit and publish',
      protocol: 'https',
    },
    {
      id: 'cms-webhook',
      source: 'cms',
      target: 'build',
      label: 'Publish webhook',
      protocol: 'https',
      mode: 'async',
    },
    {
      id: 'build-fetch',
      source: 'build',
      target: 'cms',
      label: 'Fetch content',
      protocol: 'https',
    },
    {
      id: 'build-upload',
      source: 'build',
      target: 'site-files',
      label: 'Upload pages',
      protocol: 'https',
    },
    { id: 'build-purge', source: 'build', target: 'cdn', label: 'Purge cache', protocol: 'https' },
  ],
} satisfies ArchitectureGraph;
