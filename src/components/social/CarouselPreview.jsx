// On-brand HTML carousel renderer. Renders generated slides as square cards
// styled from the brand's color identity (Brand Intelligence → Color identity).
// HTML approach for now; an image-gen path (Fal.ai) is a later enhancement.

const FALLBACK = {
    bg: '#16162a',
    text: '#f5f5fa',
    accent: '#4a6cf7',
    muted: 'rgba(245,245,250,0.7)',
};

const resolvePalette = (colorIdentity = {}) => {
    const bg = colorIdentity.supportDarkColor || colorIdentity.primaryColor || FALLBACK.bg;
    const text = colorIdentity.backgroundLightColor || colorIdentity.textColor || FALLBACK.text;
    const accent = colorIdentity.accentColor || colorIdentity.secondaryColor || FALLBACK.accent;
    return { bg, text, accent, muted: FALLBACK.muted };
};

const CarouselPreview = ({ slides = [], colorIdentity = {} }) => {
    const p = resolvePalette(colorIdentity);
    const fontFamily = colorIdentity.typographySuggestion ? `${colorIdentity.typographySuggestion}, sans-serif` : 'inherit';
    // Brand logo (SVG) rendered via a sandboxed data-URI <img> so it can't execute scripts.
    const logoSrc = colorIdentity.logoSvg
        ? `data:image/svg+xml;utf8,${encodeURIComponent(colorIdentity.logoSvg)}`
        : null;

    return (
        <div className="carousel-preview-row" style={{ display: 'flex', gap: 16, overflowX: 'auto', padding: '8px 0' }}>
            {slides.map((slide, i) => {
                const isCover = slide.kind === 'cover';
                const isCta = slide.kind === 'cta';
                return (
                    <div
                        key={i}
                        className="carousel-slide"
                        style={{
                            flex: '0 0 auto',
                            width: 280,
                            height: 280,
                            background: isCta ? p.accent : p.bg,
                            color: isCta ? p.bg : p.text,
                            borderRadius: 16,
                            padding: 24,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: isCover ? 'center' : 'flex-start',
                            position: 'relative',
                            fontFamily,
                            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                        }}
                    >
                        <span style={{ position: 'absolute', top: 14, right: 18, fontSize: 12, opacity: 0.6 }}>
                            {i + 1}/{slides.length}
                        </span>
                        {logoSrc && (
                            <img
                                src={logoSrc}
                                alt=""
                                style={{ position: 'absolute', top: 14, left: 18, height: 18, width: 'auto', opacity: 0.9 }}
                            />
                        )}
                        {!isCover && (
                            <div style={{ width: 32, height: 4, background: isCta ? p.bg : p.accent, borderRadius: 2, marginBottom: 14 }} />
                        )}
                        <h3 style={{ margin: 0, fontSize: isCover ? 26 : 19, lineHeight: 1.2, fontWeight: 700 }}>
                            {slide.heading}
                        </h3>
                        {slide.body && (
                            <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.45, color: isCta ? p.bg : p.muted }}>
                                {slide.body}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default CarouselPreview;
