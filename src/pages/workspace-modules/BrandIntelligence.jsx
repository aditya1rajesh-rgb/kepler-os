import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { workspacePath } from '../../constants/routes';
import { useActivation } from '../../context/ActivationContext';
import Panel from '../../components/ui/Panel';
import UploadZone from '../../components/ui/UploadZone';
import { brandService } from '../../services/brandService';
import { fileService } from '../../services/fileService';
import { brandPopulationService } from '../../services/brandPopulationService';
import { sanitizeText } from '../../lib/validation';
import { toUserMessage } from '../../lib/errors';
import {
    EMPTY_COLOR_IDENTITY,
    EMPTY_BUSINESS_DETAILS,
    BUSINESS_DETAILS_TAB_SCALAR_KEYS,
    colorIdentityToLegacyColors,
    normalizeHexColor,
} from '../../lib/brandContracts';
import { markFieldManual } from '../../lib/provenance';
import { computeBrandHealth } from '../../lib/brandHealth';
import { brandFreshnessService } from '../../services/brandFreshnessService';
import { brandLearningService } from '../../services/brandLearningService';
import { useBrandPopulation } from '../../hooks/useBrandPopulation';
import BrandOverviewPanel from '../../components/brand-intelligence/BrandOverviewPanel';
import BusinessDetailsPanel from '../../components/brand-intelligence/BusinessDetailsPanel';
import BrandPopulationBanner from '../../components/brand-intelligence/BrandPopulationBanner';
import ProvenanceLabel from '../../components/brand-intelligence/ProvenanceLabel';
import CompetitorIntelligencePanel from '../../components/brand-intelligence/CompetitorIntelligencePanel';
import LearnedUpdatesCard from '../../components/brand-intelligence/LearnedUpdatesCard';
import EmptyState from '../../components/ui/EmptyState';
import ModuleScreen from '../../components/layout/ModuleScreen';
import ToolRail, { ToolCard, ToolGroup } from '../../components/layout/ToolRail';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import IcpSuggestionCard from '../../components/brand-intelligence/IcpSuggestionCard';
import { EMPTY_ICP_DRAFT, icpDraftToPayload, icpPayloadToPersona } from '../../lib/icpContracts';
import '../../styles/module-kepler.css';
import './BrandIntelligence.css';

const EMPTY_BRAND = {
    name: '',
    url: '',
    tagline: '',
    overview: '',
    colors: [],
    fonts: [],
    values: [],
    aesthetic: [],
    tone: [],
    colorIdentity: { ...EMPTY_COLOR_IDENTITY },
    businessDetails: { ...EMPTY_BUSINESS_DETAILS },
    fieldProvenance: {},
    populationMeta: {},
};

// Compact generate/retry control with inline per-section status. Reused across
// the section-scoped Brand Intelligence tabs.
const retryLabelForKind = (errorKind) => {
    if (errorKind === 'insufficient_context') return 'Add more sources';
    if (errorKind === 'malformed_json' || errorKind === 'missing_keys' || errorKind === 'empty_content') {
        return 'Retry with stricter prompt';
    }
    return 'Retry';
};

const SectionGenerateControl = ({ status = {}, onGenerate, idleLabel = 'Generate' }) => {
    const state = status.status ?? 'idle';
    const isRunning = state === 'running';
    const blockRetry = state === 'error' && status.errorKind === 'insufficient_context';
    return (
        <span className="brand-section-control">
            {isRunning && <span className="brand-section-control__status">Generating…</span>}
            {state === 'done' && (
                <span className="brand-section-control__status brand-section-control__status--done">Updated</span>
            )}
            {state === 'error' && (
                <span className="brand-section-control__status brand-section-control__status--error" role="alert">
                    {status.error || 'Generation failed'}
                </span>
            )}
            {!blockRetry && (
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onGenerate}
                    disabled={isRunning}
                >
                    {isRunning ? 'Generating…' : state === 'error' ? retryLabelForKind(status.errorKind) : idleLabel}
                </button>
            )}
        </span>
    );
};

const splitList = (value) =>
    value.split(',').map((item) => sanitizeText(item, 80)).filter(Boolean);

const formatRelativeDate = (iso) => {
    if (!iso) return '-';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '-';
    return dt.toLocaleString();
};

const resolveBrand = (brand, workspace) =>
    brand ?? {
        ...EMPTY_BRAND,
        name: workspace?.name ?? '',
        url: workspace?.url ?? '',
        tagline: workspace?.tagline ?? '',
        colorIdentity: { ...EMPTY_COLOR_IDENTITY },
        businessDetails: { ...EMPTY_BUSINESS_DETAILS },
    };

const SUB_TABS = [
    { id: 'overview', label: 'Brand Overview' },
    { id: 'details', label: 'Business Details' },
    { id: 'competitors', label: 'Competitor Intelligence' },
    { id: 'audience', label: 'Audience & ICP' },
    { id: 'files', label: 'File Intelligence' },
];

