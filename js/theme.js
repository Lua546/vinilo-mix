/**
 * theme.js
 * Canvas-based dominant color extraction, palette generation,
 * and CSS variable injection via GSAP.
 *
 * Never modifies audio or playlist state.
 */

// ── Color cache ───────────────────────────────────────
// Keyed by cover URL. Prevents re-analyzing the same image.
const colorCache = new Map();

// ── Fallback ──────────────────────────────────────────
const FALLBACK_RGB = { r: 143, g: 0, b: 24 };

// ── Canvas analysis ───────────────────────────────────

/**
 * Extract the dominant saturated color from an image element.
 * Strategy (lightweight, no heavy clustering):
 *  1. Draw to a small canvas (80×80)
 *  2. Sample all pixels
 *  3. Skip near-white, near-black, low-saturation
 *  4. Quantize to 20-step buckets and accumulate weight
 *  5. Return the highest-weight bucket's average color
 *
 * @param {HTMLImageElement} img
 * @returns {{ r: number, g: number, b: number }}
 */
function extractDominantColor(img) {
    try {
        const SAMPLE_SIZE = 80;
        const canvas  = document.createElement('canvas');
        const ctx     = canvas.getContext('2d');
        canvas.width  = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;

        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

        const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const buckets  = new Map();

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // Skip transparent
            if (a < 128) continue;

            // Convert to HSL to filter by saturation/lightness
            const { h, s, l } = rgbToHsl(r, g, b);

            // Skip near-white (very light)
            if (l > 0.88) continue;
            // Skip near-black
            if (l < 0.08) continue;
            // Skip desaturated greys
            if (s < 0.18) continue;

            // Quantize to buckets (step of 20 per channel)
            const step = 20;
            const key  = `${Math.round(r / step) * step},${Math.round(g / step) * step},${Math.round(b / step) * step}`;

            if (!buckets.has(key)) {
                buckets.set(key, { r: 0, g: 0, b: 0, count: 0, saturation: 0 });
            }

            const bucket = buckets.get(key);
            bucket.r         += r;
            bucket.g         += g;
            bucket.b         += b;
            bucket.saturation += s;
            bucket.count     += 1;
        }

        if (buckets.size === 0) {
            console.warn('[Theme] No usable pixels found, using fallback.');
            return FALLBACK_RGB;
        }

        // Score: count weighted by average saturation
        let bestBucket = null;
        let bestScore  = -1;

        for (const bucket of buckets.values()) {
            const avgSat = bucket.saturation / bucket.count;
            const score  = bucket.count * (1 + avgSat * 2.5);
            if (score > bestScore) {
                bestScore  = score;
                bestBucket = bucket;
            }
        }

        return {
            r: Math.round(bestBucket.r / bestBucket.count),
            g: Math.round(bestBucket.g / bestBucket.count),
            b: Math.round(bestBucket.b / bestBucket.count),
        };
    } catch (err) {
        console.error('[Theme] Canvas extraction failed:', err);
        return FALLBACK_RGB;
    }
}

// ── Palette generation ────────────────────────────────

/**
 * Derive the full accent palette from a base RGB color.
 * @param {{ r, g, b }} rgb
 * @returns {object} palette with CSS color strings
 */
function generatePalette(rgb) {
    const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);

    // Clamp saturation so muted colors still pop a bit
    const adjS = Math.max(s, 0.45);
    // Keep lightness in a readable mid range
    const adjL = Math.min(Math.max(l, 0.22), 0.52);

    const accent      = hslToHex(h, adjS,        adjL);
    const accentDark  = hslToHex(h, adjS,        Math.max(adjL - 0.14, 0.10));
    const accentLight = hslToHex(h, adjS,        Math.min(adjL + 0.12, 0.70));
    const accentSoft  = hslToRgba(h, adjS, adjL, 0.12);
    const contrast    = getContrastColor({ r: rgb.r, g: rgb.g, b: rgb.b });

    return { accent, accentDark, accentLight, accentSoft, contrast };
}

/**
 * Determine white or dark text color based on relative luminance.
 * WCAG formula for readability.
 * @param {{ r, g, b }} rgb
 * @returns {'#ffffff' | '#1a1714'}
 */
function getContrastColor({ r, g, b }) {
    const toLinear = (c) => {
        const n = c / 255;
        return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
    };
    const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    return L > 0.179 ? '#1a1714' : '#ffffff';
}

// ── Apply theme via GSAP ──────────────────────────────

/**
 * Animate CSS variables on :root from current to new palette.
 * GSAP directly interpolates custom properties for smooth transitions.
 * @param {object} palette
 */
function applyTheme(palette) {
    const root = document.documentElement;
    gsap.to(root, {
        duration: 0.65,
        ease: 'power2.out',
        '--accent':          palette.accent,
        '--accent-dark':     palette.accentDark,
        '--accent-light':    palette.accentLight,
        '--accent-soft':     palette.accentSoft,
        '--accent-contrast': palette.contrast,
    });
}

// ── Public API ────────────────────────────────────────

/**
 * Analyze a cover image and update the theme.
 * Caches results by URL to avoid redundant analysis.
 *
 * @param {HTMLImageElement} imgEl  - the album cover element (must be loaded)
 * @param {string}           url    - cover URL used as cache key
 */
export function updateTheme(imgEl, url) {
    // Cache hit
    if (colorCache.has(url)) {
        applyTheme(colorCache.get(url));
        return;
    }

    // Ensure image is loaded before drawing to canvas
    const analyze = () => {
        try {
            const rgb     = extractDominantColor(imgEl);
            const palette = generatePalette(rgb);
            colorCache.set(url, palette);
            applyTheme(palette);
        } catch (err) {
            console.error('[Theme] Analysis error, using fallback:', err);
            applyTheme(generatePalette(FALLBACK_RGB));
        }
    };

    if (imgEl.complete && imgEl.naturalWidth > 0) {
        analyze();
    } else {
        imgEl.addEventListener('load', analyze, { once: true });
        imgEl.addEventListener('error', () => {
            console.error('[Theme] Image failed to load, using fallback.');
            applyTheme(generatePalette(FALLBACK_RGB));
        }, { once: true });
    }
}

/**
 * Apply the fallback theme immediately (used on init error).
 */
export function applyFallbackTheme() {
    applyTheme(generatePalette(FALLBACK_RGB));
}

// ── Color math helpers ────────────────────────────────

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return { h, s, l };
}

function hslToHex(h, s, l) {
    const k = (n) => (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
        const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function hslToRgba(h, s, l, alpha) {
    const k = (n) => (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
        return Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    };
    return `rgba(${f(0)}, ${f(8)}, ${f(4)}, ${alpha})`;
}
