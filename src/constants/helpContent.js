// Help Center content. Getting-started steps reference stable module/child ids so the
// page can build workspace-scoped deep-links from the active workspace.

export const GETTING_STARTED = [
    {
        id: 'brand',
        title: 'Build your brand intelligence',
        body: 'Give Kepler your website or a file and it auto-builds your brand profile — so every module writes on-brand.',
        module: 'brand-intelligence',
        child: 'overview',
        cta: 'Open Brand Intelligence',
    },
    {
        id: 'icp',
        title: 'Confirm your first ICP',
        body: 'Pick who you sell to. It unlocks SEO & AEO, Ad Creative and Outreach.',
        module: 'brand-intelligence',
        child: 'audience',
        cta: 'Add an ICP',
    },
    {
        id: 'generate',
        title: 'Generate your first asset',
        body: 'Turn your brand intelligence into a content pipeline in Studio.',
        module: 'seo-aeo',
        child: null,
        cta: 'Open SEO & AEO',
    },
    {
        id: 'measure',
        title: 'Connect a data source',
        body: 'Add GA4, Search Console or Zoho in Integrations so the Dashboard reports real outcomes.',
        module: 'integrations',
        child: null,
        cta: 'Open Integrations',
    },
];

export const HELP_RESOURCES = [
    { id: 'privacy', label: 'Privacy Policy', href: '/privacy', external: false },
    { id: 'terms', label: 'Terms of Service', href: '/terms', external: false },
    { id: 'support', label: 'Contact support', href: 'mailto:support@kepler.app', external: true },
];