const BrandIntelligence = ({ workspaceId, workspace }) => {
    // The active screen is the URL's :subModuleId (the 5 Brand Intelligence screens
    // are real destinations now, not local tab state). The resolver guarantees a valid
    // child, but default defensively.
    const { subModuleId } = useParams();
    const subTab = SUB_TABS.some((t) => t.id === subModuleId) ? subModuleId : 'overview';
    const navigate = useNavigate();
    const { refresh: refreshActivation } = useActivation();
    const [loading, setLoading] = useState(true);
    const [brandData, setBrandData] = useState(EMPTY_BRAND);
    const [competitors, setCompetitors] = useState([]);
    const [selectedComp, setSelectedComp] = useState(null);
    const [icps, setIcps] = useState([]);
    const [files, setFiles] = useState([]);
    const [suggestions, setSuggestions] = useState([]);

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(EMPTY_BRAND);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    const [newCompName, setNewCompName] = useState('');
    const [newCompUrl, setNewCompUrl] = useState('');
    const [icpDraft, setIcpDraft] = useState(EMPTY_ICP_DRAFT);
    const [showIcpForm, setShowIcpForm] = useState(false);

    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [acceptingId, setAcceptingId] = useState(null);
    const [fileActionId, setFileActionId] = useState(null);
    const fileInputRef = useRef(null);

    // Living brand model: source freshness + feedback-learned updates.
    const [freshness, setFreshness] = useState(null);
    const freshnessCheckRef = useRef(false);
    const [learnScanning, setLearnScanning] = useState(false);
    const [learnBusyId, setLearnBusyId] = useState(null);
    const [learnNotice, setLearnNotice] = useState('');

    const {
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
    } = useBrandPopulation(workspaceId, workspace, brandData, setBrandData, setSuggestions, setCompetitors);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [brand, competitorRows, personaRows, fileRows, suggestionRows] = await Promise.all([
                brandService.getBrandIdentity(workspaceId),
                brandService.getCompetitors(workspaceId),
                brandService.getPersonas(workspaceId),
                fileService.getFiles(workspaceId),
                brandPopulationService.getSuggestions(workspaceId),
            ]);

            const resolved = resolveBrand(brand, workspace);
            setBrandData(resolved);
            setDraft(resolved);
            setCompetitors(competitorRows);
            setSelectedComp(competitorRows[0] ?? null);
            setIcps(personaRows);
            setFiles(fileRows);
            setSuggestions(suggestionRows);
            return { resolved, fileRows };
        } catch (error) {
            console.error('Failed to load brand intelligence:', error);
            return null;
        } finally {
            setLoading(false);
        }
    }, [workspaceId, workspace]);

    useEffect(() => {
        if (!workspaceId) return;
        let mounted = true;

        loadAll().then((result) => {
            if (!mounted || !result?.resolved) return;
            const hasFiles = (result.fileRows ?? []).some(
                (f) => (f.extractedText ?? f.text ?? '').trim()
            );
            tryAutoPopulate(result.resolved, { hasFiles });
        });

        return () => { mounted = false; };
    }, [workspaceId, loadAll, tryAutoPopulate]);

    useEffect(() => {
        if (!editing) setDraft(brandData);
    }, [brandData, editing]);

    const isLiveEmptyBrand =
        !brandData.overview &&
        brandData.values.length === 0 &&
        brandData.aesthetic.length === 0 &&
        brandData.tone.length === 0 &&
        !Object.values(brandData.colorIdentity ?? {}).some(Boolean);

    const competitorSuggestions = suggestions.filter((s) => s.type === 'competitor');
    const icpSuggestions = suggestions.filter((s) => s.type === 'icp');
    const fieldSuggestions = suggestions.filter((s) => s.type === 'field');

    const brandHealth = useMemo(() => computeBrandHealth(brandData), [brandData]);

    // One freshness check per page visit, once a website snapshot exists to
    // compare against (service caches per-workspace for 6h).
    useEffect(() => {
        if (!workspaceId || freshnessCheckRef.current) return;
        if (!brandData?.populationMeta?.websiteSource?.bodyText) return;
        freshnessCheckRef.current = true;
        brandFreshnessService
            .checkSourceFreshness(workspaceId, { brand: brandData, workspace })
            .then(setFreshness)
            .catch(() => setFreshness(null));
    }, [workspaceId, workspace, brandData]);

    const handleStartEdit = () => {
        setDraft(brandData);
        setSaveError('');
        setEditing(true);
    };

    const handleCancelEdit = () => {
        setDraft(brandData);
        setSaveError('');
        setEditing(false);
    };

    const markDraftField = (path) => {
        setDraft((d) => ({
            ...d,
            fieldProvenance: markFieldManual(d.fieldProvenance ?? {}, path),
        }));
    };

    const handleSaveBrand = async () => {
        setSaving(true);
        setSaveError('');
        try {
            const colorIdentity = draft.colorIdentity ?? EMPTY_COLOR_IDENTITY;
            const businessDetails = {
                ...(draft.businessDetails ?? EMPTY_BUSINESS_DETAILS),
            };
            if (businessDetails.offersProducts) {
                businessDetails.productsServices = businessDetails.offersProducts;
            }
            const payload = {
                name: brandData.name,
                url: brandData.url,
                tagline: sanitizeText(draft.tagline, 200),
                overview: sanitizeText(draft.overview, 2000),
                colors: colorIdentityToLegacyColors(colorIdentity),
                fonts: draft.fonts,
                values: draft.values,
                aesthetic: draft.aesthetic,
                tone: draft.tone,
                colorIdentity,
                businessDetails,
                fieldProvenance: draft.fieldProvenance ?? {},
                populationMeta: brandData.populationMeta ?? {},
            };
            const saved = await brandService.upsertBrandIdentity(workspaceId, payload);
            setBrandData(saved);
            setDraft(saved);
            setEditing(false);
            refreshActivation();
        } catch (err) {
            setSaveError(toUserMessage(err, 'Could not save brand profile.'));
        } finally {
            setSaving(false);
        }
    };

    const handleColorIdentityChange = (key, value) => {
        const normalized = key.endsWith('Color') ? normalizeHexColor(value) : value;
        setDraft((d) => ({
            ...d,
            colorIdentity: { ...(d.colorIdentity ?? EMPTY_COLOR_IDENTITY), [key]: normalized },
            fieldProvenance: markFieldManual(d.fieldProvenance ?? {}, `colorIdentity.${key}`),
        }));
    };

    const handleBusinessDetailChange = (key, value) => {
        setDraft((d) => {
            const businessDetails = {
                ...(d.businessDetails ?? EMPTY_BUSINESS_DETAILS),
                [key]: value,
            };
            if (key === 'offersProducts') {
                businessDetails.productsServices = value;
            }
            return {
                ...d,
                businessDetails,
                fieldProvenance: markFieldManual(d.fieldProvenance ?? {}, `businessDetails.${key}`),
            };
        });
    };

    const handleOverviewScalarFromDetails = (key, value) => {
        setDraft((d) => ({
            ...d,
            [key]: value,
            fieldProvenance: markFieldManual(d.fieldProvenance ?? {}, key),
        }));
    };

    const handleProofPointAdd = (rawValue) => {
        const additions = splitList(rawValue);
        if (additions.length === 0) return;
        const existing = draft.businessDetails?.proofPoints ?? [];
        const newPoints = additions.map((text) => ({
            text,
            confidence: 'high',
            source: 'manual',
        }));
        handleBusinessDetailChange('proofPoints', [...existing, ...newPoints]);
    };

    const handleProofPointRemove = (index) => {
        const existing = draft.businessDetails?.proofPoints ?? [];
        handleBusinessDetailChange(
            'proofPoints',
            existing.filter((_, i) => i !== index)
        );
    };

    const renderChips = (list, onRemove) =>
        list.map((item, i) => (
            <span key={`${item}-${i}`} className="intel-chip">
                {item}
                {onRemove && (
                    <button type="button" className="intel-chip__remove" onClick={() => onRemove(i)} aria-label={`Remove ${item}`}>×</button>
                )}
            </span>
        ));

    const addToDraftList = (key, rawValue) => {
        const additions = splitList(rawValue);
        if (additions.length === 0) return;
        setDraft((d) => ({
            ...d,
            [key]: [...d[key], ...additions],
            fieldProvenance: markFieldManual(d.fieldProvenance ?? {}, key),
        }));
    };

    const removeFromDraftList = (key, index) => {
        setDraft((d) => ({
            ...d,
            [key]: d[key].filter((_, i) => i !== index),
            fieldProvenance: markFieldManual(d.fieldProvenance ?? {}, key),
        }));
    };

    const mergeManualFromDraft = (fresh, draft) => {
        const manualPaths = Object.entries(draft.fieldProvenance ?? {})
            .filter(([, entry]) => entry?.origin === 'manual')
            .map(([path]) => path);

        if (!manualPaths.length) return fresh;

        const next = {
            ...fresh,
            colorIdentity: { ...(fresh.colorIdentity ?? EMPTY_COLOR_IDENTITY) },
            businessDetails: { ...(fresh.businessDetails ?? EMPTY_BUSINESS_DETAILS) },
            fieldProvenance: { ...(fresh.fieldProvenance ?? {}) },
        };

        for (const path of manualPaths) {
            if (path.startsWith('colorIdentity.')) {
                const key = path.split('.')[1];
                next.colorIdentity[key] = draft.colorIdentity?.[key] ?? '';
            } else if (path.startsWith('businessDetails.')) {
                const key = path.split('.')[1];
                next.businessDetails[key] = draft.businessDetails?.[key] ?? '';
            } else {
                next[path] = draft[path];
            }
            next.fieldProvenance[path] = draft.fieldProvenance[path];
        }

        next.colors = colorIdentityToLegacyColors(next.colorIdentity);
        return next;
    };

    const handleRefreshPopulation = async () => {
        const result = await runPopulation(undefined, { forceRefresh: true });
        if (result?.brand) {
            setBrandData(result.brand);
            setDraft((d) => (editing ? mergeManualFromDraft(result.brand, d) : result.brand));
            // The refresh just re-scraped the site, so the stored snapshot is
            // current again by construction — no extra fetch needed.
            brandFreshnessService.invalidate(workspaceId);
            setFreshness((f) => (f?.hasBaseline
                ? { ...f, changed: false, deltaRatio: 0, checkedAt: new Date().toISOString() }
                : f));
        }
    };

    const handleScanLearnings = async () => {
        setLearnScanning(true);
        setLearnNotice('');
        try {
            const r = await brandLearningService.generateLearnedSuggestions(workspaceId);
            if (r.generated > 0) {
                setSuggestions(await brandPopulationService.getSuggestions(workspaceId));
                setLearnNotice(`${r.generated} learned update${r.generated === 1 ? '' : 's'} proposed from ${r.patterns.length} winning pattern${r.patterns.length === 1 ? '' : 's'}.`);
            } else if (r.reason === 'no-winning-patterns') {
                setLearnNotice('No consistent winners yet — rate more outputs across modules (3+ high ratings on a pattern).');
            } else {
                setLearnNotice('Nothing new to propose — current winners are already reflected in the brand model.');
            }
        } catch (error) {
            setLearnNotice(toUserMessage(error, 'Could not scan feedback for learnings.'));
        } finally {
            setLearnScanning(false);
        }
    };

    const handleAcceptLearned = async (suggestion) => {
        setLearnBusyId(suggestion.id);
        setLearnNotice('');
        try {
            const updated = await brandLearningService.applyFieldSuggestion(workspaceId, suggestion);
            if (updated) {
                setBrandData(updated);
                setDraft((d) => (editing ? mergeManualFromDraft(updated, d) : updated));
            }
            setSuggestions((list) => list.filter((s) => s.id !== suggestion.id));
        } catch (error) {
            setLearnNotice(toUserMessage(error, 'Could not apply the learned update.'));
        } finally {
            setLearnBusyId(null);
        }
    };

    const handleDismissLearned = async (id) => {
        setLearnBusyId(id);
        try {
            await brandService.dismissSuggestion(workspaceId, id);
            setSuggestions((list) => list.filter((s) => s.id !== id));
        } catch (error) {
            setLearnNotice(toUserMessage(error, 'Could not dismiss the suggestion.'));
        } finally {
            setLearnBusyId(null);
        }
    };

    const handleGenerateSection = async (section) => {
        const result = await runSection(section);
        if (result?.ok && result.brand) {
            setBrandData(result.brand);
            setDraft((d) => (editing ? mergeManualFromDraft(result.brand, d) : result.brand));
        }
    };

    const handleFileUpload = async (fileList) => {
        if (!fileList?.length) return;
        setUploading(true);
        setUploadError('');
        try {
            for (const file of fileList) {
                const uploaded = await fileService.uploadFile(
                    workspaceId,
                    file,
                    ['brand-intelligence'],
                    { uploadSource: 'post-setup' }
                );
                setFiles((prev) => [uploaded, ...prev]);
            }
        } catch (err) {
            // Log the raw error so upload failures are diagnosable; toUserMessage
            // intentionally genericizes unrecognized errors for the UI.
            console.error('File upload failed:', err);
            setUploadError(toUserMessage(err, 'Upload failed.'));
        } finally {
            setUploading(false);
        }
    };

    const handleReprocessFile = async (file) => {
        setFileActionId(file.id);
        try {
            const updated = await fileService.reprocessFile(file);
            setFiles((list) => list.map((f) => (f.id === file.id ? updated : f)));
        } catch (err) {
            setUploadError(toUserMessage(err, 'Could not reprocess file.'));
        } finally {
            setFileActionId(null);
        }
    };

    const handleToggleFileIncluded = async (file) => {
        setFileActionId(file.id);
        try {
            const updated = await fileService.setIncludedInAnalysis(
                workspaceId,
                file.id,
                !(file.includedInAnalysis !== false)
            );
            if (updated) {
                setFiles((list) => list.map((f) => (f.id === file.id ? updated : f)));
            } else {
                setFiles((list) => list.map((f) =>
                    (f.id === file.id ? { ...f, includedInAnalysis: !(file.includedInAnalysis !== false) } : f)
                ));
            }
        } catch (err) {
            setUploadError(toUserMessage(err, 'Could not update analysis inclusion.'));
        } finally {
            setFileActionId(null);
        }
    };

    const handleRefreshFromFiles = async () => {
        await runPopulation(undefined, { forceRefresh: true });
    };

    const handleRemoveFile = async (file) => {
        try {
            await fileService.deleteFile(workspaceId, file.id, file.storagePath);
            setFiles((list) => list.filter((f) => f.id !== file.id));
        } catch (err) {
            console.error('Remove file failed:', err);
        }
    };

    const handleAcceptSuggestion = async (suggestion) => {
        setAcceptingId(suggestion.id);
        try {
            if (suggestion.type === 'competitor') {
                const created = await brandPopulationService.acceptCompetitorSuggestion(workspaceId, suggestion);
                setCompetitors((list) => [...list, created]);
                setSelectedComp(created);
            } else {
                const created = await brandPopulationService.acceptIcpSuggestion(workspaceId, suggestion);
                setIcps((list) => [...list, created]);
            }
            setSuggestions((list) => list.filter((s) => s.id !== suggestion.id));
            refreshActivation();
        } catch (err) {
            console.error('Accept suggestion failed:', err);
        } finally {
            setAcceptingId(null);
        }
    };

    const handleDismissSuggestion = async (id) => {
        await brandPopulationService.dismissSuggestion(workspaceId, id);
        setSuggestions((list) => list.filter((s) => s.id !== id));
    };

    const handleEditSuggestion = async (id, payload) => {
        setAcceptingId(id);
        try {
            const updated = await brandPopulationService.updateSuggestion(workspaceId, id, payload);
            if (updated) {
                setSuggestions((list) => list.map((s) => (s.id === id ? updated : s)));
            }
        } catch (err) {
            console.error('Edit suggestion failed:', err);
        } finally {
            setAcceptingId(null);
        }
    };

    const handleUpdateCompetitor = async (id, updates) => {
        const updated = await brandService.updateCompetitor(workspaceId, id, updates);
        if (updated) {
            setCompetitors((list) => list.map((c) => (c.id === id ? updated : c)));
            setSelectedComp((sel) => (sel?.id === id ? updated : sel));
        }
    };

    const source = editing ? draft : brandData;
    const provenance = source.fieldProvenance ?? {};

    const overviewLoading = refreshing || popStatus === 'running';
    const colorsLowConfidence =
        !workspace?.url?.trim() ||
        (popStatus !== 'idle' && popStatus !== 'running' && !sourcesUsed.includes('website'));

    /* v3 stacked four strips above the profile before any content appeared: a
       population banner that was an empty box holding one button, a health stat
       row, a learned-updates row with its own button, and a section header with
       a third button. The two that are actions now live in the tool rail, the
       stats are the screen's status line, and the profile is the canvas. */
    const renderOverview = () => (
        <>
            {isLiveEmptyBrand && !editing && !overviewLoading && (
                <p className="brand-intel-module__empty">
                    No brand profile yet — add your website or a file to auto-build it, or edit manually.
                </p>
            )}

            {saveError && <p className="brand-intel-module__error" role="alert">{saveError}</p>}

            <BrandOverviewPanel
                source={source}
                provenance={provenance}
                editing={editing}
                loading={overviewLoading}
                lowConfidence={colorsLowConfidence}
                sectionStatus={sectionStatus}
                onGenerateSection={handleGenerateSection}
                onTaglineChange={(value) => {
                    setDraft({ ...draft, tagline: value });
                    markDraftField('tagline');
                }}
                onOverviewChange={(value) => {
                    setDraft({ ...draft, overview: value });
                    markDraftField('overview');
                }}
                onColorIdentityChange={handleColorIdentityChange}
                renderChips={renderChips}
                onAddListItem={addToDraftList}
                onRemoveListItem={removeFromDraftList}
            />
        </>
    );

    const renderDetails = () => {
        const details = brandData.businessDetails ?? EMPTY_BUSINESS_DETAILS;
        const detailsLoading = refreshing || popStatus === 'running';

        const hasAny =
            Boolean(brandData.tagline?.trim()) ||
            Boolean(brandData.overview?.trim()) ||
            (brandData.values?.length ?? 0) > 0 ||
            (brandData.tone?.length ?? 0) > 0 ||
            (brandData.aesthetic?.length ?? 0) > 0 ||
            BUSINESS_DETAILS_TAB_SCALAR_KEYS.some((key) => details[key]?.trim()) ||
            (details.proofPoints?.length ?? 0) > 0;

        if (!hasAny && !editing && !detailsLoading) {
            return (
                <div className="form-stack">
                    <p className="brand-intel-module__empty">
                        No business details yet. Upload project files and refresh from sources, or edit manually.
                    </p>
                    <button type="button" className="btn btn-primary" onClick={handleStartEdit}>
                        Edit business details
                    </button>
                </div>
            );
        }

        const dSource = editing ? draft : brandData;
        const dDetails = editing ? draft.businessDetails ?? EMPTY_BUSINESS_DETAILS : details;
        const dProv = editing ? draft.fieldProvenance ?? {} : provenance;

        return (
            <div className="form-stack">
                <div className="intel-section-header">
                    <span className="brand-intel-module__source-label">Business details</span>
                    {editing ? (
                        <div className="intel-action-row">
                            <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} disabled={saving}>Cancel</button>
                            <button type="button" className="btn btn-primary" onClick={handleSaveBrand} disabled={saving}>
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    ) : (
                        <div className="intel-action-row">
                            <SectionGenerateControl
                                status={sectionStatus.businessDetails}
                                onGenerate={() => handleGenerateSection('businessDetails')}
                                idleLabel="Generate from sources"
                            />
                            <button type="button" className="btn btn-primary" onClick={handleStartEdit}>Edit</button>
                        </div>
                    )}
                </div>

                {saveError && <p className="brand-intel-module__error" role="alert">{saveError}</p>}

                <BusinessDetailsPanel
                    source={dSource}
                    businessDetails={dDetails}
                    provenance={dProv}
                    editing={editing}
                    loading={detailsLoading}
                    onScalarChange={handleBusinessDetailChange}
                    onOverviewScalarChange={handleOverviewScalarFromDetails}
                    onAddListItem={addToDraftList}
                    onRemoveListItem={removeFromDraftList}
                    onProofPointAdd={handleProofPointAdd}
                    onProofPointRemove={handleProofPointRemove}
                    renderChips={renderChips}
                />
            </div>
        );
    };

    const handleAddCompetitor = async () => {
        const name = sanitizeText(newCompName, 120);
        if (!name) return;
        try {
            const created = await brandService.addCompetitor(workspaceId, {
                name,
                url: sanitizeText(newCompUrl, 200),
                confirmed: true,
            });
            setCompetitors((list) => [...list, created]);
            setSelectedComp(created);
            setNewCompName('');
            setNewCompUrl('');
        } catch (err) {
            console.error('Add competitor failed:', err);
        }
    };

    const handleRemoveCompetitor = async (id) => {
        try {
            await brandService.removeCompetitor(workspaceId, id);
            setCompetitors((list) => {
                const next = list.filter((c) => c.id !== id);
                setSelectedComp((sel) => (sel?.id === id ? next[0] ?? null : sel));
                return next;
            });
        } catch (err) {
            console.error('Remove competitor failed:', err);
        }
    };

    const handleEnrichCompetitor = async (competitor) => {
        const result = await runCompetitorEnrichment(competitor);
        if (result?.ok && result.competitor) {
            setSelectedComp(result.competitor);
        }
    };

    const renderCompetitors = () => (
        <CompetitorIntelligencePanel
            competitorSuggestions={competitorSuggestions}
            competitors={competitors}
            selectedComp={selectedComp}
            onSelectComp={setSelectedComp}
            loading={refreshing || popStatus === 'running'}
            newCompName={newCompName}
            newCompUrl={newCompUrl}
            onNewCompNameChange={setNewCompName}
            onNewCompUrlChange={setNewCompUrl}
            onAddCompetitor={handleAddCompetitor}
            onRemoveCompetitor={handleRemoveCompetitor}
            onAcceptSuggestion={handleAcceptSuggestion}
            onDismissSuggestion={handleDismissSuggestion}
            onEditSuggestion={handleEditSuggestion}
            onUpdateCompetitor={handleUpdateCompetitor}
            acceptingId={acceptingId}
            editingSuggestionId={acceptingId}
            discoveryStatus={sectionStatus.competitors}
            onGenerateCompetitors={runCompetitorDiscovery}
            enrichmentStatus={sectionStatus.competitorEnrichment}
            onEnrichCompetitor={handleEnrichCompetitor}
        />
    );

    const handleAddIcp = async () => {
        const payload = icpDraftToPayload(icpDraft);
        if (!payload) return;
        try {
            const created = await brandService.addPersona(workspaceId, icpPayloadToPersona(payload));
            setIcps((list) => [...list, created]);
            setIcpDraft(EMPTY_ICP_DRAFT);
            setShowIcpForm(false);
        } catch (err) {
            console.error('Add ICP failed:', err);
        }
    };

    const handleRemoveIcp = async (id) => {
        try {
            await brandService.removePersona(workspaceId, id);
            setIcps((list) => list.filter((p) => p.id !== id));
        } catch (err) {
            console.error('Remove ICP failed:', err);
        }
    };

    const renderAudience = () => {
        const icpLoading = refreshing || popStatus === 'running';

        return (
            <div className="intel-view-root">
                <div className="intel-section-header">
                    <span className="brand-intel-module__source-label">ICP discovery</span>
                    <SectionGenerateControl
                        status={sectionStatus.icps}
                        onGenerate={runIcpDiscovery}
                        idleLabel="Generate ICPs"
                    />
                </div>

                {icpSuggestions.length === 0 && !icpLoading && (
                    <p className="brand-intel-module__empty brand-intel-module__empty--banner">
                        No ICP suggestions yet. Use “Generate ICPs” above after adding a website URL or project files, or add one manually below.
                    </p>
                )}

                {icpSuggestions.length > 0 && (
                    <section className="competitor-panel__section">
                        <p className="suggestion-list__heading">Suggested ICPs</p>
                        <div className="suggestion-list">
                            {icpSuggestions.map((s) => (
                                <IcpSuggestionCard
                                    key={s.id}
                                    suggestion={s}
                                    accepting={acceptingId === s.id}
                                    saving={acceptingId === s.id}
                                    onAccept={() => handleAcceptSuggestion(s)}
                                    onDismiss={() => handleDismissSuggestion(s.id)}
                                    onSaveEdit={(payload) => handleEditSuggestion(s.id, payload)}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {icpSuggestions.length === 0 && icpLoading && (
                    <p className="brand-intel-module__empty brand-intel-module__empty--banner">
                        Analyzing website and project files for audience suggestions…
                    </p>
                )}

                <div className="intel-section-header">
                    <div>
                        <label className="data-label">Confirmed Ideal Customer Profiles</label>
                        <span className="brand-intel-module__source-label">
                            {icps.length === 0 ? 'No ICPs saved yet' : `${icps.length} saved`}
                        </span>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowIcpForm((s) => !s)}>
                        {showIcpForm ? 'Close' : 'Add ICP'}
                    </button>
                </div>

                {showIcpForm && (
                    <div className="icp-form kepler-tile">
                        <div className="data-section">
                            <label className="data-label">Segment</label>
                            <input className="intel-input" value={icpDraft.segment} placeholder="e.g. Mid-market SaaS marketing teams"
                                onChange={(e) => setIcpDraft({ ...icpDraft, segment: e.target.value })} />
                        </div>
                        <div className="data-section">
                            <label className="data-label">Role / Title *</label>
                            <input className="intel-input" value={icpDraft.role} placeholder="e.g. Marketing Decision Maker"
                                onChange={(e) => setIcpDraft({ ...icpDraft, role: e.target.value })} />
                        </div>
                        <div className="data-section">
                            <label className="data-label">Job Titles (comma-separated)</label>
                            <input className="intel-input" value={icpDraft.titles} placeholder="CMO, VP Marketing"
                                onChange={(e) => setIcpDraft({ ...icpDraft, titles: e.target.value })} />
                        </div>
                        <div className="data-section">
                            <label className="data-label">Company Type</label>
                            <input className="intel-input" value={icpDraft.companyType} placeholder="e.g. B2B SaaS, 50-200 employees"
                                onChange={(e) => setIcpDraft({ ...icpDraft, companyType: e.target.value })} />
                        </div>
                        <div className="data-section">
                            <label className="data-label">Geography</label>
                            <input className="intel-input" value={icpDraft.geography} placeholder="e.g. North America"
                                onChange={(e) => setIcpDraft({ ...icpDraft, geography: e.target.value })} />
                        </div>
                        <div className="data-section">
                            <label className="data-label">Primary Pains</label>
                            <textarea className="intel-textarea" value={icpDraft.primaryPains}
                                onChange={(e) => setIcpDraft({ ...icpDraft, primaryPains: e.target.value })} />
                        </div>
                        <div className="data-section">
                            <label className="data-label">Triggers</label>
                            <textarea className="intel-textarea" value={icpDraft.triggers}
                                onChange={(e) => setIcpDraft({ ...icpDraft, triggers: e.target.value })} />
                        </div>
                        <div className="data-section">
                            <label className="data-label">Blockers / Objections</label>
                            <textarea className="intel-textarea" value={icpDraft.blockers}
                                onChange={(e) => setIcpDraft({ ...icpDraft, blockers: e.target.value })} />
                        </div>
                        <div className="data-section">
                            <label className="data-label">Buying Context</label>
                            <textarea className="intel-textarea" value={icpDraft.buyingContext}
                                onChange={(e) => setIcpDraft({ ...icpDraft, buyingContext: e.target.value })} />
                        </div>
                        <div className="data-section">
                            <label className="data-label">Messaging Hooks (comma-separated)</label>
                            <input className="intel-input" value={icpDraft.messagingHooks} placeholder="Save time, Prove ROI"
                                onChange={(e) => setIcpDraft({ ...icpDraft, messagingHooks: e.target.value })} />
                        </div>
                        <div className="data-section">
                            <label className="data-label">Preferred Channels (comma-separated)</label>
                            <input className="intel-input" value={icpDraft.channels} placeholder="LinkedIn, Email"
                                onChange={(e) => setIcpDraft({ ...icpDraft, channels: e.target.value })} />
                        </div>
                        <button type="button" className="btn btn-primary" onClick={handleAddIcp}>Save ICP</button>
                    </div>
                )}

                <div className="icp-grid">
                    {icps.length === 0 && !showIcpForm && icpSuggestions.length === 0 && !icpLoading && (
                        <p className="brand-intel-module__empty">No ICPs yet. Accept a suggestion or add manually.</p>
                    )}
                    {icps.map((icp) => (
                        <div key={icp.id} className="icp-card kepler-tile">
                            <div className="icp-card__header">
                                <h3>{icp.segment || icp.role}</h3>
                                <button type="button" className="btn-destructive" onClick={() => handleRemoveIcp(icp.id)}>Remove</button>
                            </div>
                            {icp.segment && icp.role && icp.role !== icp.segment && (
                                <span className="brand-intel-module__source-label">{icp.role}</span>
                            )}
                            <div className="data-section">
                                <label className="data-label">Job Titles</label>
                                {icp.titles.length === 0 ? <p className="brand-intel-module__empty">None</p> : (
                                    <ul className="icp-list">{icp.titles.map((t, i) => <li key={i}>{t}</li>)}</ul>
                                )}
                            </div>
                            {(icp.companyType || icp.geography) && (
                                <div className="data-section">
                                    <label className="data-label">Firmographics</label>
                                    <p className="icp-pain-text">
                                        {[icp.companyType, icp.geography].filter(Boolean).join(' · ')}
                                    </p>
                                </div>
                            )}
                            <div className="data-section">
                                <label className="data-label">Primary Pains</label>
                                <p className="icp-pain-text">{icp.painPoints || 'Not set'}</p>
                            </div>
                            {icp.triggers && (
                                <div className="data-section">
                                    <label className="data-label">Triggers</label>
                                    <p className="icp-pain-text">{icp.triggers}</p>
                                </div>
                            )}
                            {icp.blockers && (
                                <div className="data-section">
                                    <label className="data-label">Blockers</label>
                                    <p className="icp-pain-text">{icp.blockers}</p>
                                </div>
                            )}
                            {icp.buyingContext && (
                                <div className="data-section">
                                    <label className="data-label">Buying Context</label>
                                    <p className="icp-pain-text">{icp.buyingContext}</p>
                                </div>
                            )}
                            {icp.messagingHooks?.length > 0 && (
                                <div className="data-section">
                                    <label className="data-label">Messaging Hooks</label>
                                    <div className="chip-container">
                                        {icp.messagingHooks.map((h, i) => <span key={i} className="intel-chip">{h}</span>)}
                                    </div>
                                </div>
                            )}
                            <div className="data-section">
                                <label className="data-label">Preferred Channels</label>
                                <div className="chip-container">
                                    {icp.channels.length === 0 ? <p className="brand-intel-module__empty">None</p> :
                                        icp.channels.map((c, i) => <span key={i} className="intel-chip">{c}</span>)}
                                </div>
                            </div>
                            <div className="intel-action-row icp-card__actions">
                                <button type="button" className="btn btn-secondary" onClick={() => navigate(`${workspacePath(workspaceId, 'outreach')}?icp=${icp.id}`)}>Draft outreach</button>
                                <button type="button" className="btn btn-secondary" onClick={() => navigate(`${workspacePath(workspaceId, 'ad-campaigns')}?icp=${icp.id}`)}>Create ads</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderFiles = () => (
        <div className="intel-view-root">
            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="brand-intel-module__file-input"
                accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif,.svg"
                onChange={(e) => {
                    handleFileUpload(Array.from(e.target.files ?? []));
                    e.target.value = '';
                }}
            />
            <UploadZone
                title={uploading ? 'Uploading…' : 'Drop project files or click to upload'}
                subtitle="Files are stored as intelligence sources. You can include/exclude and reprocess anytime."
                onBrowse={() => fileInputRef.current?.click()}
            />
            {uploadError && <p className="brand-intel-module__error" role="alert">{uploadError}</p>}

            <div className="intel-action-row">
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleRefreshFromFiles}
                    disabled={refreshing || popStatus === 'running'}
                >
                    {refreshing || popStatus === 'running' ? 'Refreshing…' : 'Refresh suggestions using files'}
                </button>
            </div>

            <span className="brand-intel-module__source-label">
                {files.length === 0 ? 'No files uploaded yet' : `${files.length} project file${files.length === 1 ? '' : 's'}`}
            </span>

            {files.length === 0 ? (
                <p className="brand-intel-module__empty">
                    Upload brand guides, pitch decks, or strategy docs. Parsed content feeds population across all tabs.
                </p>
            ) : (
                <table className="file-table">
                    <thead>
                        <tr>
                            <th>File name</th>
                            <th>Type</th>
                            <th>Uploaded</th>
                            <th>State</th>
                            <th>Included</th>
                            <th>Learned</th>
                            <th>Size</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {files.map((f) => (
                            <tr key={f.id}>
                                <td>{f.name}</td>
                                <td>{f.mimeType ? f.mimeType.split('/').pop().toUpperCase() : '-'}</td>
                                <td>{formatRelativeDate(f.uploadedAt)}</td>
                                <td><span className={`status-pill-minimal ${f.status}`}>{f.status}</span></td>
                                <td>{f.includedInAnalysis !== false ? 'Yes' : 'No'}</td>
                                <td>
                                    <span
                                        className="file-learned-cell"
                                        title={(f.analysisMeta?.extractedThemes ?? []).join(', ')}
                                    >
                                        {(f.analysisMeta?.extractedThemes?.length ?? 0) > 0
                                            ? f.analysisMeta.extractedThemes.slice(0, 3).join(', ')
                                            : (f.extractionNote || 'No summary yet')}
                                    </span>
                                </td>
                                <td>{f.size}</td>
                                <td>
                                    <div className="file-actions-cell">
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            disabled={fileActionId === f.id || f.canReprocess === false}
                                            onClick={() => handleReprocessFile(f)}
                                        >
                                            {f.canReprocess === false ? 'Not supported' : 'Reprocess'}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            disabled={fileActionId === f.id}
                                            onClick={() => handleToggleFileIncluded(f)}
                                        >
                                            {f.includedInAnalysis !== false ? 'Exclude' : 'Include'}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-destructive"
                                            onClick={() => handleRemoveFile(f)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );

    const renderSubContent = () => {
        switch (subTab) {
            case 'overview': return renderOverview();
            case 'details': return renderDetails();
            case 'competitors': return renderCompetitors();
            case 'audience': return renderAudience();
            case 'files': return renderFiles();
            default: return renderOverview();
        }
    };

    const isOverview = subTab === 'overview';

    return (
        <ModuleScreen
            className="brand-intel-module module-kepler"
            moduleKey={`brand-intel-${subTab}`}
            /* The health strip's four numbers as a status line. They are context
               for the profile, not a section of their own. */
            status={isOverview && brandHealth ? (
                <>
                    <span>
                        <strong>
                            {brandHealth.avgConfidence === null ? '—' : `${Math.round(brandHealth.avgConfidence * 100)}%`}
                        </strong>{' '}
                        confidence
                    </span>
                    {brandHealth.staleCount > 0 && <span>{brandHealth.staleCount} stale (90d+)</span>}
                    {brandHealth.unknownCount > 0 && <span>{brandHealth.unknownCount} unscored</span>}
                    {brandHealth.lastSyncedAt && <span>Synced {formatRelativeTime(brandHealth.lastSyncedAt)}</span>}
                    {editing && <span className="brand-intel-module__editing-flag">Editing</span>}
                </>
            ) : null}
            actions={isOverview && editing ? (
                <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} disabled={saving}>
                    Cancel
                </button>
            ) : null}
            primary={subTab === 'audience' ? (
                <button type="button" className="btn btn-primary" onClick={() => setShowIcpForm((v) => !v)}>
                    {showIcpForm ? 'Close ICP form' : 'Add ICP'}
                </button>
            ) : isOverview ? (
                editing ? (
                    <button type="button" className="btn btn-primary" onClick={handleSaveBrand} disabled={saving}>
                        {saving ? 'Saving…' : 'Save brand profile'}
                    </button>
                ) : (
                    <button type="button" className="btn btn-primary" onClick={handleStartEdit}>
                        {isLiveEmptyBrand ? 'Configure brand' : 'Edit brand'}
                    </button>
                )
            ) : null}
            railLabel="Sources &amp; learning"
            rail={isOverview ? (
                <ToolRail>
                    <ToolGroup label="Keep it current">
                        <ToolCard
                            title="Refresh from sources"
                            state={popStatus === 'running' ? 'Running' : (sourcesUsed.length ? `${sourcesUsed.length} sources` : null)}
                            tone={popStatus === 'running' ? 'warn' : 'ok'}
                            defaultOpen
                        >
                            <BrandPopulationBanner
                                status={popStatus}
                                stage={popStage}
                                errors={popErrors}
                                sourcesUsed={sourcesUsed}
                                fieldsUpdated={fieldsUpdated}
                                onRefresh={handleRefreshPopulation}
                                refreshing={refreshing}
                            />
                        </ToolCard>
                        <ToolCard
                            title="Learned updates"
                            state={fieldSuggestions.length ? `${fieldSuggestions.length} proposed` : null}
                            tone={fieldSuggestions.length ? 'ok' : 'idle'}
                        >
                            <LearnedUpdatesCard
                                items={fieldSuggestions}
                                onAccept={handleAcceptLearned}
                                onDismiss={handleDismissLearned}
                                onScan={handleScanLearnings}
                                scanning={learnScanning}
                                busyId={learnBusyId}
                                notice={learnNotice}
                            />
                        </ToolCard>
                    </ToolGroup>
                </ToolRail>
            ) : null}
        >
            {loading ? (
                <EmptyState loading message="Loading brand intelligence…" />
            ) : (
                <Panel variant="quiet">{renderSubContent()}</Panel>
            )}
        </ModuleScreen>
    );
};

export default BrandIntelligence;
