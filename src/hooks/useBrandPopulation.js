import { useCallback, useRef, useState } from 'react';
import { brandPopulationService, GENERATION_SECTIONS } from '../services/brandPopulationService';
import { fileService } from '../services/fileService';
import { shouldAutoPopulate } from '../lib/brandContracts';

const EXTRA_SECTION_KEYS = ['competitors', 'competitorEnrichment', 'icps'];

const idleSectionStatus = () =>
    [...GENERATION_SECTIONS, ...EXTRA_SECTION_KEYS].reduce((acc, key) => {
        acc[key] = { status: 'idle', error: '', errorKind: null };
        return acc;
    }, {});

// Failure categories where a *stricter* prompt may plausibly help on an
// explicit user retry. Anything else (insufficient context, persist, auth)
// must NOT be retried by sending the same request again.
const STRICT_RETRYABLE_KINDS = new Set(['malformed_json', 'missing_keys', 'empty_content']);

export const useBrandPopulation = (workspaceId, workspace, brand, setBrand, setSuggestions, setCompetitors) => {
    const [popStatus, setPopStatus] = useState('idle');
    const [popStage, setPopStage] = useState('idle');
    const [popErrors, setPopErrors] = useState([]);
    const [sourcesUsed, setSourcesUsed] = useState([]);
    const [fieldsUpdated, setFieldsUpdated] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const [sectionStatus, setSectionStatus] = useState(idleSectionStatus);
    const autoRan = useRef(false);
    const brandRef = useRef(brand);
    brandRef.current = brand;
    // Tracks the last failure category per section so an explicit user retry can
    // escalate to a stricter prompt instead of blindly re-running the same call.
    const sectionFailureRef = useRef({});

    const updateSection = useCallback((section, status, error = '', errorKind = null) => {
        if (status === 'error') {
            sectionFailureRef.current[section] = errorKind;
        } else if (status === 'done' || status === 'running') {
            delete sectionFailureRef.current[section];
        }
        setSectionStatus((prev) => ({ ...prev, [section]: { status, error, errorKind } }));
    }, []);

    const runPopulation = useCallback(async (brandOverride, { forceRefresh = false } = {}) => {
        const brandSnapshot = brandOverride ?? brandRef.current;
        if (!workspaceId || !brandSnapshot) return null;

        setRefreshing(true);
        setPopStatus('running');
        setPopStage('starting');
        setPopErrors([]);
        setSectionStatus(idleSectionStatus());

        try {
            const fileTexts = await fileService.getFileTextsForPopulation(workspaceId);
            const result = await brandPopulationService.populateBrand(workspaceId, {
                workspace,
                brand: brandSnapshot,
                fileTexts,
                forceRefresh,
                onProgress: setPopStage,
                onSection: ({ section, status, error, errorKind }) => updateSection(section, status, error || '', errorKind ?? null),
            });

            setPopStatus(result.status === 'error' ? 'error' : result.status);
            setPopStage(result.status === 'error' ? 'failed' : 'done');
            setPopErrors(result.errors ?? []);
            setSourcesUsed(result.sourcesUsed ?? []);
            setFieldsUpdated(result.fieldsUpdated ?? 0);

            if (result.brand) {
                setBrand(result.brand);
            }

            const pending = await brandPopulationService.getSuggestions(workspaceId);
            setSuggestions(pending);
            return result;
        } catch (err) {
            setPopStatus('error');
            setPopStage('failed');
            setPopErrors([err.message]);
            return null;
        } finally {
            setRefreshing(false);
        }
    }, [workspaceId, workspace, setBrand, setSuggestions, updateSection]);

    const runSection = useCallback(async (section) => {
        const brandSnapshot = brandRef.current;
        if (!workspaceId || !brandSnapshot || !section) return null;

        // Escalate to a stricter prompt only when the previous attempt for THIS
        // section failed in a way that a stricter prompt could fix.
        const strict = STRICT_RETRYABLE_KINDS.has(sectionFailureRef.current[section]);

        updateSection(section, 'running', '');
        try {
            const fileTexts = await fileService.getFileTextsForPopulation(workspaceId);
            const result = await brandPopulationService.generateBrandSection(workspaceId, {
                workspace,
                brand: brandSnapshot,
                fileTexts,
                forceRefresh: true,
                section,
                strict,
            });

            if (result?.ok) {
                if (result.brand) setBrand(result.brand);
                updateSection(section, 'done', '');
            } else {
                updateSection(section, 'error', result?.error || 'Generation failed', result?.errorKind ?? null);
            }
            return result;
        } catch (err) {
            updateSection(section, 'error', err.message, 'upstream');
            return null;
        }
    }, [workspaceId, workspace, setBrand, updateSection]);

    const runCompetitorDiscovery = useCallback(async () => {
        if (!workspaceId) return null;
        const brandSnapshot = brandRef.current;

        const strict = STRICT_RETRYABLE_KINDS.has(sectionFailureRef.current.competitors);

        updateSection('competitors', 'running', '');
        try {
            const fileTexts = await fileService.getFileTextsForPopulation(workspaceId);
            const result = await brandPopulationService.generateCompetitors(workspaceId, {
                workspace,
                brand: brandSnapshot,
                fileTexts,
                forceRefresh: true,
                strict,
            });

            if (result?.ok) {
                const pending = await brandPopulationService.getSuggestions(workspaceId);
                setSuggestions(pending);
                updateSection('competitors', 'done', '');
            } else {
                updateSection('competitors', 'error', result?.error || 'Competitor generation failed', result?.errorKind ?? null);
            }
            return result;
        } catch (err) {
            updateSection('competitors', 'error', err.message, 'upstream');
            return null;
        }
    }, [workspaceId, workspace, setSuggestions, updateSection]);

    const runIcpDiscovery = useCallback(async () => {
        if (!workspaceId) return null;
        const brandSnapshot = brandRef.current;

        const strict = STRICT_RETRYABLE_KINDS.has(sectionFailureRef.current.icps);

        updateSection('icps', 'running', '');
        try {
            const fileTexts = await fileService.getFileTextsForPopulation(workspaceId);
            const result = await brandPopulationService.generateIcps(workspaceId, {
                workspace,
                brand: brandSnapshot,
                fileTexts,
                forceRefresh: true,
                strict,
            });

            if (result?.ok) {
                const pending = await brandPopulationService.getSuggestions(workspaceId);
                setSuggestions(pending);
                updateSection('icps', 'done', '');
            } else {
                updateSection('icps', 'error', result?.error || 'ICP generation failed', result?.errorKind ?? null);
            }
            return result;
        } catch (err) {
            updateSection('icps', 'error', err.message, 'upstream');
            return null;
        }
    }, [workspaceId, workspace, setSuggestions, updateSection]);

    const runCompetitorEnrichment = useCallback(async (competitor) => {
        if (!workspaceId || !competitor?.id) return null;
        const brandSnapshot = brandRef.current;

        const strict = STRICT_RETRYABLE_KINDS.has(sectionFailureRef.current.competitorEnrichment);

        updateSection('competitorEnrichment', 'running', '');
        try {
            const fileTexts = await fileService.getFileTextsForPopulation(workspaceId);
            const result = await brandPopulationService.enrichCompetitor(workspaceId, {
                workspace,
                brand: brandSnapshot,
                fileTexts,
                competitor,
                strict,
            });

            if (result?.ok && result.competitor) {
                setCompetitors?.((list) => list.map((c) => (c.id === result.competitor.id ? result.competitor : c)));
                updateSection('competitorEnrichment', 'done', '');
            } else {
                updateSection('competitorEnrichment', 'error', result?.error || 'Enrichment failed', result?.errorKind ?? null);
            }
            return result;
        } catch (err) {
            updateSection('competitorEnrichment', 'error', err.message, 'upstream');
            return null;
        }
    }, [workspaceId, workspace, setCompetitors, updateSection]);

    const tryAutoPopulate = useCallback(async (loadedBrand, { hasFiles = false } = {}) => {
        if (autoRan.current) return;
        // Credit-saving guard: auto-populate runs AT MOST ONCE per brand. If a
        // prior run already happened (success, partial, or error), we never
        // auto-spend again - the user must explicitly trigger a refresh/retry.
        // This prevents silently re-running broken sections on every page load.
        if (loadedBrand?.populationMeta?.lastRunAt) {
            autoRan.current = true;
            return;
        }
        if (!shouldAutoPopulate(loadedBrand, loadedBrand.populationMeta, workspace?.url, hasFiles)) return;
        autoRan.current = true;
        await runPopulation(loadedBrand);
    }, [workspace?.url, runPopulation]);

    return {
        popStatus,
        popStage,
        popErrors,
        sourcesUsed,
        fieldsUpdated,
        refreshing,
        sectionStatus,
        runPopulation,
        runSection,
        runCompetitorDiscovery,
        runCompetitorEnrichment,
        runIcpDiscovery,
        tryAutoPopulate,
    };
};
