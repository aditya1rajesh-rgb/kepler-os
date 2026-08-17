// E3 · goal-grounded generation. The risky part of grounding is not assembling
// the context, it is what the prompt is allowed to SAY about it — a model handed
// a target and no standing will write "we're well on our way", and that sentence
// looks exactly as grounded as a true one. These tests are the guards.
import { describe, expect, it } from 'vitest';
import {
    LADDER_BUDGET,
    MAX_PRIOR_ASSETS,
    buildLadderBlock,
    rankByRelevance,
    renderCampaignBlock,
    renderGoalBlock,
    renderPriorAssetsBlock,
    renderSignalsBlock,
    selectPriorAssets,
    topicTokens,
} from '../src/lib/generationContext.js';

const measuredGoal = {
    id: 'g1',
    name: 'Q3 organic pipeline',
    kind: 'measured',
    measure: 'sessions',
    target: 9000,
    endDate: '2026-09-30',
    description: '',
};

const onTrack = {
    achieved: 5544, forecast: 9800, progress: 0.616, verdict: 'on-track',
    daysRemaining: 52, confidence: 'high', basis: 'trailing-level',
};

const unknownProjection = {
    achieved: null, forecast: null, gap: null, progress: null,
    verdict: 'unknown', daysRemaining: 52, confidence: 'none', basis: null,
};

describe('renderGoalBlock — a goal is never invented', () => {
    it('renders nothing at all when there is no goal', () => {
        expect(renderGoalBlock(null)).toBe('');
        expect(renderGoalBlock({ name: '' })).toBe('');
    });

    it('states the target and the standing when the projection is real', () => {
        const block = renderGoalBlock(measuredGoal, onTrack);
        expect(block).toContain('9,000 sessions');
        expect(block).toContain('On track');
        expect(block).toContain('5,544 of 9,000');
        expect(block).toContain('(62%)');
        expect(block).toContain('52 days left');
    });

    it('forbids progress claims when the standing is unknown', () => {
        const block = renderGoalBlock(measuredGoal, unknownProjection);
        expect(block).toContain('not enough measured data');
        expect(block).toMatch(/do NOT claim progress/i);
        // The target is an intention the user typed, so it survives.
        expect(block).toContain('9,000 sessions');
    });

    it('treats a missing projection the same as an unknown one', () => {
        const block = renderGoalBlock(measuredGoal, null);
        expect(block).toMatch(/do NOT claim progress/i);
        expect(block).not.toContain('On track');
    });

    it('never leaks a standing figure into the copy, even when it knows one', () => {
        const block = renderGoalBlock(measuredGoal, onTrack);
        expect(block).toMatch(/Never state it/i);
    });

    it('leans on quick-compounding angles when the goal is off pace', () => {
        const behind = renderGoalBlock(measuredGoal, { ...onTrack, verdict: 'off-pace', progress: 0.2, achieved: 1800 });
        // "Off pace", not "Behind": the verdict has one name across the product.
        expect(behind).toContain('Off pace');
        expect(behind).toMatch(/compound quickly/);
        expect(renderGoalBlock(measuredGoal, onTrack)).not.toMatch(/compound quickly/);
    });

    it('gives directional goals checkpoints instead of math', () => {
        const block = renderGoalBlock(
            { name: 'Be the named alternative to Acme', kind: 'directional' },
            null,
            [{ label: 'Ship the comparison page', doneAt: null }, { label: 'Old thing', doneAt: '2026-07-01' }],
        );
        expect(block).toContain('directional');
        expect(block).toContain('Ship the comparison page');
        expect(block).not.toContain('Old thing'); // done checkpoints are not open work
        expect(block).not.toMatch(/Target:/);
    });
});

