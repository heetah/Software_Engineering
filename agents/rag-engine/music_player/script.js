// Playlist data (note: these are placeholder URLs, replace with actual audio files)
const playlist = [
    { title: 'Summer Vibes', artist: 'Artist One', duration: 180 },
    { title: 'Midnight Dreams', artist: 'Artist Two', duration: 240 },
    { title: 'Urban Rhythm', artist: 'Artist Three', duration: 200 },
    { title: 'Ocean Waves', artist: 'Artist Four', duration: 210 },
    { title: 'Mountain Echo', artist: 'Artist Five', duration: 195 }
];

// Player state
let currentSongIndex = 0;
let isPlaying = false;
let currentTime = 0;
let songDuration = 0;
let updateInterval = null;

// Initialize player
function initPlayer() {
    renderPlaylist();
    loadSong(0);
}

// Render playlist
function renderPlaylist() {
    const playlistUl = document.getElementById('playlistUl');

    playlist.forEach((song, index) => {
        const li = document.createElement('li');
        li.className = `playlist-item ${index === 0 ? 'active' : ''}`;
        li.onclick = () => loadSong(index);

        li.innerHTML = `
            <h4>${song.title}</h4>
            <p>${song.artist}</p>
        `;

        playlistUl.appendChild(li);
    });
}

// Load song
function loadSong(index) {
    currentSongIndex = index;
    const song = playlist[index];

    document.getElementById('songTitle').textContent = song.title;
    document.getElementById('artist').textContent = song.artist;
    songDuration = song.duration;
    currentTime = 0;

    updateProgress();
    updatePlaylistHighlight();
}

// Toggle play/pause
function togglePlay() {
    isPlaying = !isPlaying;
    const playBtn = document.getElementById('playBtn');
    const vinyl = document.getElementById('vinyl');

    if (isPlaying) {
        playBtn.textContent = '⏸️';
        vinyl.classList.add('spinning');
        startProgress();
    } else {
        playBtn.textContent = '▶️';
        vinyl.classList.remove('spinning');
        stopProgress();
    }
}

// Previous song
function previousSong() {
    currentSongIndex = currentSongIndex > 0 ? currentSongIndex - 1 : playlist.length - 1;
    loadSong(currentSongIndex);
    if (isPlaying) {
        togglePlay();
        togglePlay();
    }
}

// Next song
function nextSong() {
    currentSongIndex = currentSongIndex < playlist.length - 1 ? currentSongIndex + 1 : 0;
    loadSong(currentSongIndex);
    if (isPlaying) {
        togglePlay();
        togglePlay();
    }
}

// Start progress
function startProgress() {
    updateInterval = setInterval(() => {
        currentTime++;
        if (currentTime >= songDuration) {
            nextSong();
        }
        updateProgress();
    }, 1000);
}

// Stop progress
function stopProgress() {
    clearInterval(updateInterval);
}

// Update progress display
function updateProgress() {
    const progressPercent = (currentTime / songDuration) * 100;
    document.getElementById('progress').style.width = `${progressPercent}%`;
    document.getElementById('currentTime').textContent = formatTime(currentTime);
    document.getElementById('duration').textContent = formatTime(songDuration);
}

// Seek to position
function seek(event) {
    const progressBar = event.currentTarget;
    const clickPosition = event.offsetX;
    const barWidth = progressBar.offsetWidth;
    const seekPercent = clickPosition / barWidth;

    currentTime = Math.floor(seekPercent * songDuration);
    updateProgress();
}

// Format time
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Update playlist highlight
function updatePlaylistHighlight() {
    const items = document.querySelectorAll('.playlist-item');
    items.forEach((item, index) => {
        if (index === currentSongIndex) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initPlayer);
