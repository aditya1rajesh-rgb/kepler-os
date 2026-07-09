import { createField } from '../fieldFactory';
import { SOURCE_ORIGINS } from '../constants';
import { normalizeColorIdentity, normalizeBusinessDetails } from '../../../lib/brandContracts';

/**
 * Extract field candidates from parsed file content.
 * @param {Array<{id?: string, name: string, text?: string, extractedText?: string}>} files
 * @param {Object} [fileAnalysis] - optional AI-parsed extraction per file batch
 */
export const extractFileSource = (files = [], fileAnalysis = null) => {
    const activeFiles = (files ?? []).filter((f) => f?.includedInAnalysis !== false);
    const fields = [];
    const fileRefs = activeFiles
        .filter((f) => f?.name)
        .map((f) => `file:${f.id ?? f.name}`);

    if (fileAnalysis) {
        const refs = fileRefs.length ? fileRefs : ['file:analysis'];
        const confidence = fileAnalysis.confidence ?? 0.75;
        const push = (key, value) => {
            if (value == null || (typeof value === 'string' && !value.trim())) return;
            if (Array.isArray(value) && value.length === 0) return;
            fields.push(createField({
                key,
                value,
                sourceOrigin: SOURCE_ORIGINS.FILE,
                sourceRefs: refs,
                confidence,
                confirmed: false,
            }));
        };

        push('overview.tagline', fileAnalysis.tagline);
        push('overview.overview', fileAnalysis.overview);
        if (Array.isArray(fileAnalysis.values)) push('overview.values', fileAnalysis.values);
        if (Array.isArray(fileAnalysis.aesthetic)) push('overview.aesthetic', fileAnalysis.aesthetic);
        if (Array.isArray(fileAnalysis.tone)) push('overview.tone', fileAnalysis.tone);

        const colors = normalizeColorIdentity(fileAnalysis.colorIdentity ?? {});
        for (const [k, v] of Object.entries(colors)) {
            if (v) push(`colors.${k}`, v);
        }

        const details = normalizeBusinessDetails(fileAnalysis.businessDetails ?? {});
        for (const [k, v] of Object.entries(details)) {
            if (v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim())) {
                push(`businessDetails.${k}`, v);
            }
        }

        return { fields, meta: { source: 'file', fileCount: activeFiles.length, parsed: true } };
    }

    // Without AI analysis, files contribute metadata only (no invented business values)
    if (activeFiles.length === 0) {
        return { fields: [], meta: { source: 'file', fileCount: 0 } };
    }

    const readyCount = activeFiles.filter((f) => (f.extractedText ?? f.text ?? '').trim()).length;

    return {
        fields,
        meta: {
            source: 'file',
            fileCount: activeFiles.length,
            parsedTextCount: readyCount,
            fileRefs,
        },
    };
};