describe('renderCampaignBlock', () => {
    const campaign = {
        id: 'c1',
        title: 'Back-to-campus launch',
        campaignType: 'launch',
        status: 'active',
        plan: {
            strategySummary: 'Own the rental-vs-buy decision for Bengaluru students.',
            channelMix: ['seo', 'social'],
            steps: [{ id: 's1', title: 'Pillar post' }, { id: 's2', title: 'Comparison post', description: 'Rent vs buy' }],
        },
    };

    it('renders nothing without a campaign', () => {
        expect(renderCampaignBlock(null)).toBe('');
    });

    it('places the asset in the plan when a step is named', () => {
        const block = renderCampaignBlock(campaign, 's2');
        expect(block).toContain('Back-to-campus launch');
        expect(block).toContain('rental-vs-buy');
        expect(block).toContain('seo, social');
        expect(block).toContain('step 2 of 2');
        expect(block).toContain('Rent vs buy');
    });

    it('carries the campaign\'s own free-text intent under the campaign heading', () => {
        // `campaigns.goal` is legacy free text, not the goals row — the two must
        // not blur into each other in the prompt.
        const block = renderCampaignBlock({ ...campaign, goal: 'Fill 200 August rentals' }, 's1');
        expect(block).toContain('What this campaign is for: Fill 200 August rentals');
        expect(block.indexOf('CAMPAIGN —')).toBeLessThan(block.indexOf('Fill 200'));
    });

    it('survives an unknown step id without claiming a position', () => {
        const block = renderCampaignBlock(campaign, 'nope');
        expect(block).toContain('Back-to-campus launch');
        expect(block).not.toMatch(/step \d+ of/);
    });
});

describe('renderPriorAssetsBlock', () => {
    const assets = [
        { type: 'seo', title: 'Laptop rental vs buying', targetKeyword: 'laptop rental bangalore', scope: 'campaign' },
        { type: 'seo', title: 'laptop rental vs buying', targetKeyword: 'dup', scope: 'goal' },
        { type: 'social', title: '', targetKeyword: '' },
    ];

    it('dedupes case-insensitively and drops empty rows', () => {
        const selected = selectPriorAssets(assets);
        expect(selected).toHaveLength(1);
        expect(renderPriorAssetsBlock(assets)).toContain('(1)');
    });

    it('distinguishes this campaign from the rest of the goal', () => {
        const block = renderPriorAssetsBlock([
            { type: 'seo', title: 'A', scope: 'campaign' },
            { type: 'seo', title: 'B', scope: 'goal' },
        ]);
        expect(block).toContain('"A" — same campaign');
        expect(block).toContain('"B" — elsewhere under this goal');
    });

    it('caps the list', () => {
        const many = Array.from({ length: 30 }, (_, i) => ({ type: 'seo', title: `Post ${i}` }));
        expect(selectPriorAssets(many)).toHaveLength(MAX_PRIOR_ASSETS);
    });

    it('renders nothing when nothing exists yet', () => {
        expect(renderPriorAssetsBlock([])).toBe('');
    });

    // Found in the demo harness: the blog draft prompt carries a `Title:` field
    // and the parser takes the FIRST match in the whole prompt, so a context line
    // ending in "title:" hijacked it and the draft came out titled with a prior
    // asset. Injected context must not end a line with a downstream field label.
    it('does not end a line with a prompt field label', () => {
        const block = renderPriorAssetsBlock([{ type: 'seo', title: 'A' }]);
        expect(block).not.toMatch(/title:\s*$/im);
    });
});

describe('renderSignalsBlock', () => {
    it('renders search demand and answer-engine gaps as real observations', () => {
        const block = renderSignalsBlock({
            searchOpportunities: [
                { type: 'striking_distance', title: 'laptop rental bangalore', metrics: { position: 12.42, impressions: 1200 } },
            ],
            aeoGaps: [
                { prompt: 'best laptop rental for students', surface: 'perplexity', competitors: ['Rentomojo', 'Furlenco'] },
            ],
        });
        expect(block).toContain('position 12.4');
        expect(block).toContain('1,200 impressions');
        expect(block).toContain('striking distance');
        expect(block).toContain('cited instead: Rentomojo, Furlenco');
    });

    it('is empty when there are no signals, rather than claiming there are none', () => {
        expect(renderSignalsBlock({})).toBe('');
        expect(renderSignalsBlock({ searchOpportunities: [{ title: '' }], aeoGaps: [{ prompt: '' }] })).toBe('');
    });
});

