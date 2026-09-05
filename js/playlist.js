/**
 * playlist.js
 * Renders the track list from JSON data.
 * Manages active/playing state.
 * Never touches audio or animations directly.
 */

let trackListEl = null;
let onSelectTrack = null; // callback injected by app.js

/**
 * Initialize the playlist module.
 * @param {HTMLElement} listEl     - the <ul> container
 * @param {Function}   selectCb   - called with track index when user clicks
 */
export function initPlaylist(listEl, selectCb) {
    trackListEl = listEl;
    onSelectTrack = selectCb;
}

/**
 * Build all track items from data array.
 * Uses createElement — no innerHTML for each item (safe, no onclick inline).
 * @param {Array} tracks
 */
export function renderTracks(tracks) {
    trackListEl.innerHTML = '';

    tracks.forEach((track, index) => {
        const item = document.createElement('li');
        item.className = 'track-item';
        item.dataset.index = index;
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-label', `Play ${track.title} by ${track.artist}`);

        // Track number
        const num = document.createElement('span');
        num.className = 'track-number';
        num.textContent = String(index + 1).padStart(2, '0') + '.';

        // Cover thumbnail
        const thumb = document.createElement('img');
        thumb.className = 'track-cover-thumb';
        thumb.src = track.cover || '';
        thumb.alt = `${track.album} cover`;
        thumb.loading = 'lazy';
        thumb.addEventListener('error', () => {
            thumb.style.visibility = 'hidden';
        });

        // Info block
        const info = document.createElement('div');
        info.className = 'track-info';

        const title = document.createElement('span');
        title.className = 'track-title';
        title.textContent = track.title;

        const meta = document.createElement('span');
        meta.className = 'track-meta';
        meta.textContent = `${track.artist} · ${track.album}`;

        info.appendChild(title);
        info.appendChild(meta);

        // Duration
        const dur = document.createElement('span');
        dur.className = 'track-duration';
        dur.textContent = track.duration || '--:--';

        item.appendChild(num);
        item.appendChild(thumb);
        item.appendChild(info);
        item.appendChild(dur);

        // Click + keyboard activation
        item.addEventListener('click', () => onSelectTrack(index));
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectTrack(index);
            }
        });

        trackListEl.appendChild(item);
    });
}

/**
 * Update the visual active state on the list.
 * @param {number} index - currently playing track index
 */
export function setActiveTrack(index) {
    const items = trackListEl.querySelectorAll('.track-item');
    items.forEach((item, i) => {
        const isActive = i === index;
        item.classList.toggle('is-playing', isActive);
        item.setAttribute('aria-current', isActive ? 'true' : 'false');
    });

    // Scroll active item into view if needed
    const activeItem = trackListEl.children[index];
    if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

/**
 * Return NodeList of all track item elements.
 * Used by animations.js for intro stagger.
 */
export function getTrackItems() {
    return trackListEl.querySelectorAll('.track-item');
}
