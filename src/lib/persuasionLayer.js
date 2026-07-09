// Reusable persuasion layer - the 80/20 of the marketing-psychology + offers
// skills, distilled into a compact prompt fragment. Inlined into any copy-
// generating module (ads now; outreach, social, landing later) so persuasion is
// applied consistently. NOT the full ~60-model catalog - just the high-leverage
// principles mapped to copy zones, plus the hard ethics guardrail.

export const PERSUASION_LAYER = `PERSUASION (apply selectively - pick 2-4 principles that fit the funnel stage and the objection being overcome; never stack all at once):
- HEADLINE: Anchoring (lead with a high reference point) or Contrast (vivid before-state). Frame positively (gain frame); use Loss Aversion ("don't miss" beats "you could get") only when urgency is the goal.
- BODY: Mental Accounting (reframe cost - "$3/day", "less than a coffee"); Reciprocity (give value first); Pratfall (one honest limitation builds trust); Present Bias (emphasize the benefit they get TODAY).
- PROOF: Social Proof (specific numbers/logos/reviews), Authority (credentials, "featured in"), Mimetic Desire (who already wants this).
- CTA: ONE clear action (Hick's Law); make the first step trivially easy (Activation Energy); add Scarcity/Urgency ONLY if genuinely true; for multi-step flows use the Goal-Gradient ("you're almost there").
Structure copy along AIDA (Attention → Interest → Desire → Action).`;

// Hard guardrails from the offers skill's banned-vocabulary + ethics rules. This
// is the quality moat that keeps generated copy off "course-bro slop" and, more
// importantly, prevents fabricated scarcity/proof.
export const COPY_ETHICS_GUARDRAIL = `COPY GUARDRAILS (hard rules):
- NEVER fabricate scarcity ("limited time" with no real deadline), proof ("worth $X" with no basis), customer counts, or statistics. If it isn't true for this product, omit it.
- Avoid hype/superlatives: "game-changing, revolutionary, disruptive, next-level, 10x, secret, hidden, best, leading, world-class". Avoid course-bro tone.
- Specificity beats superlatives - use concrete outcomes, real numbers from the context, named capabilities. Benefits over features. Active voice.
- Only claim what the provided brand context / source material supports.`;

// Convenience: the combined fragment most copy modules want in their system prompt.
export const PERSUASION_SYSTEM_FRAGMENT = `${PERSUASION_LAYER}\n\n${COPY_ETHICS_GUARDRAIL}`;
