import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Tabs from '../../components/ui/Tabs';
import OutreachLists from './OutreachLists';
import AbmSaved from './AbmSaved';
import Prospecting from './Prospecting';
import '../../styles/module-kepler.css';
import './Outreach.css';

// Outreach / Audiences (E30, from roadmap S6).
//
// S6 settled Outreach as four children and this is the merge: Lists and Saved
// stop being sibling screens, and Prospecting folds in "as the way you fill an
// audience rather than a sibling screen". Before this, building one audience
// meant three nav stops — find people in Prospecting, group them in Lists,
// check saved research in Saved — with nothing telling you they were the same
// job.
//
// The three surfaces are kept whole rather than rewritten into one. They are
// each substantial and each already work; the roadmap's decision was about
// WHERE they live, not what they do. Relocate, never remove — the same rule the
// v4 tool rail follows. A genuine single-canvas Audiences (Clay-style criteria
// builder with many destinations) is the later, larger piece; it needs E18's
// ad-platform sync to have destinations worth building for.
const VIEWS = [
    { id: 'lists', label: 'Lists' },
    { id: 'saved', label: 'Saved research' },
    { id: 'find', label: 'Find prospects' },
];

const OutreachAudiences = ({ workspaceId }) => {
    // Deep links from the retired child routes carry ?view= so a bookmark to
    // Saved lands on Saved, not on Lists.
    const [searchParams] = useSearchParams();
    const requested = searchParams.get('view');
    const [view, setView] = useState(
        VIEWS.some((v) => v.id === requested) ? requested : 'lists',
    );

    return (
        <div className="outreach-audiences">
            <div className="outreach-audiences__switch">
                <Tabs tabs={VIEWS} activeTab={view} onTabChange={setView} variant="kepler" />
            </div>
            {view === 'lists' && <OutreachLists workspaceId={workspaceId} />}
            {view === 'saved' && <AbmSaved workspaceId={workspaceId} />}
            {view === 'find' && <Prospecting workspaceId={workspaceId} />}
        </div>
    );
};

export default OutreachAudiences;
