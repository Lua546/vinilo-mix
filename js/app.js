/**
 * app.js
 * Entry point. Coordinates all modules and SPA routing.
 */

import { initPlaylist, renderTracks, setActiveTrack, getTrackItems } from './playlist.js';
import { initPlayer, loadTrack, play, pause, togglePlay, next, previous, seekTo, isPlaying, formatTime } from './player.js';
import { updateTheme, applyFallbackTheme } from './theme.js';
import { 
    initVinyl, playVinyl, pauseVinyl, animateCoverChange, 
    animateTrackChange, animateIntro, pulsePlayButton,
    animateCarouselChange, setupCarouselObserver, animateViewTransition
} from './animations.js';

// ── Central state ─────────────────────────────────────
const state = {
    tracks:            [],
    currentTrackIndex: 0,
    isPlaying:         false,
    currentView:       'list', // 'list' or 'player'
    isAnimating:       false,
    isDesktop:         false,  // true when >=1024px (both views visible)
};

// ── Desktop media query ───────────────────────────────
const desktopMQ = window.matchMedia('(min-width: 1024px)');

// ── DOM refs ──────────────────────────────────────────
const dom = {
    app:          document.body,
    audio:        document.getElementById('audio'),
    analysisImg:  document.getElementById('analysis-img'),
    
    // Views
    viewList:     document.getElementById('view-list'),
    viewPlayer:   document.getElementById('view-player'),

    // List View
    trackList:       document.getElementById('track-list'),
    listTrackTitle:  document.getElementById('list-track-title'),
    listTrackMeta:   document.getElementById('list-track-meta'),
    vinylCarousel:   document.getElementById('vinyl-carousel'),
    vinylCenter:     document.getElementById('vinyl-center'),
    vinylCenterDisc: document.getElementById('vinyl-disc-main'),
    spotifyBtn:      document.getElementById('spotify-btn'),

    // Player View
    albumCover:   document.getElementById('album-cover'),
    vinylPlayer:  document.getElementById('vinyl-player'),
    playerTitle:  document.getElementById('player-title'),
    playerMeta:   document.getElementById('player-meta'),
    btnBack:      document.getElementById('btn-back'),

    // Progress
    progressBar:     document.getElementById('progress-bar'),
    progressFill:    document.getElementById('progress-fill'),
    progressThumb:   document.getElementById('progress-thumb'),
    timeCurrent:     document.getElementById('time-current'),
    timeTotal:       document.getElementById('time-total'),

    // Controls
    btnPlay:    document.getElementById('btn-play'),
    btnPrev:    document.getElementById('btn-prev'),
    btnNext:    document.getElementById('btn-next'),
    iconPlay:   document.getElementById('icon-play'),
    iconPause:  document.getElementById('icon-pause'),

    // Note
    noteCard:   document.getElementById('note-card'),
    noteTitle:  document.getElementById('note-title'),
    noteText:   document.getElementById('note-text'),
};

// ── Boot ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadData();
        setupModules();
        setupControls();
        setupKeyboard();
        setupDesktopMode();
        
        // Initial setup
        const firstTrack = state.tracks[0];
        updateThemeForTrack(firstTrack);
        updateListUI(firstTrack);
        updatePlayerUI(firstTrack);
        setActiveTrack(0);
        loadTrack(firstTrack.audio || '');

        runIntro();
    } catch (err) {
        console.error('[App] Initialization failed:', err);
        const isFileProtocol = window.location.protocol === 'file:';
        const message = isFileProtocol
            ? 'Abre este proyecto con Live Server para permitir la carga de tracks.json.'
            : 'Revisa que tracks.json exista y sea válido.';
        showError('No se pudieron cargar las canciones.', message);
    }
});

// ── Data loading ──────────────────────────────────────

async function loadData() {
    let response = await fetch('./data/tracks.json');
    if (!response.ok) throw new Error(`tracks.json responded with ${response.status}`);
    
    let data = await response.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('tracks.json is empty');

    state.tracks = data.map((t, i) => ({
        id:       t.id      ?? i + 1,
        title:    t.title   || 'Unknown Title',
        artist:   t.artist  || 'Unknown Artist',
        album:    t.album   || 'Unknown Album',
        cover:    t.cover   || '',
        audio:    t.audio   || '',
        duration: t.duration || '--:--',
        note:     t.note    || '',
        spotify:  t.spotify || '',
    }));
}

