import { useState } from 'react';
import ProvenanceLabel from './ProvenanceLabel';
import BrandFieldSkeleton from './BrandFieldSkeleton';
import { COLOR_IDENTITY_FIELDS } from '../../lib/brandContracts';
import './BrandColorsPanel.css';

const toPickerValue = (hex) => {
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return '#808080';
    return hex;
};

const ColorField = ({ fieldKey, label, value, editing, onChange, provenanceEntry }) => (
    <div className="color-field">
        <label className="data-label">{label}</label>
        <div className="color-field__row">
            {editing ? (
                <label className="color-field__picker-wrap" aria-label={`Pick ${label}`}>
                    <input
                        type="color"
                        className="color-field__picker"
                        value={toPickerValue(value)}
                        onChange={(e) => onChange(fieldKey, e.target.value)}
                    />
                    <span
                        className="color-field__swatch color-field__swatch--interactive"
                        style={{ backgroundColor: value || 'transparent' }}
                    />
                </label>
            ) : (
                value && (
                    <div
                        className="color-field__swatch"
                        style={{ backgroundColor: value }}
                        aria-hidden="true"
                    />
                )
            )}
            <input
                type="text"
                className="intel-input color-field__input"
                value={value}
                readOnly={!editing}
                placeholder={editing ? '#000000' : 'Not set'}
                onChange={(e) => onChange(fieldKey, e.target.value)}
            />
        </div>
        <ProvenanceLabel entry={provenanceEntry} />
    </div>
);

const BrandColorsPanel = ({
    colorIdentity,
    fieldProvenance = {},
    editing,
    onChange,
    loading = false,
    lowConfidence = false,
}) => {
    const [logoError, setLogoError] = useState('');

    // Logo upload - hard-forces SVG (vector = crisp + easy for the design generator).
    const handleLogoFile = (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
        if (!isSvg) { setLogoError('Logo must be an SVG file (vector).'); return; }
        if (file.size > 300 * 1024) { setLogoError('SVG is too large (max 300 KB).'); return; }
        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result || '');
            if (!/<svg[\s>]/i.test(text)) { setLogoError('That file does not look like a valid SVG.'); return; }
            setLogoError('');
            onChange('logoSvg', text);
        };
        reader.onerror = () => setLogoError('Could not read the file.');
        reader.readAsText(file);
    };

    if (loading) {
        return (
            <div className="brand-colors-panel kepler-tile brand-colors-panel--loading">
                <div className="brand-colors-panel__header">
                    <div className="brand-field-skeleton__label" style={{ width: 140 }} />
                </div>
                <div className="brand-colors-panel__grid">
                    {COLOR_IDENTITY_FIELDS.map(({ key }) => (
                        <BrandFieldSkeleton key={key} />
                    ))}
                </div>
                <BrandFieldSkeleton />
                <BrandFieldSkeleton lines={1} tall />
            </div>
        );
    }

    const hasAnyColor = COLOR_IDENTITY_FIELDS.some(({ key }) => colorIdentity?.[key]);
    const hasNotes = Boolean(
        colorIdentity?.typographySuggestion?.trim() ||
        colorIdentity?.visualDirectionNotes?.trim()
    );
    const isEmpty = !hasAnyColor && !hasNotes;

    return (
        <div className="brand-colors-panel kepler-tile">
            <div className="brand-colors-panel__header">
                <label className="data-label">Brand Identity Colours</label>
                <span className="brand-intel-module__hint">
                    Structured palette - edit via Configure brand
                </span>
            </div>

            {isEmpty && (
                <p className="brand-intel-module__empty">
                    {lowConfidence
                        ? 'Website extraction unavailable. Add a URL, upload project files, or edit colours manually.'
                        : 'No colour identity yet. Refresh from sources or edit manually.'}
                </p>
            )}

            <div className="brand-colors-panel__grid">
                {COLOR_IDENTITY_FIELDS.map(({ key, label }) => (
                    <ColorField
                        key={key}
                        fieldKey={key}
                        label={label}
                        value={colorIdentity?.[key] ?? ''}
                        editing={editing}
                        onChange={onChange}
                        provenanceEntry={fieldProvenance[`colorIdentity.${key}`]}
                    />
                ))}
            </div>

            <div className="data-section">
                <label className="data-label">Typography suggestion</label>
                <input
                    type="text"
                    className="intel-input"
                    value={colorIdentity?.typographySuggestion ?? ''}
                    readOnly={!editing}
                    placeholder={editing ? 'e.g. Inter, geometric sans-serif' : 'Not set'}
                    onChange={(e) => onChange('typographySuggestion', e.target.value)}
                />
                <ProvenanceLabel entry={fieldProvenance['colorIdentity.typographySuggestion']} />
            </div>

            <div className="data-section">
                <label className="data-label">Visual direction notes</label>
                <textarea
                    className="intel-textarea brand-colors-panel__notes"
                    value={colorIdentity?.visualDirectionNotes ?? ''}
                    readOnly={!editing}
                    placeholder={editing ? 'Describe the visual direction…' : 'Not set'}
                    onChange={(e) => onChange('visualDirectionNotes', e.target.value)}
                />
                <ProvenanceLabel entry={fieldProvenance['colorIdentity.visualDirectionNotes']} />
            </div>

            <div className="data-section">
                <label className="data-label">Brand logo (SVG)</label>
                {colorIdentity?.logoSvg ? (
                    <div className="brand-logo-field">
                        <img
                            className="brand-logo-field__preview"
                            src={`data:image/svg+xml;utf8,${encodeURIComponent(colorIdentity.logoSvg)}`}
                            alt="Brand logo"
                        />
                        {editing && (
                            <div className="brand-logo-field__actions">
                                <label className="btn btn-secondary brand-logo-field__replace">
                                    Replace
                                    <input type="file" accept=".svg,image/svg+xml" hidden onChange={handleLogoFile} />
                                </label>
                                <button type="button" className="btn btn-ghost" onClick={() => onChange('logoSvg', '')}>
                                    Remove
                                </button>
                            </div>
                        )}
                    </div>
                ) : editing ? (
                    <label className="logo-drop-zone brand-logo-field__drop">
                        <span>Upload an SVG logo</span>
                        <span className="brand-logo-field__drop-hint">Vector only · used in generated designs</span>
                        <input type="file" accept=".svg,image/svg+xml" hidden onChange={handleLogoFile} />
                    </label>
                ) : (
                    <p className="brand-intel-module__hint">No logo uploaded. Add an SVG (via Configure brand) to brand your generated designs.</p>
                )}
                {logoError && <p className="brand-colors-panel__logo-error">{logoError}</p>}
            </div>
        </div>
    );
};

export default BrandColorsPanel;
