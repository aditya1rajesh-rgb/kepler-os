import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, LayoutGrid, Plus, Sparkles, Send } from '../../lib/icons';
import { MODULES, CONTENT_TYPE_MODULE } from '../../constants/moduleRegistry';
import { workspacePath } from '../../constants/routes';
import { useWorkspace } from '../../context/WorkspaceContext';
import { contentService } from '../../services/contentService';

const CONTENT_TYPE_LABEL = {
    seo: 'SEO & AEO',
    ads: 'Ad Creative',
    outreach: 'Outreach',
    social: 'Social Media',
};

// Builds the four command groups for the palette: navigation (from the module
// registry, incl. children), workspace switching, content search (lazy-loaded), and
// quick actions. Content routing goes through workspacePath so it canonicalizes.
export const usePaletteCommands = (workspaceId) => {
    const navigate = useNavigate();
    const { workspaces } = useWorkspace();
    const [content, setContent] = useState([]);
    const [loaded, setLoaded] = useState(false);

    const ensureContent = useCallback(() => {
        if (loaded) return;
        setLoaded(true);
        contentService.getUserContent({ limit: 200 }).then(setContent).catch(() => setContent([]));
    }, [loaded]);

    const navCommands = useMemo(() => {
        const cmds = [{ id: 'nav:home', group: 'Navigate', title: 'Home', subtitle: 'All workspaces', icon: Home, run: () => navigate('/') }];
        for (const mod of MODULES) {
            const Icon = mod.icon;
            if (mod.scope === 'global') {
                cmds.push({ id: `nav:${mod.id}`, group: 'Navigate', title: mod.label, icon: Icon, run: () => navigate(mod.path) });
                continue;
            }
            if (!workspaceId) continue;
            if (mod.children?.length) {
                cmds.push({ id: `nav:${mod.id}`, group: 'Navigate', title: mod.label, icon: Icon, run: () => navigate(workspacePath(workspaceId, mod.id, mod.defaultChild)) });
                for (const child of mod.children) {
                    cmds.push({
                        id: `nav:${mod.id}:${child.id}`,
                        group: 'Navigate',
                        title: `${mod.label} › ${child.label}`,
                        keywords: child.label,
                        icon: Icon,
                        run: () => navigate(workspacePath(workspaceId, mod.id, child.id)),
                    });
                }
            } else {
                cmds.push({ id: `nav:${mod.id}`, group: 'Navigate', title: mod.label, icon: Icon, run: () => navigate(workspacePath(workspaceId, mod.id)) });
            }
        }
        return cmds;
    }, [navigate, workspaceId]);

    const actionCommands = useMemo(() => {
        const cmds = [];
        if (workspaceId) {
            cmds.push({ id: 'act:new-campaign', group: 'Actions', title: 'New campaign', icon: Plus, run: () => navigate(`${workspacePath(workspaceId, 'campaigns')}?new=1`) });
            cmds.push({ id: 'act:scan', group: 'Actions', title: 'Run AI visibility scan', icon: Sparkles, run: () => navigate(workspacePath(workspaceId, 'measurement', 'ai-visibility')) });
            cmds.push({ id: 'act:draft-outreach', group: 'Actions', title: 'Draft an outreach sequence', icon: Send, run: () => navigate(workspacePath(workspaceId, 'outreach', 'sequences')) });
        }
        cmds.push({ id: 'act:new-workspace', group: 'Actions', title: 'New workspace', icon: Plus, run: () => navigate('/onboarding?new=1') });
        return cmds;
    }, [navigate, workspaceId]);

    const workspaceCommands = useMemo(() => workspaces.map((w) => ({
        id: `ws:${w.id}`,
        group: 'Workspaces',
        title: w.name,
        subtitle: w.url || 'workspace',
        icon: LayoutGrid,
        run: async () => { await import('../../services/workspaceService').then((m) => m.workspaceService.setActiveWorkspaceId(w.id)); navigate(workspacePath(w.id)); },
    })), [workspaces, navigate]);

    const contentCommands = useMemo(() => content.map((c) => ({
        id: `content:${c.id}`,
        group: 'Content',
        title: c.title || 'Untitled',
        subtitle: CONTENT_TYPE_LABEL[c.type] ?? c.type,
        run: () => navigate(workspacePath(String(c.workspaceId), CONTENT_TYPE_MODULE[c.type] ?? 'overview')),
    })), [content, navigate]);

    return { navCommands, actionCommands, workspaceCommands, contentCommands, ensureContent };
};
