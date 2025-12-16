const songs = [
    { title: '夏日微風', artist: '輕音樂', duration: 180 },
    { title: '星空下的旋律', artist: '鋼琴曲', duration: 240 },
    { title: '城市夜景', artist: '電子音樂', duration: 210 },
    { title: '回憶的片段', artist: '輕音樂', duration: 195 },
    { title: '晨光序曲', artist: '古典音樂', duration: 225 }
];

let currentSongIndex = 0;
let isPlaying = false;
let currentTime = 0;
let interval = null;

const albumArt = document.getElementById('albumArt');
const songTitle = document.getElementById('songTitle');
const artist = document.getElementById('artist');
const currentTimeDisplay = document.getElementById('currentTime');
const durationDisplay = document.getElementById('duration');
const progress = document.getElementById('progress');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const playlistItems = document.getElementById('playlistItems');

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function loadSong(index) {
    const song = songs[index];
    songTitle.textContent = song.title;
    artist.textContent = song.artist;
    durationDisplay.textContent = formatTime(song.duration);
    currentTime = 0;
    currentTimeDisplay.textContent = '0:00';
    progress.style.width = '0%';
    updatePlaylist();
}

function togglePlay() {
    isPlaying = !isPlaying;

    if (isPlaying) {
        playBtn.textContent = '⏸️';
        albumArt.classList.add('playing');
        startProgress();
    } else {
        playBtn.textContent = '▶️';
        albumArt.classList.remove('playing');
        stopProgress();
    }
}

function startProgress() {
    interval = setInterval(() => {
        const song = songs[currentSongIndex];
        currentTime++;

        if (currentTime >= song.duration) {
            nextSong();
        } else {
            updateProgress();
        }
    }, 1000);
}

function stopProgress() {
    if (interval) {
        clearInterval(interval);
        interval = null;
    }
}

function updateProgress() {
    const song = songs[currentSongIndex];
    const percentage = (currentTime / song.duration) * 100;
    progress.style.width = percentage + '%';
    currentTimeDisplay.textContent = formatTime(currentTime);
}

function prevSong() {
    currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
    loadSong(currentSongIndex);
    if (isPlaying) {
        togglePlay();
        setTimeout(togglePlay, 100);
    }
}

function nextSong() {
    currentSongIndex = (currentSongIndex + 1) % songs.length;
    loadSong(currentSongIndex);
    if (isPlaying) {
        togglePlay();
        setTimeout(togglePlay, 100);
    }
}

function createPlaylist() {
    playlistItems.innerHTML = '';
    songs.forEach((song, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        if (index === currentSongIndex) {
            item.classList.add('active');
        }

        item.innerHTML = `
            <div class="playlist-item-title">${song.title}</div>
            <div class="playlist-item-artist">${song.artist} • ${formatTime(song.duration)}</div>
        `;

        item.addEventListener('click', () => {
            if (isPlaying) togglePlay();
            currentSongIndex = index;
            loadSong(index);
            togglePlay();
        });

        playlistItems.appendChild(item);
    });
}

function updatePlaylist() {
    const items = playlistItems.querySelectorAll('.playlist-item');
    items.forEach((item, index) => {
        item.classList.toggle('active', index === currentSongIndex);
    });
}

playBtn.addEventListener('click', togglePlay);
prevBtn.addEventListener('click', prevSong);
nextBtn.addEventListener('click', nextSong);

loadSong(0);
createPlaylist();
