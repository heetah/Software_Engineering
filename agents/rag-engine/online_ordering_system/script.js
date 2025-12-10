// Mock Data
const menuItems = [
    {
        id: 1,
        name: "Classic Burger",
        price: 8.99,
        category: "burger",
        image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60"
    },
    {
        id: 2,
        name: "Cheese Lover",
        price: 10.99,
        category: "burger",
        image: "https://images.unsplash.com/photo-1586190848861-99c8a3fb7ea5?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60"
    },
    {
        id: 3,
        name: "Crispy Fries",
        price: 3.99,
        category: "pizza", // Using 'pizza' key for Sides as per HTML tabs, though logic variable might differ. Keeping consistent with HTML 'filterMenu' calls.
        image: "https://images.unsplash.com/photo-1573080496987-a199f8cd4054?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60"
    },
    {
        id: 4,
        name: "Onion Rings",
        price: 4.50,
        category: "pizza",
        image: "https://images.unsplash.com/photo-1639024471283-03518883512d?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60"
    },
    {
        id: 5,
        name: "Cola Zero",
        price: 1.99,
        category: "drink",
        image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60"
    },
    {
        id: 6,
        name: "Lemonade",
        price: 2.50,
        category: "drink",
        image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60"
    },
    {
        id: 7,
        name: "Chicken Burger",
        price: 9.50,
        category: "burger",
        image: "https://images.unsplash.com/photo-1615256513470-3df1ee127dc7?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60"
    },
    {
        id: 8,
        name: "Spicy Wings",
        price: 6.99,
        category: "pizza",
        image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60"
    }
];

let cart = [];

// DOM Elements
const menuGrid = document.getElementById('menu-grid');
const cartItemsContainer = document.getElementById('cart-items');
const cartTotalElement = document.getElementById('cart-total');
const cartCountElement = document.getElementById('cart-count');
const cartSidebar = document.getElementById('cart-sidebar');
const overlay = document.getElementById('overlay');
const tabBtns = document.querySelectorAll('.tab-btn');

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    renderMenu(menuItems);
});

// Render Menu
function renderMenu(items) {
    menuGrid.innerHTML = items.map(item => `
        <div class="menu-item">
            <img src="${item.image}" alt="${item.name}" class="item-img">
            <div class="item-content">
                <h3 class="item-title">${item.name}</h3>
                <p class="item-desc">Delicious ${item.category} made fresh for you.</p>
                <div class="item-price-row">
                    <span class="item-price">$${item.price.toFixed(2)}</span>
                    <button class="add-btn" onclick="addToCart(${item.id})">Add to Cart</button>
                </div>
            </div>
        </div>
    `).join('');
}

// Filter Menu
function filterMenu(category) {
    // Update active tab
    tabBtns.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    if (category === 'all') {
        renderMenu(menuItems);
    } else {
        const filtered = menuItems.filter(item => item.category === category);
        renderMenu(filtered);
    }
}

// Cart Logic
function addToCart(id) {
    const item = menuItems.find(i => i.id === id);
    const existingItem = cart.find(i => i.id === id);

    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({ ...item, quantity: 1 });
    }

    updateCart();
    // Open cart automatically on add for better UX
    if (!cartSidebar.classList.contains('open')) {
        toggleCart();
    }
}

function removeFromCart(id) {
    cart = cart.filter(item => item.id !== id);
    updateCart();
}

function updateQuantity(id, change) {
    const item = cart.find(i => i.id === id);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(id);
        } else {
            updateCart();
        }
    }
}

function updateCart() {
    // Update count
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCountElement.textContent = totalCount;

    // Update list
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p class="empty-msg">Your cart is empty.</p>';
    } else {
        cartItemsContainer.innerHTML = cart.map(item => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <h4>${item.name}</h4>
                    <p>$${item.price.toFixed(2)} x ${item.quantity}</p>
                </div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="updateQuantity(${item.id}, -1)">-</button>
                    <span>${item.quantity}</span>
                    <button class="qty-btn" onclick="updateQuantity(${item.id}, 1)">+</button>
                </div>
            </div>
        `).join('');
    }

    // Update total
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cartTotalElement.textContent = `$${total.toFixed(2)}`;
}

// UI Toggles
function toggleCart() {
    cartSidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}

function checkout() {
    if (cart.length === 0) {
        alert('Your cart is empty!');
        return;
    }
    const total = cartTotalElement.textContent;
    alert(`Thank you for your order! Total paid: ${total}`);
    cart = [];
    updateCart();
    toggleCart();
}
