import { useCallback, useEffect, useState } from 'react';
import { brandService } from '../services/brandService';
import { fileService } from '../services/fileService';
import { isUuid } from '../lib/validation';

/**
 * Source-of-truth loader for a workspace.
 *
 * Loads only persisted data (brand profile, competitors, ICPs/personas, files)
 * and derives readiness flags. No invented/demo values are produced here - every
 * field originates from the database. Downstream modules consume `readiness` to
 * decide between a real builder and an explicit "setup required" state.
 */
const EMPTY = {
    brand: null,
    competitors: [],
    personas: [],
    files: [],
};

export const deriveReadiness = ({ brand, competitors, personas, files }) => {
    // Brand context = the user has saved meaningful brand identity beyond the
    // auto-created name/url baseline.
    const hasBrandContext = Boolean(
        brand &&
        ((brand.overview && brand.overview.trim().length > 0) ||
            (brand.values && brand.values.length > 0) ||
            (brand.tone && brand.tone.length > 0) ||
            (brand.aesthetic && brand.aesthetic.length > 0) ||
            (brand.businessDetails?.valueProposition?.trim()) ||
            (brand.businessDetails?.productsServices?.trim()) ||
            (brand.colorIdentity?.primaryColor?.trim()))
    );

    const hasBrandVoice = Boolean(brand && brand.tone && brand.tone.length > 0);
    const hasIcps = personas.length > 0;
    const hasCompetitors = competitors.length > 0;
    const hasFiles = files.length > 0;

    return {
        hasBrandContext,
        hasBrandVoice,
        hasIcps,
        hasCompetitors,
        hasFiles,
        // Module-level prerequisites
        seoReady: hasBrandContext && hasIcps,
        adsReady: hasBrandContext && hasIcps,
        outreachReady: hasIcps,
        socialReady: hasBrandContext,
    };
};

export const useWorkspaceConfig = (workspaceId) => {
    const [state, setState] = useState(EMPTY);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        if (!isUuid(workspaceId)) {
            setState(EMPTY);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const [brand, competitors, personas, files] = await Promise.all([
                brandService.getBrandIdentity(workspaceId),
                brandService.getCompetitors(workspaceId),
                brandService.getPersonas(workspaceId),
                fileService.getFiles(workspaceId),
            ]);
            setState({ brand, competitors, personas, files });
        } catch (err) {
            console.error('Failed to load workspace config:', err);
            setError(err);
            setState(EMPTY);
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return {
        ...state,
        loading,
        error,
        readiness: deriveReadiness(state),
        refresh,
    };
};
