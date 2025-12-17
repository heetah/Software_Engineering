const recipes = [
    {
        id: 1,
        title: "奶油培根義大利麵",
        image: "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=500",
        time: "30 分鐘",
        calories: "450 kcal",
        tags: ["晚餐", "午餐"],
        ingredients: ["義大利麵 200g", "培根 100g", "鮮奶油 100ml", "雞蛋 2顆", "帕瑪森起司 適量", "黑胡椒 少許"],
        instructions: ["煮滾水，加入少許鹽，煮義大利麵。", "熱鍋煎培根至酥脆。", "混合雞蛋、鮮奶油和起司。", "將煮好的麵條加入培根鍋中。", "關火，倒入醬汁快速攪拌均勻。", "撒上黑胡椒即可享用。"]
    },
    {
        id: 2,
        title: "健康雞肉沙拉",
        image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500",
        time: "15 分鐘",
        calories: "300 kcal",
        tags: ["健康", "午餐"],
        ingredients: ["雞胸肉 150g", "生菜 1顆", "小番茄 10顆", "黃瓜 1條", "橄欖油 1匙", "檸檬汁 少許"],
        instructions: ["雞胸肉水煮或乾煎至熟，切片。", "生菜、番茄、黃瓜洗淨切好。", "將所有食材放入大碗中。", "淋上橄欖油和檸檬汁。", "輕輕拌勻即可。"]
    },
    {
        id: 3,
        title: "美式鬆餅",
        image: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=500",
        time: "20 分鐘",
        calories: "350 kcal",
        tags: ["早餐", "甜點"],
        ingredients: ["麵粉 200g", "牛奶 150ml", "雞蛋 1顆", "泡打粉 1匙", "糖 2匙", "奶油 少許", "楓糖漿 適量"],
        instructions: ["混合麵粉、糖和泡打粉。", "加入牛奶和雞蛋攪拌成麵糊。", "熱平底鍋，抹上少許奶油。", "倒入一杓麵糊，煎至兩面金黃。", "堆疊鬆餅，淋上楓糖漿。"]
    },
    {
        id: 4,
        title: "巧克力布朗尼",
        image: "https://images.unsplash.com/photo-1606313564200-e75d5e30476d?w=500",
        time: "45 分鐘",
        calories: "500 kcal",
        tags: ["甜點"],
        ingredients: ["黑巧克力 200g", "奶油 100g", "糖 100g", "雞蛋 3顆", "麵粉 80g", "核桃 適量"],
        instructions: ["隔水加熱融化巧克力和奶油。", "加入糖攪拌均勻。", "分次加入雞蛋。", "拌入麵粉和核桃。", "180度烤箱烤25-30分鐘。"]
    },
    {
        id: 5,
        title: "日式味噌湯",
        image: "https://images.unsplash.com/photo-1547592166-23ac79775986?w=500",
        time: "10 分鐘",
        calories: "80 kcal",
        tags: ["早餐", "晚餐", "健康"],
        ingredients: ["味噌 2匙", "豆腐 半盒", "海帶芽 適量", "蔥花 少許", "水 500ml"],
        instructions: ["水煮滾，加入海帶芽。", "轉小火，加入豆腐塊。", "取少量熱水溶解味噌後倒回鍋中。", "煮熱但不要沸騰（以免破壞味噌風味）。", "撒上蔥花即可。"]
    }
];

const resultsContainer = document.getElementById('results');
const searchInput = document.getElementById('searchInput');
const modal = document.getElementById('modal');
const recipeDetails = document.getElementById('recipeDetails');
const closeBtn = document.querySelector('.close-btn');

function renderRecipes(items) {
    resultsContainer.innerHTML = '';
    items.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.innerHTML = `
            <div class="recipe-image" style="background-image: url('${recipe.image}')"></div>
            <div class="recipe-info">
                <h3>${recipe.title}</h3>
                <div class="meta">
                    <span>🕒 ${recipe.time}</span>
                    <span>🔥 ${recipe.calories}</span>
                </div>
            </div>
        `;
        card.addEventListener('click', () => showDetails(recipe));
        resultsContainer.appendChild(card);
    });
}

function showDetails(recipe) {
    recipeDetails.innerHTML = `
        <img src="${recipe.image}" class="detail-img">
        <h2>${recipe.title}</h2>
        <div class="meta" style="margin: 15px 0;">
            <span>🕒 ${recipe.time}</span>
            <span>🔥 ${recipe.calories}</span>
        </div>
        <h3>食材</h3>
        <ul class="ingredients-list">
            ${recipe.ingredients.map(ing => `<li>${ing}</li>`).join('')}
        </ul>
        <h3>做法</h3>
        <ol class="instructions-list">
            ${recipe.instructions.map(inst => `<li>${inst}</li>`).join('')}
        </ol>
    `;
    modal.classList.add('visible');
}

window.search = function (query) {
    searchInput.value = query;
    filterRecipes(query);
}

function filterRecipes(query) {
    const term = query.toLowerCase();
    const filtered = recipes.filter(r =>
        r.title.toLowerCase().includes(term) ||
        r.tags.some(tag => tag.includes(term))
    );
    renderRecipes(filtered);
}

searchInput.addEventListener('input', (e) => filterRecipes(e.target.value));

closeBtn.addEventListener('click', () => {
    modal.classList.remove('visible');
});

modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('visible');
});

// Initial render
renderRecipes(recipes);
