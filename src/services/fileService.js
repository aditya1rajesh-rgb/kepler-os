import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import { generateUuid } from '../lib/uuid';
import { mapFileRow } from '../lib/mappers';
import {
    extractTextFromBlob,
    extractTextFromFile,
    canParseFileClientSide,
    summarizeExtractedText,
} from './fileParseService';

const BUCKET = 'workspace-files';
// 25MB: comfortably fits large image-heavy PDFs/decks while staying under the
// storage bucket's 50MB hard limit (migration 002). Keep these in sync.
const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_UPLOAD_SIZE_MB = Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024));
const UNSUPPORTED_EXTRACTION_NOTE = 'Text extraction for this file type is not available in the current version.';
const isMissingColumnError = (error) => {
    if (!error) return false;
    if (error.code === 'PGRST204' || error.code === '42703') return true;
    const msg = String(error.message ?? '').toLowerCase();
    return msg.includes('column') && (msg.includes('does not exist') || msg.includes('schema cache'));
};

export const fileService = {
    getFiles: async (workspaceId) => {
        if (!isUuid(workspaceId)) {
            throw new Error('Invalid workspace id');
        }

        const { data, error } = await supabase
            .from('workspace_files')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data ?? []).map(mapFileRow);
    },

    uploadFile: async (
        workspaceId,
        file,
        scope = ['brand-intelligence'],
        { uploadSource = 'post-setup' } = {}
    ) => {
        if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
        if (!file) throw new Error('No file provided');
        if (file.size > MAX_UPLOAD_SIZE_BYTES) {
            throw new Error(`File exceeds the ${MAX_UPLOAD_SIZE_MB}MB limit. Please upload a smaller file.`);
        }

        const fileId = generateUuid();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${workspaceId}/${fileId}-${safeName}`;

        const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(storagePath, file, {
                cacheControl: '3600',
                upsert: false,
            });

        if (uploadError) throw uploadError;

        let extractedText = '';
        let status = 'pending';
        let extractionNote = '';
        let canReprocess = true;

        if (canParseFileClientSide(file)) {
            const parsed = await extractTextFromFile(file);
            extractedText = parsed.text ?? '';
            status = parsed.ok ? 'ready' : 'failed';
        } else {
            status = 'unsupported';
            extractionNote = UNSUPPORTED_EXTRACTION_NOTE;
            canReprocess = false;
        }

        const analysisMeta = extractedText
            ? {
                ...summarizeExtractedText(extractedText),
                generatedFrom: 'local-parser',
            }
            : {
                extractedThemes: [],
                extractedStats: [],
                modulesLikelyImpacted: [],
                generatedFrom: 'none',
                extractionNote,
                canReprocess,
            };

        const insertPayload = {
            id: fileId,
            workspace_id: workspaceId,
            name: file.name,
            size_bytes: file.size,
            status,
            scope,
            storage_path: storagePath,
            mime_type: file.type || 'application/octet-stream',
            extracted_text: extractedText,
            origin: uploadSource,
            included_in_analysis: true,
            analysis_meta: analysisMeta,
            analyzed_at: extractedText ? new Date().toISOString() : null,
        };

        let { data, error } = await supabase
            .from('workspace_files')
            .insert(insertPayload)
            .select()
            .maybeSingle();

        if (error && isMissingColumnError(error)) {
            const fallbackPayload = {
                id: fileId,
                workspace_id: workspaceId,
                name: file.name,
                size_bytes: file.size,
                status,
                scope,
                storage_path: storagePath,
                mime_type: file.type || 'application/octet-stream',
                extracted_text: extractedText,
                origin: uploadSource,
            };
            ({ data, error } = await supabase
                .from('workspace_files')
                .insert(fallbackPayload)
                .select()
                .maybeSingle());
        }

        if (error) throw error;
        return mapFileRow(data ?? insertPayload);
    },

    getFileTextsForPopulation: async (workspaceId) => {
        const files = await fileService.getFiles(workspaceId);
        return files
            .filter((f) => f.includedInAnalysis !== false)
            .filter((f) => f.extractedText?.trim())
            .map((f) => ({ name: f.name, text: f.extractedText }));
    },

    setIncludedInAnalysis: async (workspaceId, id, included) => {
        if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
        let { data, error } = await supabase
            .from('workspace_files')
            .update({ included_in_analysis: included })
            .eq('id', id)
            .eq('workspace_id', workspaceId)
            .select()
            .maybeSingle();
        if (error && isMissingColumnError(error)) {
            return null;
        }
        if (error) throw error;
        return mapFileRow(data ?? { id, workspace_id: workspaceId, included_in_analysis: included });
    },

    reprocessFile: async (file) => {
        if (!file?.id) throw new Error('File id is required');
        if (!isUuid(file?.workspaceId)) throw new Error('Invalid workspace id');
        // A file previously marked 'unsupported' may now be parseable (e.g. PDFs
        // after client-side PDF extraction was added). Only block reprocessing
        // when the type is still genuinely unparseable.
        const nowParseable = canParseFileClientSide({ name: file.name, type: file.mimeType });
        if (!nowParseable && (file?.canReprocess === false || file?.status === 'unsupported')) {
            throw new Error(UNSUPPORTED_EXTRACTION_NOTE);
        }

        await supabase
            .from('workspace_files')
            .update({ status: 'processing' })
            .eq('id', file.id)
            .eq('workspace_id', file.workspaceId);

        if (!file.storagePath) {
            const { data, error } = await supabase
                .from('workspace_files')
                .update({ status: 'failed' })
                .eq('id', file.id)
                .eq('workspace_id', file.workspaceId)
                .select()
                .maybeSingle();
            if (error) throw error;
            return mapFileRow(data ?? { ...file, status: 'failed' });
        }

        const { data: blob, error: dlErr } = await supabase.storage
            .from(BUCKET)
            .download(file.storagePath);
        if (dlErr) throw dlErr;

        const parsed = await extractTextFromBlob({
            blob,
            name: file.name,
            mimeType: file.mimeType,
        });

        const extractedText = parsed.text ?? '';
        const unsupported = !parsed.ok && String(parsed.error ?? '').toLowerCase().includes('deferred');
        const status = parsed.ok ? 'ready' : (unsupported ? 'unsupported' : 'failed');
        const extractionNote = unsupported ? UNSUPPORTED_EXTRACTION_NOTE : '';
        const canReprocess = !unsupported;
        const analysisMeta = extractedText
            ? {
                ...summarizeExtractedText(extractedText),
                generatedFrom: 'local-parser',
            }
            : {
                extractedThemes: [],
                extractedStats: [],
                modulesLikelyImpacted: [],
                generatedFrom: 'none',
                extractionNote,
                canReprocess,
            };

        const updatePayload = {
            status,
            extracted_text: extractedText,
            mime_type: parsed.mimeType || file.mimeType || 'application/octet-stream',
            analysis_meta: analysisMeta,
            analyzed_at: new Date().toISOString(),
        };

        let { data, error } = await supabase
            .from('workspace_files')
            .update(updatePayload)
            .eq('id', file.id)
            .eq('workspace_id', file.workspaceId)
            .select()
            .maybeSingle();

        if (error && isMissingColumnError(error)) {
            const fallbackPayload = {
                status,
                extracted_text: extractedText,
                mime_type: parsed.mimeType || file.mimeType || 'application/octet-stream',
            };
            ({ data, error } = await supabase
                .from('workspace_files')
                .update(fallbackPayload)
                .eq('id', file.id)
                .eq('workspace_id', file.workspaceId)
                .select()
                .maybeSingle());
        }

        if (error) throw error;
        return mapFileRow(data ?? { ...file, ...updatePayload });
    },

    deleteFile: async (workspaceId, id, storagePath) => {
        if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
        if (storagePath) {
            await supabase.storage.from(BUCKET).remove([storagePath]);
        }
        const { error } = await supabase
            .from('workspace_files')
            .delete()
            .eq('id', id)
            .eq('workspace_id', workspaceId);
        if (error) throw error;
        return true;
    },
};
