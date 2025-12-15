// Image data (replace with your own images)
const images = [
    { src: 'https://picsum.photos/id/10/400/400', title: 'Mountain Vista', description: 'Beautiful mountain landscape' },
    { src: 'https://picsum.photos/id/20/400/400', title: 'Ocean Waves', description: 'Calm ocean at sunset' },
    { src: 'https://picsum.photos/id/30/400/400', title: 'Forest Path', description: 'Serene forest trail' },
    { src: 'https://picsum.photos/id/40/400/400', title: 'City Lights', description: 'Urban skyline at night' },
    { src: 'https://picsum.photos/id/50/400/400', title: 'Desert Dunes', description: 'Golden sand dunes' },
    { src: 'https://picsum.photos/id/60/400/400', title: 'Tropical Beach', description: 'Paradise island beach' },
    { src: 'https://picsum.photos/id/70/400/400', title: 'Ancient Ruins', description: 'Historical architecture' },
    { src: 'https://picsum.photos/id/80/400/400', title: 'Wildlife', description: 'Nature photography' },
    { src: 'https://picsum.photos/id/90/400/400', title: 'Waterfall', description: 'Cascading waterfall' }
];

let currentImageIndex = 0;

// Initialize gallery
function initGallery() {
    const gallery = document.getElementById('gallery');

    images.forEach((image, index) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.onclick = () => openLightbox(index);

        item.innerHTML = `
            <img src="${image.src}" alt="${image.title}">
            <div class="overlay">
                <h3>${image.title}</h3>
                <p>${image.description}</p>
            </div>
        `;

        gallery.appendChild(item);
    });
}

// Open lightbox
function openLightbox(index) {
    currentImageIndex = index;
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    const caption = document.getElementById('caption');

    img.src = images[index].src;
    caption.textContent = images[index].title;
    lightbox.classList.add('active');

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

// Close lightbox
function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Change image in lightbox
function changeImage(direction) {
    currentImageIndex += direction;

    if (currentImageIndex < 0) {
        currentImageIndex = images.length - 1;
    } else if (currentImageIndex >= images.length) {
        currentImageIndex = 0;
    }

    const img = document.getElementById('lightboxImg');
    const caption = document.getElementById('caption');

    img.src = images[currentImageIndex].src;
    caption.textContent = images[currentImageIndex].title;
}

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    const lightbox = document.getElementById('lightbox');
    if (lightbox.classList.contains('active')) {
        if (e.key === 'Escape') {
            closeLightbox();
        } else if (e.key === 'ArrowLeft') {
            changeImage(-1);
        } else if (e.key === 'ArrowRight') {
            changeImage(1);
        }
    }
});

// Close lightbox when clicking outside image
document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') {
        closeLightbox();
    }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', initGallery);
