/**
 * floatingBackground.js
 * Scalable, responsive, high-performance animated floating background system powered by GSAP.
 * Dynamically discovers images in assets/floating-elements/ and distributes elements
 * across the entire viewport with smooth levitation and song-change transitions.
 */

// ── Module State ──────────────────────────────────────
let containerEl = null;
let discoveredAssets = null; // cached array of image URLs
let currentFloatingElements = [];
let activeTweens = [];
let isScanning = false;
let resizeTimer = null;

/**
 * Scan assets/floating-elements/ for numbered PNG images (1.png, 2.png, ...).
 * Probes sequentially and tolerates missing/empty folder gracefully without console errors.
 * @returns {Promise<string[]>} Array of valid image URLs
 */
export async function scanFloatingAssets() {
    if (discoveredAssets !== null) return discoveredAssets;
    if (isScanning) return [];
    isScanning = true;

    const found = [];
    const maxConsecutiveMisses = 2;
    const maxProbeCount = 50; // Maximum images to scan sequentially
    let misses = 0;

    for (let i = 1; i <= maxProbeCount; i++) {
        const url = `./assets/floating-elements/${i}.png`;
        const exists = await probeImage(url);

        if (exists) {
            found.push(url);
            misses = 0;
        } else {
            misses++;
            if (misses >= maxConsecutiveMisses) {
                break; // Stop scanning after consecutive misses
            }
        }
    }

    discoveredAssets = found;
    isScanning = false;
    return discoveredAssets;
}

/**
 * Probe whether an image exists and can be loaded in memory.
 * Silently catches 404s/network errors without throwing.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
function probeImage(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
    });
}

/**
 * Generate stratified distributed positions across the full viewport.
 * Uses grid cell jitter to ensure elements span across the entire screen
 * without clustering or overlapping heavily.
 * @param {number} vw Viewport width
 * @param {number} vh Viewport height
 * @returns {Array<{x: number, y: number, size: number}>}
 */
function generateDistributedPositions(vw, vh) {
    let cols = 4;
    let rows = 4;

    if (vw >= 1440) {
        cols = 5;
        rows = 4;
    } else if (vw >= 1024) {
        cols = 5;
        rows = 3;
    } else if (vw >= 640) {
        cols = 4;
        rows = 3;
    } else {
        cols = 3;
        rows = 4;
    }

    const cellWidth = vw / cols;
    const cellHeight = vh / rows;
    const baseDimension = Math.min(vw, vh);

    const positions = [];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // Element size: small relative to screen
            const minSize = Math.max(20, Math.round(baseDimension * 0.035));
            const maxSize = Math.max(28, Math.round(baseDimension * 0.058));
            const size = Math.round(gsap.utils.random(minSize, maxSize));

            // Jittered random offset inside each cell
            const minX = c * cellWidth + 12;
            const maxX = Math.max(minX, (c + 1) * cellWidth - size - 12);
            const minY = r * cellHeight + 12;
            const maxY = Math.max(minY, (r + 1) * cellHeight - size - 12);

            const x = Math.round(gsap.utils.random(minX, maxX));
            const y = Math.round(gsap.utils.random(minY, maxY));

            positions.push({ x, y, size });
        }
    }

    // Shuffle array so entrance animation staggers organically across the screen
    return gsap.utils.shuffle(positions);
}

/**
 * Kill all active floating animations.
 */
function killActiveTweens() {
    activeTweens.forEach((t) => {
        if (t && typeof t.kill === 'function') t.kill();
    });
    activeTweens = [];
}

/**
 * Animate levitation physics on a floating DOM element using GSAP transforms.
 * @param {HTMLElement} el
 */
