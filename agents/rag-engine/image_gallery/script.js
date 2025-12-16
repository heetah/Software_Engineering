let images = JSON.parse(localStorage.getItem('galleryImages')) || [
    { id: 1, src: 'https://picsum.photos/400/400?random=1', category: 'landscape' },
    { id: 2, src: 'https://picsum.photos/400/400?random=2', category: 'portrait' },
    { id: 3, src: 'https://picsum.photos/400/400?random=3', category: 'nature' },
    { id: 4, src: 'https://picsum.photos/400/400?random=4', category: 'urban' },
    { id: 5, src: 'https://picsum.photos/400/400?random=5', category: 'landscape' },
    { id: 6, src: 'https://picsum.photos/400/400?random=6', category: 'nature' }
];

let currentFilter = 'all';
let currentImageIndex = 0;

const gallery = document.getElementById('gallery');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const clearBtn = document.getElementById('clearBtn');
const filterButtons = document.querySelectorAll('.filter-btn');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightboxImage');
const closeBtn = document.getElementById('closeBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const imageInfo = document.getElementById('imageInfo');

function displayImages() {
    const filteredImages = currentFilter === 'all'
        ? images
        : images.filter(img => img.category === currentFilter);

    gallery.innerHTML = '';

    if (filteredImages.length === 0) {
        gallery.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="icon">📷</div>
                <p>沒有圖片</p>
            </div>
        `;
        return;
    }

    filteredImages.forEach((image, index) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.innerHTML = `
            <img src="${image.src}" alt="Gallery image">
            <div class="overlay">
                <span class="category">${getCategoryName(image.category)}</span>
            </div>
            <button class="delete-btn" onclick="deleteImage(${image.id})">×</button>
        `;

        item.querySelector('img').addEventListener('click', () => {
            openLightbox(index, filteredImages);
        });

        gallery.appendChild(item);
    });
}

function getCategoryName(category) {
    const names = {
        landscape: '風景',
        portrait: '人像',
        nature: '自然',
        urban: '都市',
        other: '其他'
    };
    return names[category] || '其他';
}

function uploadImages() {
    fileInput.click();
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const newImage = {
                id: Date.now() + Math.random(),
                src: event.target.result,
                category: 'other'
            };
            images.push(newImage);
            saveImages();
            displayImages();
        };
        reader.readAsDataURL(file);
    });

    fileInput.value = '';
}

function deleteImage(id) {
    if (confirm('確定要刪除這張圖片嗎？')) {
        images = images.filter(img => img.id !== id);
        saveImages();
        displayImages();
    }
}

function clearAll() {
    if (confirm('確定要清除所有圖片嗎？')) {
        images = [];
        saveImages();
        displayImages();
    }
}

function filterImages(filter) {
    currentFilter = filter;

    filterButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-filter') === filter) {
            btn.classList.add('active');
        }
    });

    displayImages();
}

function openLightbox(index, imageArray) {
    currentImageIndex = index;
    lightboxImage.src = imageArray[index].src;
    imageInfo.textContent = `${index + 1} / ${imageArray.length}`;
    lightbox.classList.remove('hidden');
}

function closeLightbox() {
    lightbox.classList.add('hidden');
}

function navigateLightbox(direction) {
    const filteredImages = currentFilter === 'all'
        ? images
        : images.filter(img => img.category === currentFilter);

    currentImageIndex += direction;

    if (currentImageIndex < 0) {
        currentImageIndex = filteredImages.length - 1;
    } else if (currentImageIndex >= filteredImages.length) {
        currentImageIndex = 0;
    }

    lightboxImage.src = filteredImages[currentImageIndex].src;
    imageInfo.textContent = `${currentImageIndex + 1} / ${filteredImages.length}`;
}

function saveImages() {
    // 只儲存非 URL 的圖片（用戶上傳的）
    const imagesToSave = images.filter(img => img.src.startsWith('data:'));
    localStorage.setItem('galleryImages', JSON.stringify(imagesToSave));
}

uploadBtn.addEventListener('click', uploadImages);
fileInput.addEventListener('change', handleFileSelect);
clearBtn.addEventListener('click', clearAll);
closeBtn.addEventListener('click', closeLightbox);
prevBtn.addEventListener('click', () => navigateLightbox(-1));
nextBtn.addEventListener('click', () => navigateLightbox(1));

filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter');
        filterImages(filter);
    });
});

// ESC 鍵關閉 lightbox
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) {
        closeLightbox();
    }
    if (e.key === 'ArrowLeft' && !lightbox.classList.contains('hidden')) {
        navigateLightbox(-1);
    }
    if (e.key === 'ArrowRight' && !lightbox.classList.contains('hidden')) {
        navigateLightbox(1);
    }
});

// 初始化
displayImages();
