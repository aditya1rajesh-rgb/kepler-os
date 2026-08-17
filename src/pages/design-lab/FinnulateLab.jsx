import { useEffect } from 'react';
import {
    LayoutDashboard, Store, Banknote, FileText, MessageCircle, Presentation,
    Megaphone, Users, Monitor, ClipboardList, UserCog, CreditCard, Blocks,
    Headphones, CircleHelp, Settings2, Search, Bell, Mail,
    ChevronDown, Calendar, Download, Info, MoreHorizontal, ArrowUp, Sparkles,
    X, Plus, ChevronsUpDown, CircleCheck, CircleAlert, CircleSlash, User,
} from 'lucide-react';
import './finnulate-lab.css';

/* ═══════════════════════════════════════════════════════════════════════════
   FIDELITY TEST — can we match the Finnulate reference?

   Rebuilt by eye from a bitmap: the Figma file holds no vectors, no text
   nodes and no variables, so there was nothing to extract (see
   docs/DESIGN-REFERENCE-EXTRACT.md). Values are measured from the PNG.

   Dev-only route. Not wired to Kepler data, auth, or the app shell.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Deterministic PRNG so the chart is stable across renders and screenshots. */
const rng = (seed) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const COLS_PER_MONTH = 5;      // 60 columns across the plot
const WAFFLE_ROWS = 27;        // 27 rows ≈ the 0–60k axis

/* Counts are in CELLS, not pixels — the chart is a matrix. Every column has at
   least one black cell, so the baseline row reads as a solid rule, exactly as
   it does in the reference. */
const buildTrend = () => {
    const r = rng(20250611);
    return MONTHS.flatMap((m) =>
        Array.from({ length: COLS_PER_MONTH }, () => {
            const spike = r() > 0.84;
            const solid = spike ? 8 + Math.floor(r() * 5) : 2 + Math.floor(r() * 6);
            const ghost = Math.min(WAFFLE_ROWS, solid + 4 + Math.floor(r() * 19));
            return { m, solid, ghost };
        }),
    );
};

const buildBreakdown = () => {
    const r = rng(88117);
    return Array.from({ length: 14 }, () => {
        const solid = 30 + r() * 45;
        return { solid, ghost: Math.min(96 - solid, 12 + r() * 26) };
    });
};

const TREND = buildTrend();
const BREAKDOWN = buildBreakdown();

const NAV = [
    {
        group: 'Main Menu',
        items: [
            { label: 'Dashboard', Icon: LayoutDashboard, active: true },
            { label: 'Products', Icon: Store },
            { label: 'Transactions', Icon: Banknote },
            { label: 'Reports & Analytics', Icon: FileText },
            { label: 'Messages', Icon: MessageCircle },
            { label: 'Team Performance', Icon: Presentation },
            { label: 'Campaigns', Icon: Megaphone },
        ],
    },
    {
        group: 'Customers',
        items: [
            { label: 'Customer List', Icon: Users },
            { label: 'Channels', Icon: Monitor },
            { label: 'Order Management', Icon: ClipboardList },
        ],
    },
    {
        group: 'Management',
        items: [
            { label: 'Roles & Permissions', Icon: UserCog },
            { label: 'Billing & Subscription', Icon: CreditCard },
            { label: 'Integrations', Icon: Blocks },
        ],
    },
    {
        group: 'Settings',
        items: [
            { label: 'Customer Support', Icon: Headphones },
            { label: 'Help Center', Icon: CircleHelp },
            { label: 'System Settings', Icon: Settings2 },
        ],
    },
];

/* Sparkline: hairlines of similar height with exactly one blacked out as the
   current period — the reference's bars sit high, they are not a bar chart. */
const KPIS = [
    { label: 'Total Revenue', value: '$20,320', unit: null, spark: [17, 21, 19, 23, 26, 20, 18, 22], on: 4 },
    { label: 'Total Orders', value: '10,320', unit: 'Orders', spark: [18, 22, 20, 19, 26, 21, 23, 17], on: 4 },
    { label: 'New Customers', value: '4,305', unit: 'New Users', spark: [20, 18, 23, 19, 26, 22, 17, 21], on: 4 },
    { label: 'Conversion Rate', value: '3.9%', unit: null, spark: [19, 23, 18, 24, 26, 20, 22, 18], on: 4 },
];

