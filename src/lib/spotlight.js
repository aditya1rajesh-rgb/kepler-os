import { Sparkles, TrendingUp, Telescope, Target } from './icons';

// The dashboard spotlight = a next-best-action ladder. First unmet rung wins:
//   1. not activated  → resume setup (with progress)
//   2. GA4 unconnected → connect analytics
//   3. no AEO scan yet → run first visibility scan
//   4. otherwise       → improve brand intelligence score
// Returns a descriptor; the Dashboard maps `action` to an onClick.
export const pickSpotlight = ({ activation, brandCompleteness = 0, ga4Connected = false, hasVisibility = false }) => {
    if (activation && !activation.isActivated && activation.nextAction) {
        return {
            variant: 'setup',
            icon: Target,
            title: activation.nextAction.label,
            body: activation.nextAction.description,
            progress: activation.completedCount / Math.max(1, activation.steps.length),
            ctaLabel: activation.nextAction.cta,
            action: { type: 'navigate', to: activation.nextAction.to },
        };
    }
    if (!ga4Connected) {
        return {
            variant: 'ga4',
            icon: TrendingUp,
            title: 'Connect Google Analytics',
            body: 'See real traffic and conversion trends right here on your dashboard.',
            ctaLabel: 'Connect GA4',
            action: { type: 'connect', connector: 'ga4' },
        };
    }
    if (!hasVisibility) {
        return {
            variant: 'aeo',
            icon: Telescope,
            title: 'Run your first AI visibility scan',
            body: 'See whether AI assistants recommend you when buyers ask category questions.',
            ctaLabel: 'Run a scan',
            action: { type: 'navigate', module: 'measurement', child: 'ai-visibility' },
        };
    }
    return {
        variant: 'brand',
        icon: Sparkles,
        title: 'Sharpen your brand intelligence',
        body: `Your brand profile is ${brandCompleteness}% complete — richer context means sharper output.`,
        progress: brandCompleteness / 100,
        ctaLabel: 'Improve brand profile',
        action: { type: 'navigate', module: 'brand-intelligence', child: 'overview' },
    };
};
