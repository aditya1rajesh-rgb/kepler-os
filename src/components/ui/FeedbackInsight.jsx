import { useEffect, useState } from 'react';
import { Sparkles, ChevronDown } from '../../lib/icons';
import { feedbackService } from '../../services/feedbackService';
import './FeedbackInsight.css';

/**
 * Makes the (previously invisible) learning loop visible: shows how many of the
 * user's past improvement notes are actively shaping this module's next generation
 * - the same notes getGuidance() injects - and nudges rating when there's nothing yet.
 *
 * @param {string} workspaceId
 * @param {string} module      - feedback tag: 'blog' | 'ads' | 'outreach' | 'social' | 'abm'
 * @param {number} [refreshKey] - bump to reload after new feedback is saved
 */
const OUTPUT_NOUN = { blog: 'blog', ads: 'ad', outreach: 'outreach', social: 'social', abm: 'ABM' };

const FeedbackInsight = ({ workspaceId, module, refreshKey = 0 }) => {
    const [summary, setSummary] = useState(null);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        let mounted = true;
        feedbackService
            .getFeedbackSummary(workspaceId, module)
            .then((s) => {
                if (mounted) setSummary(s);
            })
            .catch(() => {
                if (mounted) setSummary(null);
            });
        return () => {
            mounted = false;
        };
    }, [workspaceId, module, refreshKey]);

    if (!summary) return null;

    const noun = OUTPUT_NOUN[module] ?? module;
    const noteCount = summary.shapingNotes.length;

    if (noteCount === 0) {
        const msg =
            summary.ratingCount > 0
                ? `You've rated recent ${noun} outputs ${summary.avgRating.toFixed(1)}★. A rating under 3 adds a note that sharpens the next generation.`
                : `Rate the outputs below so KEPLER learns your preferences and improves future ${noun} outputs.`;
        return (
            <div className="feedback-insight feedback-insight--muted">
                <Sparkles size={14} strokeWidth={1.7} className="feedback-insight__icon" />
                <span className="feedback-insight__text">{msg}</span>
            </div>
        );
    }

    return (
        <div className="feedback-insight">
            <button
                type="button"
                className="feedback-insight__head"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
            >
                <Sparkles size={14} strokeWidth={1.7} className="feedback-insight__icon" />
                <span className="feedback-insight__text">
                    Learning from your feedback - <strong>{noteCount}</strong> note
                    {noteCount === 1 ? '' : 's'} shaping new {noun} outputs
                </span>
                <ChevronDown
                    size={15}
                    strokeWidth={1.8}
                    className={`feedback-insight__chevron ${expanded ? 'is-open' : ''}`}
                />
            </button>
            {expanded && (
                <ul className="feedback-insight__list">
                    {summary.shapingNotes.map((note, index) => (
                        <li key={`${note.createdAt}-${index}`} className="feedback-insight__note">
                            <span className="feedback-insight__note-rating">{note.rating}★</span>
                            <span className="feedback-insight__note-text">
                                {note.note}
                                {note.label ? (
                                    <span className="feedback-insight__note-label"> · {note.label}</span>
                                ) : null}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default FeedbackInsight;