// ── Module setup ──────────────────────────────────────

function setupModules() {
    initPlaylist(dom.trackList, (index) => selectTrack(index));
    renderTracks(state.tracks);

    initVinyl([dom.vinylPlayer, dom.vinylCenterDisc]);

    initPlayer(dom.audio, state, {
        onTrackEnd:   (index) => selectTrack(index),
        onTimeUpdate: updateProgress,
        onPlayState:  updatePlayState,
        onTrackError: () => console.error('[App] Audio playback error'),
    });

    setupCarouselObserver(
        dom.vinylCarousel,
        () => handleSwipe(1),  // swipe left -> next track
        () => handleSwipe(-1)  // swipe right -> prev track
    );
}

// ── Navigation (SPA Routing) ──────────────────────────

async function navigateTo(viewId) {
    // On desktop, both views are always visible — skip SPA transitions
    if (state.isDesktop) {
        if (viewId === 'player' && !state.isPlaying) {
            play();
        }
        state.currentView = viewId;
        return;
    }

    if (state.isAnimating || state.currentView === viewId) return;
    state.isAnimating = true;

    if (viewId === 'player') {
        state.currentView = 'player';
        // Auto-play when opening player if not already playing
        if (!state.isPlaying) {
            play();
        }
        await animateViewTransition(dom.viewList, dom.viewPlayer, 'forward');
    } else {
        state.currentView = 'list';
        await animateViewTransition(dom.viewPlayer, dom.viewList, 'backward');
    }

    state.isAnimating = false;
}

// ── Track selection ───────────────────────────────────

async function selectTrack(index) {
    if (state.isAnimating) return;
    
    // If just clicking the same track, do nothing
    if (index === state.currentTrackIndex) return;

    state.isAnimating = true;
    const direction = index > state.currentTrackIndex ? 1 : -1;
    state.currentTrackIndex = index;
    const track = state.tracks[index];

    setActiveTrack(index);

    // If we are in List View, animate the carousel
    if (state.currentView === 'list') {
        await animateCarouselChange(dom.vinylCenterDisc, direction, () => {
            updateListUI(track);
            updateThemeForTrack(track);
        });
        
        // Also update the player UI silently in the background
        updatePlayerUI(track);
        
        
    } else {
        // We are in Player View
        animateCoverChange(dom.albumCover, track.cover);
        animateTrackChange({
            title: dom.playerTitle,
            meta: dom.playerMeta,
            noteCard: dom.noteCard,
            noteTitle: dom.noteTitle,
            noteText: dom.noteText,
        }, () => updatePlayerUI(track));
        
        updateThemeForTrack(track);
        // Also update list UI silently
        updateListUI(track);
    }

    loadTrack(track.audio || '');
    if (state.isPlaying) play();
    
    state.isAnimating = false;
}

function handleSwipe(direction) {
    if (state.isAnimating || state.currentView !== 'list') return;
    
    let nextIndex = state.currentTrackIndex + direction;
    if (nextIndex < 0) nextIndex = state.tracks.length - 1;
    if (nextIndex >= state.tracks.length) nextIndex = 0;
    
    selectTrack(nextIndex);
}

// ── UI updates ────────────────────────────────────────

function updateThemeForTrack(track) {
    dom.analysisImg.src = track.cover;
    updateTheme(dom.analysisImg, track.cover);
}

function updateListUI(track) {
    dom.listTrackTitle.textContent = track.title;
    dom.listTrackMeta.textContent  = `${track.album} · ${track.artist}`;

    if (track.spotify) {
        dom.spotifyBtn.href = track.spotify;
        dom.spotifyBtn.classList.remove('is-disabled');
        dom.spotifyBtn.removeAttribute('aria-disabled');
    } else {
        dom.spotifyBtn.removeAttribute('href');
        dom.spotifyBtn.classList.add('is-disabled');
        dom.spotifyBtn.setAttribute('aria-disabled', 'true');
    }
}

