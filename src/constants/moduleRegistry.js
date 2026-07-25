// Single source of truth for workspace navigation + module identity.
//
// Before this file the module list was duplicated across Sidebar.jsx, Workspace.jsx
// and routes.js (with a 4th coupling in Workspace's render switch). Everything now
// derives from MODULES below: the sidebar tree, the Workspace renderer, route
// validation, the command palette, and the header page title.
//
// IDs are STABLE. Content-item type→module maps and DB-persisted campaign step.module
// values depend on them, so a re-parent (e.g. seo-aeo moving under Studio) changes
// labels and parents only — never ids. Old top-level URLs redirect via LEGACY_TOP_LEVEL.

import {
    LayoutDashboard,
    Target,
    Layers,
    Send,
    FolderOpen,
    TrendingUp,
    Telescope,
    Plug,
    Settings,
    HelpCircle,
} from '../lib/icons';

export const DEFAULT_MODULE_ID = 'overview';

export const NAV_SECTIONS = [
    { id: 'main', label: 'Main' },
    { id: 'analytics', label: 'Analytics & Insights' },
    { id: 'others', label: 'Others' },
];

// scope 'workspace' → renders at /workspace/:id/<id>[/<child>]; 'global' → absolute `path`.
export const MODULES = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard, section: 'main', scope: 'workspace' },
    { id: 'campaigns', label: 'Campaigns', icon: Target, section: 'main', scope: 'workspace' },
    {
        id: 'studio',
        label: 'Studio',
        icon: Layers,
        section: 'main',
        scope: 'workspace',
        defaultChild: 'seo-aeo',
        children: [
            { id: 'seo-aeo', label: 'SEO & AEO' },
            { id: 'social-media', label: 'Social Media' },
            { id: 'ad-campaigns', label: 'Ad Creative' },
        ],
    },
    {
        id: 'outreach',
        label: 'Outreach',
        icon: Send,
        section: 'main',
        scope: 'workspace',
        defaultChild: 'abm',
        children: [
            { id: 'abm', label: 'ABM Research' },
            { id: 'prospecting', label: 'Prospecting' },
            { id: 'lists', label: 'Lists' },
            { id: 'saved', label: 'Saved' },
            { id: 'sequences', label: 'Sequences' },
        ],
    },
    { id: 'library', label: 'Library', icon: FolderOpen, section: 'main', scope: 'workspace' },
    {
        id: 'measurement',
        label: 'Measurement',
        icon: TrendingUp,
        section: 'analytics',
        scope: 'workspace',
        defaultChild: 'performance',
        children: [
            { id: 'performance', label: 'Performance' },
            { id: 'ai-visibility', label: 'AI Visibility' },
        ],
    },
    {
        id: 'brand-intelligence',
        label: 'Brand Intelligence',
        icon: Telescope,
        section: 'analytics',
        scope: 'workspace',
        defaultChild: 'overview',
        children: [
            { id: 'overview', label: 'Brand Overview' },
            { id: 'details', label: 'Business Details' },
            { id: 'competitors', label: 'Competitor Intelligence' },
            { id: 'audience', label: 'Audience & ICP' },
            { id: 'files', label: 'File Intelligence' },
        ],
    },
    { id: 'integrations', label: 'Integrations', icon: Plug, section: 'others', scope: 'workspace' },
    { id: 'settings', label: 'Settings', icon: Settings, section: 'others', scope: 'global', path: '/profile' },
    { id: 'help', label: 'Help Center', icon: HelpCircle, section: 'others', scope: 'global', path: '/help' },
];

