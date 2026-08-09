import { useState } from 'react';
import { campaignService } from '../../services/campaignService';
import { toUserMessage } from '../../lib/errors';

// A campaign's ONE parent goal (E2, roadmap S1).
//
// "A campaign ladders to exactly one goal so rollup math is unambiguous, but can
// be linked to others." This is the one — a single select, not a multi-picker.
// Extra relationships are goal_links, a separate thing on purpose.
//
// Unparented is a real, nameable state, not an error: every campaign in the
// product predates goals. But it is worth saying out loud, because an unparented
// campaign contributes to nothing — its outcomes never reach a forecast.

// `goals` comes from the parent so the screen fetches once and the chip in the
// status bar and this control cannot disagree about what exists.
const CampaignGoalPicker = ({ workspaceId, campaign, goals = [], onChange }) => {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const setGoal = async (goalId) => {
        setSaving(true);
        setError('');
        try {
            await campaignService.updateCampaign(workspaceId, campaign.id, { goalId: goalId || null });
            onChange?.(goalId || null);
        } catch (err) {
            setError(toUserMessage(err, 'Could not change the goal.'));
        } finally {
            setSaving(false);
        }
    };

    // Nothing to ladder to yet — say what is missing rather than showing an
    // empty select that looks broken.
    if (!goals.length) {
        return (
            <p className="brand-intel-module__source-label">
                No goals yet — create one and this campaign can ladder to it.
            </p>
        );
    }

    return (
        <div className="campaign-goal-picker">
            <select
                className="intel-input"
                value={campaign.goalId ?? ''}
                disabled={saving}
                aria-label="Parent goal"
                onChange={(e) => setGoal(e.target.value)}
            >
                <option value="">Not laddered to a goal</option>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {!campaign.goalId && (
                <p className="brand-intel-module__source-label">
                    This campaign’s outcomes don’t reach any forecast until it has a parent.
                </p>
            )}
            {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
        </div>
    );
};

export default CampaignGoalPicker;