function applyLevitation(el) {
    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isReducedMotion) return;

    // Organic floating on Y
    const yTween = gsap.to(el, {
        y: `+=${gsap.utils.random(-15, 15, 1)}`,
        duration: gsap.utils.random(3.8, 6.8),
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        delay: gsap.utils.random(0, 1.5)
    });

    // Organic sway on X
    const xTween = gsap.to(el, {
        x: `+=${gsap.utils.random(-12, 12, 1)}`,
        duration: gsap.utils.random(4.5, 7.5),
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        delay: gsap.utils.random(0, 1.5)
    });

    // Gentle rotation
    const rotTween = gsap.to(el, {
        rotation: `+=${gsap.utils.random(-22, 22, 1)}`,
        duration: gsap.utils.random(5.5, 9.0),
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        delay: gsap.utils.random(0, 2)
    });

    // Subtle scale breathing
    const scaleTween = gsap.to(el, {
        scale: `*=${gsap.utils.random(0.92, 1.08)}`,
        duration: gsap.utils.random(3.5, 5.5),
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        delay: gsap.utils.random(0, 1)
    });

    activeTweens.push(yTween, xTween, rotTween, scaleTween);
}

/**
 * Generate a new set of floating elements and animate them into the scene.
 * @param {boolean} isInitial
 */
export async function refreshFloatingBackground(isInitial = false) {
    if (!containerEl) {
        containerEl = document.getElementById('floating-background');
        if (!containerEl) return;
    }

    const assets = await scanFloatingAssets();
    if (!assets || assets.length === 0) {
        // Graceful handling if empty: clean up and exit
        killActiveTweens();
        currentFloatingElements.forEach((el) => el.remove());
        currentFloatingElements = [];
        return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const positions = generateDistributedPositions(vw, vh);
    if (positions.length === 0) return;

    // Handle transition of existing elements
    const oldElements = [...currentFloatingElements];
    currentFloatingElements = [];

    if (oldElements.length > 0) {
        gsap.to(oldElements, {
            autoAlpha: 0,
            scale: 0.4,
            duration: 0.35,
            stagger: 0.02,
            ease: 'power2.in',
            onComplete: () => {
                oldElements.forEach((el) => {
                    gsap.killTweensOf(el);
                    el.remove();
                });
            }
        });
    }

    // Create new DOM elements
    const newElements = [];
    positions.forEach((pos) => {
        // Randomly choose asset from discovered assets
        const assetUrl = assets[Math.floor(Math.random() * assets.length)];
        const img = document.createElement('img');
        img.className = 'floating-element';
        img.src = assetUrl;
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.draggable = false;

        // Base initial positioning across the full background
        img.style.left = `${pos.x}px`;
        img.style.top = `${pos.y}px`;
        img.style.width = `${pos.size}px`;
        img.style.height = `${pos.size}px`;

        const targetAlpha = gsap.utils.random(0.18, 0.35);
        const initialRotation = gsap.utils.random(-25, 25);

        // Initial GSAP setup
        gsap.set(img, {
            autoAlpha: 0,
            scale: 0.4,
            rotation: initialRotation,
            transformOrigin: '50% 50%',
            force3D: true,
        });

        containerEl.appendChild(img);
        newElements.push({ el: img, targetAlpha });
        currentFloatingElements.push(img);
    });

    // Entrance animation
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    newElements.forEach(({ el, targetAlpha }, index) => {
        tl.to(el, {
            autoAlpha: targetAlpha,
            scale: 1,
            duration: isInitial ? 0.9 : 0.6,
            ease: 'back.out(1.4)',
            onStart: () => applyLevitation(el)
        }, index * 0.04);
    });
}

/**
 * Initialize the floating background system.
 * Handles lifecycle, resize, visibility change, and reduced motion.
 */
export async function initFloatingBackground() {
    containerEl = document.getElementById('floating-background');
    if (!containerEl) {
        containerEl = document.createElement('div');
        containerEl.id = 'floating-background';
        containerEl.className = 'floating-background';
        containerEl.setAttribute('aria-hidden', 'true');
        document.body.prepend(containerEl);
    }

    // Debounced resize listener
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            killActiveTweens();
            refreshFloatingBackground(false);
        }, 300);
    });

    // Tab visibility handling (pause/resume to save resources)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            activeTweens.forEach((t) => t.pause());
        } else {
            activeTweens.forEach((t) => t.resume());
        }
    });

    // Initial background generation
    await refreshFloatingBackground(true);
}
