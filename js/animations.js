/**
 * animations.js
 * All GSAP animations. Single source of truth for motion.
 */

gsap.registerPlugin(Observer);

// ── Vinyl tween (one persistent instance for player) ──
let vinylTween = null;
let vinylEl = null;

export function initVinyl(elements) {
    vinylEl = elements;
    vinylTween = gsap.to(vinylEl, {
        rotation: '+=360',
        duration: 3.2,
        ease: 'none',
        repeat: -1,
        paused: true,
    });
}

export function playVinyl() {
    if (vinylTween) vinylTween.play();
}

export function pauseVinyl() {
    if (vinylTween) vinylTween.pause();
}

// ── Carousel Animations ───────────────────────────────

/**
 * Animate the vinyl carousel during a track change.
 * @param {HTMLElement} centerDisc The center vinyl disc element
 * @param {number} direction 1 for next, -1 for prev
 * @param {Function} onMidpoint Called when the disc is offscreen to swap covers
 */
export function animateCarouselChange(centerDisc, direction, onMidpoint) {
    return new Promise((resolve) => {
        const carousel = document.getElementById('vinyl-carousel');
        const center = document.getElementById('vinyl-center');
        const prev = document.getElementById('vinyl-prev');
        const next = document.getElementById('vinyl-next');

        // Set 3D perspective on the carousel parent so rotationY looks correct
        gsap.set(carousel, { perspective: 900 });

        const tl = gsap.timeline({
            onComplete: () => {
                // Instantly reset properties. Since incoming scaled up to look like center,
                // and outgoing swapped positions, this snap is visually seamless.
                gsap.set([center, prev, next], { clearProps: 'xPercent,z,scale,rotationY,opacity,visibility' });
                if (shine) gsap.set(shine, { clearProps: 'opacity,visibility' });
                resolve();
            }
        });

        const isNext = direction === 1;
        const incoming = isNext ? next : prev;
        const outgoing = isNext ? prev : next;
        const shine = center.querySelector('.vinyl-shine');

        // Target translations (constants based on relative widths: 180px vs 90px + 16px gap)
        const centerToSideX = isNext ? -84 : 84;
        const incomingToCenterX = isNext ? -168 : 168;
        const teleportX = isNext ? 436 : -436;
        const outgoingEndX = isNext ? 336 : -336;
        const outX = isNext ? -100 : 100;

        // PHASE 1: Retreat and rotate backwards (0 -> 0.3s)
        tl.to(center, {
            xPercent: centerToSideX / 2,
            z: -120,
            scale: 0.75,
            rotationY: isNext ? 35 : -35,
            autoAlpha: 0.65,
            duration: 0.3,
            ease: 'power1.in'
        }, 0)
            .to(incoming, {
                xPercent: incomingToCenterX / 2,
                z: -120,
                scale: 1.5,
                rotationY: isNext ? -35 : 35,
                autoAlpha: 0.65,
                duration: 0.3,
                ease: 'power1.in'
            }, 0)
            .to(outgoing, {
                xPercent: outX,
                z: -200,
                scale: 0.5,
                autoAlpha: 0,
                duration: 0.3,
                ease: 'power1.in'
            }, 0);

        if (shine) {
            tl.to(shine, { autoAlpha: 0, duration: 0.3 }, 0)
              .to(shine, { autoAlpha: 1, duration: 0.3 }, 0.3);
        }

        // SWAP DATA at exact midpoint
        tl.call(onMidpoint, null, 0.3);

        // TELEPORT outgoing element to the opposite side while invisible
        tl.set(outgoing, {
            xPercent: teleportX,
            rotationY: isNext ? -35 : 35,
            z: -120,
            autoAlpha: 0
        }, 0.3);

        // PHASE 2: Move forward and settle flat (0.3s -> 0.6s)
        tl.to(center, {
            xPercent: centerToSideX,
            z: 0,
            scale: 0.5, // Matches the 90px side disc
            rotationY: 0,
            autoAlpha: 0.35,
            duration: 0.3,
            ease: 'power1.out'
        }, 0.3)
            .to(incoming, {
                xPercent: incomingToCenterX,
                z: 0,
                scale: 2, // Matches the 180px center disc
                rotationY: 0,
                autoAlpha: 1,
                duration: 0.3,
                ease: 'power1.out'
            }, 0.3)
            .to(outgoing, {
                xPercent: outgoingEndX,
                z: 0,
                scale: 1, // Normal side disc scale
                rotationY: 0,
                autoAlpha: 0.35,
                duration: 0.3,
                ease: 'power1.out'
            }, 0.3);
    });
}