describe('rankByRelevance', () => {
    const items = [
        { t: 'How to price a SaaS trial' },
        { t: 'Laptop rental for students in Bengaluru' },
        { t: 'Rental insurance basics' },
    ];

    it('puts topic overlap first and keeps input order for ties', () => {
        const ranked = rankByRelevance(items, 'laptop rental bangalore', (x) => x.t);
        expect(ranked[0].t).toContain('Laptop rental');
        expect(ranked[1].t).toContain('Rental insurance');
    });

    it('ignores stopwords and short tokens rather than matching on "the"', () => {
        expect(topicTokens('the best of a to')).toEqual(new Set());
        const ranked = rankByRelevance(items, 'the best of the', (x) => x.t);
        expect(ranked.map((x) => x.t)).toEqual(items.map((x) => x.t)); // no overlap → original order
    });

    it('still returns items when nothing matches, honouring the limit', () => {
        expect(rankByRelevance(items, 'quantum tunnelling', (x) => x.t, 2)).toHaveLength(2);
        expect(rankByRelevance([], 'anything', (x) => x.t)).toEqual([]);
    });
});

describe('buildLadderBlock', () => {
    const full = {
        goal: measuredGoal,
        projection: onTrack,
        goalSource: 'campaign',
        campaign: { id: 'c1', title: 'Back-to-campus launch', campaignType: 'launch', status: 'active', plan: {} },
        priorAssets: [{ type: 'seo', title: 'Laptop rental vs buying', scope: 'campaign' }],
        searchOpportunities: [{ type: 'striking_distance', title: 'laptop rental bangalore', metrics: { position: 12.4, impressions: 1200 } }],
        aeoGaps: [{ prompt: 'best laptop rental', surface: 'perplexity', competitors: ['Rentomojo'] }],
    };

    it('composes the four legs and states which one wins a conflict', () => {
        const { text, groundedIn, dropped } = buildLadderBlock(full);
        expect(text).toContain('GOAL —');
        expect(text).toContain('CAMPAIGN —');
        expect(text).toContain('ALREADY PRODUCED UNDER THIS GOAL');
        expect(text).toContain('LIVE SEARCH DEMAND');
        expect(text).toContain('the goal wins over the campaign');
        expect(dropped).toEqual([]);
        expect(groundedIn.map((g) => g.kind)).toEqual(['goal', 'campaign', 'priorAssets', 'signals']);
    });

    it('records HOW the goal was found, so an inferred goal can be questioned', () => {
        expect(buildLadderBlock(full).groundedIn[0].source).toBe('campaign');
        expect(buildLadderBlock({ ...full, goalSource: 'primary-fallback' }).groundedIn[0].source).toBe('primary-fallback');
    });

    it('returns an empty block — not a header with nothing under it — on cold start', () => {
        const { text, groundedIn } = buildLadderBlock({});
        expect(text).toBe('');
        expect(groundedIn).toEqual([]);
    });

    it('grounds on whatever legs exist when the others are missing', () => {
        const { text, groundedIn } = buildLadderBlock({ goal: measuredGoal, projection: onTrack });
        expect(text).toContain('GOAL —');
        expect(text).not.toContain('CAMPAIGN —');
        expect(groundedIn.map((g) => g.kind)).toEqual(['goal']);
    });

    it('drops whole sections rather than truncating mid-bullet when over budget', () => {
        const fat = Array.from({ length: MAX_PRIOR_ASSETS }, (_, i) => ({ type: 'seo', title: `Post ${i} ${'x'.repeat(150)}` }));
        const { text, groundedIn, dropped } = buildLadderBlock({ ...full, priorAssets: fat, budget: 900 });
        expect(dropped).toContain('prior');
        expect(text).not.toContain('ALREADY PRODUCED');
        expect(groundedIn.map((g) => g.kind)).not.toContain('priorAssets');
        // The goal — the highest-authority leg — is what survives the squeeze.
        expect(text).toContain('GOAL —');
    });

    it('stays well inside the ai-proxy ceiling at full stretch', () => {
        const stuffed = buildLadderBlock({
            ...full,
            priorAssets: Array.from({ length: 40 }, (_, i) => ({ type: 'seo', title: `Post ${i}` })),
            searchOpportunities: Array.from({ length: 40 }, (_, i) => ({ type: 'low_ctr', title: `query ${i}`, metrics: { position: 3, impressions: 100 } })),
            aeoGaps: Array.from({ length: 40 }, (_, i) => ({ prompt: `prompt ${i}`, surface: 'openai', competitors: ['A'] })),
        });
        expect(stuffed.text.length).toBeLessThanOrEqual(LADDER_BUDGET + 500);
    });
});