function updatePlayerUI(track) {
    dom.playerTitle.textContent = track.title;
    dom.playerMeta.textContent  = `${track.album} · ${track.artist}`;

    // Always sync the album cover (important for desktop where both panels are visible)
    if (track.cover) {
        dom.albumCover.src = track.cover;
        dom.albumCover.alt = `${track.album} cover`;
    }

    if (track.note) {
        dom.noteCard.classList.remove('is-hidden');
        dom.noteTitle.textContent = `Nota`;
        dom.noteText.textContent  = track.note;
    } else {
        dom.noteCard.classList.add('is-hidden');
    }

    updateProgress(0, 0, 0);
}

function updateProgress(current, duration, pct) {
    const fillPct = (pct * 100).toFixed(2) + '%';
    dom.progressFill.style.width   = fillPct;
    dom.progressThumb.style.left   = fillPct;
    dom.timeCurrent.textContent    = formatTime(current);
    dom.timeTotal.textContent      = formatTime(duration);
}

function updatePlayState(playing) {
    state.isPlaying = playing;

    dom.iconPlay.style.display  = playing ? 'none'  : 'block';
    dom.iconPause.style.display = playing ? 'block' : 'none';
    dom.btnPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');

    if (playing) {
        playVinyl();
    } else {
        pauseVinyl();
    }
}

// ── Controls ──────────────────────────────────────────

function setupControls() {
    // Navigation
    dom.vinylCenter.addEventListener('click', () => navigateTo('player'));
    dom.btnBack.addEventListener('click', () => navigateTo('list'));

    // Player controls
    dom.btnPlay.addEventListener('click', () => {
        pulsePlayButton(dom.btnPlay);
        togglePlay();
    });
    dom.btnPrev.addEventListener('click', () => previous());
    dom.btnNext.addEventListener('click', () => next());

    dom.progressBar.addEventListener('click', (e) => {
        const rect = dom.progressBar.getBoundingClientRect();
        const pct  = (e.clientX - rect.left) / rect.width;
        seekTo(Math.max(0, Math.min(1, pct)));
    });

    dom.albumCover.addEventListener('error', () => applyFallbackTheme());
}

// ── Keyboard shortcuts ────────────────────────────────

function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case ' ':
                e.preventDefault();
                if (state.currentView === 'player') {
                    pulsePlayButton(dom.btnPlay);
                    togglePlay();
                } else {
                    navigateTo('player');
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (state.currentView === 'list') {
                    handleSwipe(1);
                } else {
                    next();
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (state.currentView === 'list') {
                    handleSwipe(-1);
                } else {
                    previous();
                }
                break;
            case 'Escape':
                e.preventDefault();
                if (state.currentView === 'player') {
                    navigateTo('list');
                }
                break;
        }
    });
}

// ── Desktop mode (side-by-side) ───────────────────────

function setupDesktopMode() {
    function handleDesktopChange(mq) {
        state.isDesktop = mq.matches;

        if (state.isDesktop) {
            // Both views visible — managed by CSS grid
            dom.viewList.classList.add('is-active');
            dom.viewPlayer.classList.add('is-active');
            gsap.set([dom.viewList, dom.viewPlayer], {
                display: 'block', autoAlpha: 1, y: 0, x: 0
            });
        } else {
            // Mobile: SPA mode — show current view only
            if (state.currentView === 'list') {
                dom.viewList.classList.add('is-active');
                dom.viewPlayer.classList.remove('is-active');
                gsap.set(dom.viewList, { display: 'block', autoAlpha: 1, y: 0 });
                gsap.set(dom.viewPlayer, { display: 'none', autoAlpha: 0 });
            } else {
                dom.viewPlayer.classList.add('is-active');
                dom.viewList.classList.remove('is-active');
                gsap.set(dom.viewPlayer, { display: 'block', autoAlpha: 1, y: 0 });
                gsap.set(dom.viewList, { display: 'none', autoAlpha: 0 });
            }
        }
    }

    desktopMQ.addEventListener('change', handleDesktopChange);
    handleDesktopChange(desktopMQ);
}

// ── Intro animation ───────────────────────────────────

function runIntro() {
    animateIntro({
        trackItems: getTrackItems()
    });
}

// ── Error state ───────────────────────────────────────

function showError(title, message) {
    const errorEl = document.getElementById('error-state');
    if (!errorEl) return;
    errorEl.innerHTML = `
        <div class="error-message">
            <h2>${title}</h2>
            <p>${message}</p>
        </div>
    `;
    errorEl.classList.add('visible');
    document.getElementById('loading-overlay')?.classList.add('is-hidden');
}