/**
 * Setup swipe observer for the carousel
 * @param {HTMLElement} target The carousel element
 * @param {Function} onSwipeLeft Callback
 * @param {Function} onSwipeRight Callback
 */
export function setupCarouselObserver(target, onSwipeLeft, onSwipeRight) {
    Observer.create({
        target: target,
        type: 'touch,pointer',
        dragMinimum: 20,
        onLeft: onSwipeLeft,
        onRight: onSwipeRight,
        tolerance: 20
    });
}

// ── View Transitions (SPA Routing) ────────────────────

export function animateViewTransition(outView, inView, direction = 'forward') {
    return new Promise((resolve) => {
        // Reset inView
        gsap.set(inView, { display: 'block', autoAlpha: 0, y: direction === 'forward' ? 50 : -50 });

        const tl = gsap.timeline({
            defaults: { ease: 'power3.inOut' }, onComplete: () => {
                gsap.set(outView, { display: 'none' });
                resolve();
            }
        });

        tl.to(outView, { autoAlpha: 0, y: direction === 'forward' ? -50 : 50, duration: 0.3 })
            .to(inView, { autoAlpha: 1, y: 0, duration: 0.4 }, '<0.1');
    });
}

// ── Cover transition (Player) ─────────────────────────
export function animateCoverChange(coverEl, newSrc) {
    return new Promise((resolve) => {
        const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' }, onComplete: resolve });

        tl.to(coverEl, { autoAlpha: 0, scale: 0.92, duration: 0.22 })
            .call(() => {
                coverEl.src = newSrc;
            })
            .set(coverEl, { scale: 0.92 })
            .to(coverEl, { autoAlpha: 1, scale: 1, duration: 0.32, ease: 'power2.out' });
    });
}

// ── Track change: titles + meta (Player & List) ───────
export function animateTrackChange(elements, swapFn) {
    const targets = Object.values(elements).filter(el => el && !el.classList?.contains('is-hidden'));

    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    tl.to(targets, { y: -10, autoAlpha: 0, duration: 0.18, stagger: 0.04 })
        .call(swapFn)
        .call(() => {
            const fadeInTargets = Object.values(elements).filter(el => el && !el.classList?.contains('is-hidden'));
            gsap.fromTo(
                fadeInTargets,
                { y: 10, autoAlpha: 0 },
                { y: 0, autoAlpha: 1, duration: 0.26, stagger: 0.05, ease: 'power2.out' }
            );
        });
}

// ── Initial entrance ──────────────────────────────────
export function animateIntro(el) {
    const mm = gsap.matchMedia();

    mm.add(
        {
            motion: '(prefers-reduced-motion: no-preference)',
            reduceMotion: '(prefers-reduced-motion: reduce)',
        },
        (ctx) => {
            const { reduceMotion } = ctx.conditions;
            const viewList = document.getElementById('view-list');
            gsap.set(viewList, { display: 'block' });

            if (reduceMotion) {
                gsap.set(viewList, { autoAlpha: 1 });
                gsap.set(el.trackItems, { autoAlpha: 1, y: 0 });
                return;
            }

            const tl = gsap.timeline({
                defaults: { ease: 'power3.out' },
                onStart: () => {
                    document.getElementById('loading-overlay')?.classList.add('is-hidden');
                },
            });

            tl.to(viewList, { autoAlpha: 1, duration: 0.4 })
                .from('.list-cta-header', { y: -10, autoAlpha: 0, duration: 0.4 }, '<0.1')
                .from('#list-track-display', { y: -20, autoAlpha: 0, duration: 0.4 }, '<0.1')
                .from('.vinyl-item', { scale: 0.8, autoAlpha: 0, duration: 0.5, stagger: 0.1, ease: 'back.out(1.2)' }, '<0.1')
                .from('.track-list-header', { autoAlpha: 0, duration: 0.3 }, '<0.2')
                .to(el.trackItems, {
                    autoAlpha: 1,
                    y: 0,
                    duration: 0.3,
                    stagger: { each: 0.045, from: 'start' },
                }, '<0.1');
        }
    );
}

// ── Button micro-feedback (jump / pulse) ───────────────
export function pulsePlayButton(btn) {
    gsap.timeline()
        .to(btn, { scale: 1.15, duration: 0.12, ease: 'power2.out' })
        .to(btn, { scale: 1, duration: 0.28, ease: 'back.out(3)' });
}

export function pulseControlButton(btn) {
    gsap.timeline()
        .to(btn, { scale: 1.18, duration: 0.12, ease: 'power2.out' })
        .to(btn, { scale: 1, duration: 0.26, ease: 'back.out(3)' });
}