const ROWS = [
    { id: '#04910', customer: 'Ryan Korsgaard', product: 'Ergo Office Chair', status: 'success', qty: 12, price: '$3,450', total: '$41,400' },
    { id: '#04911', customer: 'Madelyn Lubin', product: 'Sunset Desk 02', status: 'success', qty: 20, price: '$2,980', total: '$89,200' },
    { id: '#04912', customer: 'Abram Bergson', product: 'Eco Bookshelf', status: 'pending', qty: 22, price: '$1,750', total: '$75,900' },
    { id: '#04913', customer: 'Phillip Mango', product: 'Green Leaf Desk', status: 'refunded', qty: 24, price: '$1,950', total: '$19,500' },
    { id: '#04914', customer: 'Cheyenne Rosser', product: 'Walnut Side Table', status: 'success', qty: 16, price: '$2,240', total: '$35,840' },
    { id: '#04915', customer: 'Jaxson Vaccaro', product: 'Linen Lounge 04', status: 'pending', qty: 18, price: '$3,120', total: '$56,160' },
    // Fades out under the frame edge — the scroll affordance from the reference.
    { id: '#04916', customer: 'Kaiya Dokidis', product: 'Oak Shelf Unit', status: 'success', qty: 30, price: '$1,480', total: '$44,400', fade: true },
];

const PILL = {
    success: { Icon: CircleCheck, label: 'Success' },
    pending: { Icon: CircleAlert, label: 'Pending' },
    refunded: { Icon: CircleSlash, label: 'Refunded' },
};

const SortGlyph = () => (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M4 4.5 6 2l2 2.5M4 7.5 6 10l2-2.5" />
    </svg>
);

const Waffle = ({ data }) => (
    <div className="fin-waffle">
        {data.map((d, i) => (
            <div className="fin-waffle__col" key={i}>
                {Array.from({ length: d.ghost }, (_, row) => (
                    <span
                        key={row}
                        className={`fin-waffle__cell fin-waffle__cell--${row < d.solid ? 'solid' : 'ghost'}`}
                    />
                ))}
            </div>
        ))}
    </div>
);

const Stems = ({ data }) => (
    <div className="fin-stems">
        {data.map((d, i) => (
            <div className="fin-stems__col" key={i}>
                <span className="fin-stems__ghost" style={{ height: `${d.ghost}%` }} />
                <span className="fin-stems__solid" style={{ height: `${d.solid}%` }} />
            </div>
        ))}
    </div>
);

