/**
 * player.js
 * Owns the <audio> element and all playback logic.
 * Does NOT touch GSAP, CSS variables, or playlist DOM.
 *
 * Strategy:
 *  - Next at end of playlist → wraps to first track (playlist loop).
 *  - Previous with currentTime > 3s → restarts current track.
 *  - Previous with currentTime <= 3s → goes to previous track.
 */

let audioEl         = null;
let state           = null; // reference to app state
let onTrackEnd      = null; // callback → app.js selectTrack(next)
let onTimeUpdate    = null; // callback → UI progress update
let onPlayState     = null; // callback → UI play/pause button update
let onTrackError    = null; // callback → show error

// ── Init ──────────────────────────────────────────────

/**
 * @param {HTMLAudioElement} el
 * @param {object} appState
 * @param {object} callbacks - { onTrackEnd, onTimeUpdate, onPlayState, onTrackError }
 */
export function initPlayer(el, appState, callbacks) {
    audioEl      = el;
    state        = appState;
    onTrackEnd   = callbacks.onTrackEnd;
    onTimeUpdate = callbacks.onTimeUpdate;
    onPlayState  = callbacks.onPlayState;
    onTrackError = callbacks.onTrackError;

    audioEl.addEventListener('timeupdate',    handleTimeUpdate);
    audioEl.addEventListener('loadedmetadata', handleMetadata);
    audioEl.addEventListener('ended',         handleEnded);
    audioEl.addEventListener('error',         handleError);
    audioEl.addEventListener('play',          () => onPlayState(true));
    audioEl.addEventListener('pause',         () => onPlayState(false));
}

// ── Controls ──────────────────────────────────────────

export function play() {
    const p = audioEl.play();
    if (p) {
        p.catch((err) => {
            // Autoplay policy rejection — not a real error, just log
            if (err.name !== 'AbortError') {
                console.warn('[Player] play() rejected:', err);
            }
        });
    }
}

export function pause() {
    audioEl.pause();
}

export function togglePlay() {
    if (audioEl.paused) {
        play();
    } else {
        pause();
    }
}

export function next() {
    const nextIndex = (state.currentTrackIndex + 1) % state.tracks.length;
    onTrackEnd(nextIndex, true);
}

export function previous() {
    if (audioEl.currentTime > 3) {
        // Restart current track
        audioEl.currentTime = 0;
        play();
    } else {
        const prevIndex = state.currentTrackIndex === 0
            ? state.tracks.length - 1
            : state.currentTrackIndex - 1;
        onTrackEnd(prevIndex, true);
    }
}

/**
 * Seek to a position by percentage (0–1).
 * @param {number} pct
 */
export function seekTo(pct) {
    if (!isFinite(audioEl.duration)) return;
    audioEl.currentTime = pct * audioEl.duration;
}

/**
 * Load a new audio source and reset state.
 * Does NOT auto-play — app.js calls play() after transition.
 * @param {string} src
 */
export function loadTrack(src) {
    audioEl.pause();
    audioEl.src  = src;
    audioEl.load();
}

// ── Getters ───────────────────────────────────────────

export function isPlaying() {
    return !audioEl.paused;
}

export function getCurrentTime() {
    return audioEl.currentTime || 0;
}

export function getDuration() {
    return isFinite(audioEl.duration) ? audioEl.duration : 0;
}

// ── Handlers ─────────────────────────────────────────

function handleTimeUpdate() {
    const current  = audioEl.currentTime;
    const duration = audioEl.duration;
    const pct      = isFinite(duration) && duration > 0 ? current / duration : 0;
    onTimeUpdate(current, duration || 0, pct);
}

function handleMetadata() {
    // Duration is now available — notify UI
    const duration = audioEl.duration;
    onTimeUpdate(audioEl.currentTime, duration, 0);
}

function handleEnded() {
    const nextIndex = (state.currentTrackIndex + 1) % state.tracks.length;
    onTrackEnd(nextIndex, true);
}

function handleError() {
    const err = audioEl.error;
    console.error('[Player] Audio error:', err?.message || 'unknown');
    onTrackError();
}

// ── Utility ───────────────────────────────────────────

/**
 * Format seconds to M:SS string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}