// Per-module gate metadata — maps a node to the readiness flag that unlocks it
// (mirrors deriveReadiness) plus the "how to unlock" hint for nav lock cues and
// SetupRequired. Nodes absent here are never locked. Keyed by STABLE ids, so the
// Studio children keep their own gates after re-parenting.
export const MODULE_GATES = {
    'seo-aeo': { key: 'seoReady', unmetLabel: 'Add brand context + an ICP to unlock' },
    'ad-campaigns': { key: 'adsReady', unmetLabel: 'Add brand context + an ICP to unlock' },
    outreach: { key: 'outreachReady', unmetLabel: 'Add an ICP to unlock' },
    'social-media': { key: 'socialReady', unmetLabel: 'Add brand context to unlock' },
};

// Previously-valid top-level moduleIds that re-parented. EXPLICIT — never derived
// from children (BI's child ids `overview`/`details` must NOT be treated as legacy
// top-level ids, since top-level `overview` is the Dashboard).
export const LEGACY_TOP_LEVEL = {
    'seo-aeo': ['studio', 'seo-aeo'],
    'social-media': ['studio', 'social-media'],
    'ad-campaigns': ['studio', 'ad-campaigns'],
    prospecting: ['outreach', 'prospecting'],
};

// A plain "Outreach" click leads with ABM, but campaign/brand deep-links (which carry
// these params) must land on the Sequences builder that consumes them.
export const SEQ_CONTEXT_PARAMS = ['campaign', 'brief', 'icp', 'step', 'list'];

// content_items.type → the module that renders it (canonicalized by workspacePath).
export const CONTENT_TYPE_MODULE = {
    seo: 'seo-aeo',
    ads: 'ad-campaigns',
    outreach: 'outreach',
    social: 'social-media',
};

// ── Derived indexes ──────────────────────────────────────────────────────────
const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
const TOP_LEVEL_IDS = new Set(MODULES.map((m) => m.id));

// childId → parentId, skipping any childId that is also a top-level id (i.e.
// `overview`, which is both the Dashboard and a Brand Intelligence child). The
// collision is safe to drop here because getParentOf is only used for the
// next-step dot, which resolves top-level-ish ids.
const CHILD_PARENT = new Map();
for (const m of MODULES) {
    if (!m.children) continue;
    for (const c of m.children) {
        if (!TOP_LEVEL_IDS.has(c.id)) CHILD_PARENT.set(c.id, m.id);
    }
}

// Every id a /workspace/:id/:moduleId URL may legitimately carry (canonical
// top-level modules + legacy keys that redirect).
export const VALID_TOP_IDS = new Set([...TOP_LEVEL_IDS, ...Object.keys(LEGACY_TOP_LEVEL)]);

export const getModule = (id) => MODULE_BY_ID.get(id) ?? null;

export const getChild = (moduleId, childId) => {
    const mod = MODULE_BY_ID.get(moduleId);
    return mod?.children?.find((c) => c.id === childId) ?? null;
};

/** Parent module entry for a child id (or null). Used for next-step-dot bubbling. */
export const getParentOf = (childId) => {
    const parentId = CHILD_PARENT.get(childId);
    return parentId ? MODULE_BY_ID.get(parentId) : null;
};

// ── Locking ──────────────────────────────────────────────────────────────────
/**
 * A nav node (parent or child) is locked when its gate is unmet. A parent with its
 * own gate uses it directly (Outreach → outreachReady); a parent without one is
 * locked only when ALL children are locked (Studio → seo AND ads AND social).
 * A child without its own gate inherits the parent's (Outreach children).
 */
export const isNavNodeLocked = (nodeId, readiness = {}) => {
    const gate = MODULE_GATES[nodeId];
    if (gate) return !readiness[gate.key];

    const mod = MODULE_BY_ID.get(nodeId);
    if (mod?.children?.length) {
        return mod.children.every((c) => isNavNodeLocked(c.id, readiness));
    }

    const parentId = CHILD_PARENT.get(nodeId);
    const parentGate = parentId ? MODULE_GATES[parentId] : null;
    if (parentGate) return !readiness[parentGate.key];

    return false;
};

