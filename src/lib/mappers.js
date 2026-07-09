import { canParseFileClientSide } from '../services/fileParseService';

export const mapWorkspaceRow = (row) => ({
    id: row.id,
    name: row.name,
    url: row.url ?? '',
    tagline: row.tagline ?? '',
    industry: row.industry ?? 'Consumer Brand',
    logoColor: row.logo_color ?? '#6666ff',
    brandColors: row.brand_colors ?? [],
    lastActiveModule: row.last_active_module ?? 'Brand Intelligence',
    brandIntelStatus: row.brand_intel_status ?? 0,
    createdAt: row.created_at,
});

export const mapBrandProfileRow = (row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name ?? '',
    url: row.url ?? '',
    tagline: row.tagline ?? '',
    overview: row.overview ?? '',
    colors: row.colors ?? [],
    fonts: row.fonts ?? [],
    values: row.brand_values ?? [],
    aesthetic: row.aesthetic ?? [],
    tone: row.tone ?? [],
    colorIdentity: row.color_identity ?? {},
    businessDetails: row.business_details ?? {},
    fieldProvenance: row.field_provenance ?? {},
    populationMeta: row.population_meta ?? {},
});

export const mapSuggestionRow = (row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.suggestion_type,
    payload: row.payload ?? {},
    origin: row.origin ?? 'ai',
    status: row.status ?? 'pending',
    createdAt: row.created_at,
});

export const mapCompetitorRow = (row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    url: row.url ?? '',
    confirmed: row.confirmed ?? false,
    notes: row.notes ?? '',
});

export const mapContentItemRow = (row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type ?? 'seo',
    status: row.status ?? 'queue',
    title: row.title ?? '',
    targetKeyword: row.target_keyword ?? '',
    intent: row.intent ?? '',
    payload: row.payload ?? {},
    source: row.source ?? 'manual',
    campaignId: row.campaign_id ?? null,
    campaignStepId: row.campaign_step_id ?? '',
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
});

export const mapCampaignRow = (row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title ?? '',
    goal: row.goal ?? '',
    campaignType: row.campaign_type ?? 'launch',
    status: row.status ?? 'draft',
    plan: row.plan ?? { goal: '', strategySummary: '', channelMix: [], steps: [] },
    source: row.source ?? 'strategy-engine',
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
});

export const mapWorkspaceIntegrationRow = (row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    propertyUrl: row.property_url ?? '',
    status: row.status ?? 'connected',
    meta: row.meta ?? {},
    lastSyncAt: row.last_sync_at ?? null,
    lastError: row.last_error ?? '',
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
});

export const toCampaignInsert = (workspaceId, data) => ({
    workspace_id: workspaceId,
    title: data.title ?? '',
    goal: data.goal ?? '',
    campaign_type: data.campaignType ?? 'launch',
    status: data.status ?? 'draft',
    plan: data.plan ?? {},
    source: data.source ?? 'strategy-engine',
});

export const mapPersonaRow = (row) => {
    const details = row.details ?? {};
    return {
        id: row.id,
        workspaceId: row.workspace_id,
        role: row.role,
        titles: row.titles ?? [],
        painPoints: row.pain_points ?? '',
        channels: row.channels ?? [],
        sourceOrigin: row.source_origin ?? 'manual',
        details,
        segment: details.segment ?? '',
        companyType: details.companyType ?? '',
        geography: details.geography ?? '',
        triggers: details.triggers ?? '',
        blockers: details.blockers ?? '',
        buyingContext: details.buyingContext ?? '',
        messagingHooks: details.messagingHooks ?? [],
        useCases: details.useCases ?? '',
    };
};

export const mapFileRow = (row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    size: formatFileSize(row.size_bytes),
    sizeBytes: row.size_bytes,
    status: row.status ?? 'pending',
    scope: row.scope ?? [],
    mimeType: row.mime_type ?? '',
    extractedText: row.extracted_text ?? '',
    origin: row.origin ?? 'upload',
    storagePath: row.storage_path ?? '',
    uploadedAt: row.created_at ?? null,
    includedInAnalysis: row.included_in_analysis ?? true,
    analyzedAt: row.analyzed_at ?? null,
    analysisMeta: row.analysis_meta ?? {
        extractedThemes: [],
        extractedStats: [],
        modulesLikelyImpacted: [],
    },
    extractionNote: row.analysis_meta?.extractionNote
        ?? (row.status === 'unsupported'
            ? 'Text extraction for this file type is not available in the current version.'
            : ''),
    // A stored canReprocess=false (e.g. an old PDF marked unsupported before
    // client-side PDF parsing existed) is overridden when the type is now
    // parseable, so such files can be reprocessed instead of re-uploaded.
    canReprocess: (row.analysis_meta?.canReprocess ?? (row.status !== 'unsupported'))
        || canParseFileClientSide({ name: row.name, type: row.mime_type }),
});

const formatFileSize = (bytes) => {
    if (bytes == null) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const toBrandProfileInsert = (workspaceId, data) => ({
    workspace_id: workspaceId,
    name: data.name ?? '',
    url: data.url ?? '',
    tagline: data.tagline ?? '',
    overview: data.overview ?? '',
    colors: data.colors ?? [],
    fonts: data.fonts ?? [],
    brand_values: data.values ?? [],
    aesthetic: data.aesthetic ?? [],
    tone: data.tone ?? [],
    color_identity: data.colorIdentity ?? {},
    business_details: data.businessDetails ?? {},
    field_provenance: data.fieldProvenance ?? {},
    population_meta: data.populationMeta ?? {},
});

export const toWorkspaceInsert = (data) => ({
    name: data.name?.trim() || 'Untitled workspace',
    url: data.url ?? '',
    tagline: data.tagline ?? '',
    industry: data.industry ?? 'Consumer Brand',
    logo_color: data.logoColor ?? '#6666ff',
    brand_colors: data.brandColors ?? ['#6666ff', '#b9b8ff', '#b9f0d7', '#ffffff'],
});
