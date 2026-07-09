import { Lock } from '../../lib/icons';
import './Tabs.css';

const Tabs = ({ tabs, activeTab, onTabChange, variant = 'default', className = '' }) => {
    const barClass = [
        'tabs-bar',
        variant === 'kepler' ? 'tabs-bar--kepler' : '',
        className,
    ].filter(Boolean).join(' ');

    return (
        <div className={barClass}>
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    className={[
                        'tab-item',
                        activeTab === tab.id ? 'active' : '',
                        tab.locked ? 'tab-item--locked' : '',
                        tab.isNext ? 'tab-item--next' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => onTabChange(tab.id)}
                    title={tab.title}
                >
                    {tab.label}
                    {tab.locked ? (
                        <Lock className="tab-item__lock" size={12} strokeWidth={1.8} />
                    ) : null}
                </button>
            ))}
        </div>
    );
};

export default Tabs;