/** The unlock hint for a locked node (own gate, else inherited parent gate). */
export const lockHintFor = (nodeId) => {
    if (MODULE_GATES[nodeId]) return MODULE_GATES[nodeId].unmetLabel;
    const parentId = CHILD_PARENT.get(nodeId);
    return parentId && MODULE_GATES[parentId] ? MODULE_GATES[parentId].unmetLabel : undefined;
};

// ── Titles ───────────────────────────────────────────────────────────────────
/** { crumb, title } for the header. crumb is the parent label when on a child. */
export const titleFor = (moduleId, subModuleId) => {
    const mod = MODULE_BY_ID.get(moduleId);
    if (!mod) return { crumb: null, title: 'Workspace' };
    if (mod.children && subModuleId) {
        const child = mod.children.find((c) => c.id === subModuleId);
        if (child) return { crumb: mod.label, title: child.label };
    }
    return { crumb: null, title: mod.label };
};

// ── Pathname parsing ─────────────────────────────────────────────────────────
/**
 * Extract { workspaceId, moduleId, subModuleId } from a pathname, or null if it isn't
 * a workspace route. Used by the sidebar (active-node detection) and header (title)
 * which sit outside the routed element and can't read useParams.
 */
export const parseWorkspaceLocation = (pathname = '') => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'workspace' || !parts[1]) return null;
    return {
        workspaceId: parts[1],
        moduleId: parts[2] ?? DEFAULT_MODULE_ID,
        subModuleId: parts[3] ?? null,
    };
};

// ── Query-string helper ──────────────────────────────────────────────────────
const stripParam = (search, key) => {
    if (!search) return '';
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    params.delete(key);
    const next = params.toString();
    return next ? `?${next}` : '';
};

const hasAnyParam = (search, keys) => {
    if (!search) return false;
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return keys.some((k) => params.has(k));
};

// ── The redirect table, in one function ──────────────────────────────────────
/**
 * Resolve a raw /workspace/:id/:moduleId[/:subModuleId] location to either a
 * canonical render target `{ moduleId, subModuleId }` or a `{ redirect }` the
 * caller should <Navigate replace> to. `search` (e.g. "?tab=audience") is
 * preserved on redirects unless a rule strips a specific param.
 */
export const resolveWorkspaceLocation = ({ moduleId, subModuleId = null, search = '' } = {}) => {
    // 1. Legacy top-level id → canonical [parent, child].
    if (LEGACY_TOP_LEVEL[moduleId]) {
        const [parent, child] = LEGACY_TOP_LEVEL[moduleId];
        return { redirect: { moduleId: parent, subModuleId: child, search } };
    }

    const mod = MODULE_BY_ID.get(moduleId);

    // 2. Unknown module → Dashboard.
    if (!mod || mod.scope !== 'workspace') {
        return { redirect: { moduleId: DEFAULT_MODULE_ID, subModuleId: null, search: '' } };
    }

    // 3a. Parent module (has children).
    if (mod.children?.length) {
        const validChild = mod.children.some((c) => c.id === subModuleId);
        if (validChild) return { moduleId, subModuleId };

        // Brand Intelligence: honor legacy ?tab=<child>, stripping the param.
        if (moduleId === 'brand-intelligence') {
            const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
            const tab = params.get('tab');
            if (tab && mod.children.some((c) => c.id === tab)) {
                return { redirect: { moduleId, subModuleId: tab, search: stripParam(search, 'tab') } };
            }
        }

        // Outreach: campaign/brand deep-links land on Sequences; plain click → ABM.
        if (moduleId === 'outreach') {
            const target = hasAnyParam(search, SEQ_CONTEXT_PARAMS) ? 'sequences' : mod.defaultChild;
            return { redirect: { moduleId, subModuleId: target, search } };
        }

        return { redirect: { moduleId, subModuleId: mod.defaultChild, search } };
    }

    // 3b. Flat module — drop any junk subModuleId.
    if (subModuleId) return { redirect: { moduleId, subModuleId: null, search } };
    return { moduleId, subModuleId: null };
};