const FinnulateLab = () => {
    useEffect(() => {
        document.title = 'Fidelity test — Finnulate reference';
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href =
            'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;700&display=swap';
        document.head.appendChild(link);
        return () => link.remove();
    }, []);

    // Tooltip anchors to the JUN cluster, as in the reference.
    const tipCol = 5 * COLS_PER_MONTH + 7;
    const tipLeft = `${(tipCol / TREND.length) * 100}%`;

    return (
        <div className="fin">
            <div className="fin__frame">
                {/* ── Sidebar ─────────────────────────────────────────────── */}
                <aside className="fin-sidebar">
                    <div className="fin-switcher">
                        <div className="fin-switcher__tile">S</div>
                        <div className="fin-switcher__meta">
                            <div className="fin-switcher__eyebrow">Agency</div>
                            <div className="fin-switcher__name">Spark Pixel Team</div>
                        </div>
                        <ChevronsUpDown className="fin-switcher__chev" size={13} />
                    </div>

                    <div className="fin-sidebar__nav">
                        {NAV.map(({ group, items }, gi) => (
                            <div key={group}>
                                <div className={`fin-navgroup${gi > 0 ? ' fin-navgroup--spaced' : ''}`}>{group}</div>
                                {items.map(({ label, Icon, active }) => (
                                    <div className={`fin-nav${active ? ' fin-nav--active' : ''}`} key={label}>
                                        <Icon />
                                        <span>{label}</span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    <div className="fin-sidebar__foot">
                        <div className="fin-user">
                            <div className="fin-user__avatar" style={{ display: 'grid', placeItems: 'center' }}>
                                <User size={14} color="#8e8e8e" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="fin-user__name">Salung Prastyo</div>
                                <div className="fin-user__role">Sales Operator</div>
                            </div>
                            <ChevronDown size={13} color="#8e8e8e" />
                        </div>
                    </div>
                </aside>

                {/* ── Main ────────────────────────────────────────────────── */}
                <div className="fin-main">
                    <header className="fin-header">
                        <div className="fin-crumb">
                            <span>Dashboard</span>
                            <span>›</span>
                            <b>Overview</b>
                        </div>

                        <div className="fin-search">
                            <Search />
                            <span>Search…</span>
                            <div className="fin-kbd">
                                <span>⌘</span>
                                <span>K</span>
                            </div>
                        </div>

                        <button className="fin-iconbtn" type="button"><Bell /></button>
                        <button className="fin-iconbtn" type="button"><Mail /></button>
                        <div className="fin-avatar" style={{ display: 'grid', placeItems: 'center' }}>
                            <User size={15} color="#8e8e8e" />
                        </div>
                    </header>

                    <div className="fin-content">
                        <div className="fin-pagehead">
                            <h1>Welcome back, Salung</h1>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
                                <button className="fin-btn" type="button">
                                    Daily <ChevronDown />
                                </button>
                                <button className="fin-btn" type="button">
                                    <Calendar /> 6 Nov 2025
                                </button>
                                <button className="fin-btn fin-btn--solid" type="button">
                                    <Download /> Export CSV
                                </button>
                            </div>
                        </div>

                        {/* ── KPI row ─────────────────────────────────────── */}
                        <div className="fin-kpis">
                            {KPIS.map(({ label, value, unit, spark, on }) => (
                                <div className="fin-kpi" key={label}>
                                    <div className="fin-kpi__card">
                                        <div>
                                            <div className="fin-label">{label}</div>
                                            <div className="fin-kpi__figure fin-num">
                                                {value}
                                                {unit && <span className="fin-kpi__unit">{unit}</span>}
                                            </div>
                                        </div>
                                        <div className="fin-spark">
                                            {spark.map((h, i) => (
                                                <i key={i} className={i === on ? 'on' : ''} style={{ height: `${(h / 26) * 100}%` }} />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="fin-kpi__foot">
                                        <span className="fin-kpi__dot"><ArrowUp /></span>
                                        <span className="fin-kpi__delta fin-num">
                                            +0,94<em>last year</em>
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ── Panels ──────────────────────────────────────── */}
                        <div className="fin-panels">
                            <section className="fin-panel">
                                <div className="fin-panel__head">
                                    <span className="fin-label">Sales Trend</span>
                                    <Info className="fin-panel__info" />
                                    <span className="fin-panel__more"><MoreHorizontal /></span>
                                </div>
                                <div className="fin-panel__body">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 11 }}>
                                        <span style={{ fontSize: 11, color: 'var(--fin-ink-2)' }}>Total Revenue :</span>
                                        <span className="fin-num" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>
                                            $20,320
                                        </span>
                                        <div className="fin-legend" style={{ marginLeft: 14 }}>
                                            <span><i /> NEW USER</span>
                                            <span><i className="solid" /> EXISTING USER</span>
                                        </div>
                                        <div className="fin-seg" style={{ marginLeft: 'auto' }}>
                                            <button type="button">Weekly</button>
                                            <button type="button" data-on="true">Monthly</button>
                                            <button type="button">Yearly</button>
                                        </div>
                                    </div>

                                    <div className="fin-chart">
                                        <div className="fin-chart__y">
                                            {[60, 50, 40, 30, 20, 10, 0].map((v) => <span key={v}>{v}k</span>)}
                                        </div>
                                        <div className="fin-chart__plot">
                                            <div className="fin-chart__grid">
                                                {Array.from({ length: 7 }, (_, i) => <i key={i} />)}
                                            </div>
                                            <Waffle data={TREND} />

                                            <div className="fin-tip__marker" style={{ left: tipLeft, top: 0, bottom: 15 }} />
                                            <div className="fin-tip__pin" style={{ left: `calc(${tipLeft} - 3px)`, top: '30%' }} />
                                            <div className="fin-tip" style={{ left: `calc(${tipLeft} + 10px)`, top: '22%' }}>
                                                <div className="fin-tip__title">Jun 2025</div>
                                                <div className="fin-tip__row">
                                                    <i /> New User <b className="fin-num">38k</b>
                                                </div>
                                                <div className="fin-tip__row" style={{ marginTop: 3 }}>
                                                    <i className="solid" /> Existing User <b className="fin-num">18k</b>
                                                </div>
                                            </div>

                                            <div className="fin-chart__x">
                                                {MONTHS.map((m) => (
                                                    <span key={m} data-on={String(m === 'JUN')}>{m}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section className="fin-panel">
                                <div className="fin-panel__head">
                                    <span className="fin-label">Revenue Breakdown</span>
                                    <Info className="fin-panel__info" />
                                    <span className="fin-panel__more"><MoreHorizontal /></span>
                                </div>
                                <div className="fin-panel__body">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 9 }}>
                                        <div>
                                            <div style={{ fontSize: 11, color: 'var(--fin-ink-2)' }}>Revenue by Category</div>
                                            <div className="fin-num" style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 3 }}>
                                                $20,320
                                            </div>
                                        </div>
                                        <button className="fin-btn" type="button" style={{ marginLeft: 'auto', height: 24 }}>
                                            <Calendar /> Jan 1 - Aug 30
                                        </button>
                                    </div>

                                    <div className="fin-insight" style={{ marginBottom: 11 }}>
                                        <Sparkles />
                                        <span>Get AI insight for better analysis</span>
                                        <X className="x" size={11} />
                                    </div>

                                    <div className="fin-chart">
                                        <div className="fin-chart__plot">
                                            <div className="fin-chart__grid fin-chart__grid--dotted">
                                                {Array.from({ length: 6 }, (_, i) => <i key={i} />)}
                                            </div>
                                            <Stems data={BREAKDOWN} />
                                            <div className="fin-chart__x" style={{ justifyContent: 'space-between' }}>
                                                <span style={{ flex: 'none' }}>1 JAN</span>
                                                <span style={{ flex: 'none' }}>30 JAN 2025</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* ── Table ───────────────────────────────────────── */}
                        <section className="fin-panel fin-tablewrap">
                            <div className="fin-panel__head">
                                <span className="fin-label">Recent Transactions</span>
                                <Info className="fin-panel__info" />
                                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
                                    <div className="fin-search" style={{ margin: 0, width: 178, height: 26 }}>
                                        <Search />
                                        <span>Search transactions…</span>
                                    </div>
                                    <button className="fin-btn" type="button" style={{ height: 26 }}>
                                        <Plus /> Add Transaction
                                    </button>
                                    <button className="fin-iconbtn" type="button" style={{ width: 26, height: 26 }}>
                                        <MoreHorizontal />
                                    </button>
                                </div>
                            </div>

                            <table className="fin-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 30 }}><span className="fin-check" /></th>
                                        {['ID', 'Customer', 'Product', 'Status', 'Qty', 'Unit Price', 'Total Revenue'].map((h) => (
                                            <th key={h}>
                                                <span className="fin-label">{h} <SortGlyph /></span>
                                            </th>
                                        ))}
                                        <th style={{ textAlign: 'right' }}><span className="fin-label">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ROWS.map((row) => {
                                        const { Icon, label } = PILL[row.status];
                                        return (
                                            <tr key={row.id} data-fade={String(Boolean(row.fade))}>
                                                <td><span className="fin-check" /></td>
                                                <td className="fin-cell-id">{row.id}</td>
                                                <td className="fin-cell-name">{row.customer}</td>
                                                <td className="fin-cell-name" style={{ fontWeight: 400 }}>{row.product}</td>
                                                <td>
                                                    <span className={`fin-pill fin-pill--${row.status}`}>
                                                        <Icon fill="currentColor" stroke="#fff" /> {label}
                                                    </span>
                                                </td>
                                                <td className="fin-cell-num">{row.qty}</td>
                                                <td className="fin-cell-num">{row.price}</td>
                                                <td className="fin-cell-num">{row.total}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button className="fin-rowbtn" type="button"><MoreHorizontal /></button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </section>
                    </div>
                </div>
            </div>

            <div className="fin-note">fidelity test · not a Kepler surface</div>
        </div>
    );
};

export default FinnulateLab;
