// ============================================================
// КОНФИГ
// ============================================================
const CONFIG = {
    resources: {
        food: { name: 'Еда', icon: '🍞', start: 100 },
        wood: { name: 'Древесина', icon: '🪵', start: 100 },
        gold: { name: 'Золото', icon: '🪙', start: 0 }
    },
    costs: {
        buildBase: { food: 3, wood: 2 },
        scout: { food: 1 }
    },
    patriot: {
        start: 100,
        max: 100,
        decayPerTick: 1,
        tickMs: 10000,
        revoltThreshold: 0
    },
    map: { cols: 4, rows: 5 },
    tasks: [
        { id: 'base', text: 'Построить базу' },
        { id: 'scout', text: 'Провести разведку местности' },
        { id: 'food5', text: 'Произвести еду ×5' },
        { id: 'wood5', text: 'Добыть древесину ×5' }
    ]
};

// ============================================================
// СОСТОЯНИЕ
// ============================================================
const state = {
    resources: {
        food: CONFIG.resources.food.start,
        wood: CONFIG.resources.wood.start,
        gold: CONFIG.resources.gold.start
    },
    patriot: CONFIG.patriot.start,
    tasks: {},
    locations: [],
    selectedLoc: null,
    gameOver: false,
    patriotTimer: null
};

const LOCATION_TYPES = [
    { id: 'field', name: 'Поле', icon: '🌾' },
    { id: 'forest', name: 'Лес', icon: '🌲' },
    { id: 'village', name: 'Село', icon: '🏘️' },
    { id: 'empty', name: 'Пустошь', icon: '⬜' }
];

// ============================================================
// ГЕНЕРАЦИЯ КАРТЫ
// ============================================================
function generateMap() {
    const cols = CONFIG.map.cols;
    const rows = CONFIG.map.rows;
    const total = cols * rows;
    const locs = [];
    const baseIndex = (rows - 1) * cols + 0;

    const guaranteed = ['field', 'forest', 'village'];
    const types = guaranteed.slice();
    while (types.length < total - 1) {
        const t = LOCATION_TYPES[Math.floor(Math.random() * LOCATION_TYPES.length)].id;
        types.push(t);
    }
    for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = types[i]; types[i] = types[j]; types[j] = tmp;
    }

    let typeIndex = 0;
    for (let i = 0; i < total; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        let id, name, icon;
        if (i === baseIndex) {
            id = 'base'; name = 'База'; icon = '🏕️';
        } else {
            const typeId = types[typeIndex++];
            const def = LOCATION_TYPES.find(function(t) { return t.id === typeId; });
            id = typeId; name = def.name; icon = def.icon;
        }
        locs.push({
            index: i, col: col, row: row, id: id, name: name, icon: icon,
            owner: i === baseIndex ? 'player' : 'none',
            scouted: i === baseIndex,
            baseBuilt: false
        });
    }
    return locs;
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
function initState() {
    state.resources = {
        food: CONFIG.resources.food.start,
        wood: CONFIG.resources.wood.start,
        gold: CONFIG.resources.gold.start
    };
    state.patriot = CONFIG.patriot.start;
    state.tasks = {};
    CONFIG.tasks.forEach(function(t) { state.tasks[t.id] = false; });
    state.locations = generateMap();
    state.selectedLoc = null;
    state.gameOver = false;
    renderResources();
    renderMap();
    renderCurrentTask();
}

// ============================================================
// РЕНДЕР РЕСУРСОВ
// ============================================================
function renderResources() {
    document.getElementById('r-food').textContent = state.resources.food;
    document.getElementById('r-wood').textContent = state.resources.wood;
    document.getElementById('r-gold').textContent = state.resources.gold;
    document.getElementById('r-patriot').textContent = state.patriot;
    const pct = (state.patriot / CONFIG.patriot.max) * 100;
    document.getElementById('patriot-fill').style.width = pct + '%';
}

// ============================================================
// ТЕКУЩАЯ ЗАДАЧА
// ============================================================
function renderCurrentTask() {
    const current = CONFIG.tasks.find(function(t) { return !state.tasks[t.id]; });
    const el = document.getElementById('task-text');
    if (current) {
        el.textContent = '📜 ' + current.text;
    } else {
        el.textContent = '✅ Все задачи выполнены';
    }
}

// ============================================================
// РЕНДЕР КАРТЫ
// ============================================================
function renderMap() {
    const grid = document.getElementById('map-grid');
    grid.innerHTML = '';

    const sorted = state.locations.slice().sort(function(a, b) {
        if (a.row !== b.row) return a.row - b.row;
        return a.col - b.col;
    });

    for (let i = 0; i < sorted.length; i++) {
        const loc = sorted[i];
        const div = document.createElement('div');
        div.className = 'loc';

        if (!loc.scouted && loc.owner !== 'player') div.classList.add('fog');
        if (loc.owner === 'player') div.classList.add('player');
        if (loc.owner !== 'player' && !loc.scouted && !isAdjacentToPlayer(loc)) {
            div.classList.add('locked');
        }

        const showInfo = loc.scouted || loc.owner === 'player';
        div.innerHTML =
            '<div class="loc-icon">' + (showInfo ? loc.icon : '❓') + '</div>' +
            '<div class="loc-name">' + (showInfo ? loc.name : '???') + '</div>' +
            '<div class="loc-status">' + getLocStatus(loc) + '</div>';

        div.onclick = createLocHandler(loc);
        grid.appendChild(div);
    }
}

function createLocHandler(loc) {
    return function() { onLocationClick(loc); };
}

function getLocStatus(loc) {
    if (loc.owner === 'player') {
        if (loc.id === 'base' && !loc.baseBuilt) return 'нужно построить базу';
        return 'под контролем';
    }
    if (loc.scouted) return 'разведано';
    if (!isAdjacentToPlayer(loc)) return 'далеко';
    return 'туман войны';
}

// ============================================================
// СОСЕДСТВО
// ============================================================
function isAdjacentToPlayer(loc) {
    const cols = CONFIG.map.cols;
    const rows = CONFIG.map.rows;
    const neighbors = [];
    if (loc.col > 0)        neighbors.push(loc.index - 1);
    if (loc.col < cols - 1) neighbors.push(loc.index + 1);
    if (loc.row > 0)        neighbors.push(loc.index - cols);
    if (loc.row < rows - 1) neighbors.push(loc.index + cols);
    for (let i = 0; i < neighbors.length; i++) {
        if (state.locations[neighbors[i]].owner === 'player') return true;
    }
    return false;
}

// ============================================================
// КЛИК ПО ЛОКАЦИИ
// ============================================================
function onLocationClick(loc) {
    if (state.gameOver) return;

    if (loc.owner !== 'player' && !loc.scouted && !isAdjacentToPlayer(loc)) {
        return;
    }

    state.selectedLoc = loc;
    const panel = document.getElementById('action-panel');
    const title = document.getElementById('action-title');
    const desc = document.getElementById('action-desc');
    const btns = document.getElementById('action-buttons');
    btns.innerHTML = '';

    title.textContent = (loc.scouted || loc.owner === 'player') ? loc.name : 'Неизвестная локация';

    if (!loc.scouted && loc.owner !== 'player') {
        desc.textContent = 'Эта локация скрыта туманом войны. Проведите разведку, чтобы узнать, что здесь.';
        addBtn(btns, '🔍 Разведка (1 🍞)', function() { scoutLocation(loc); }, state.resources.food >= 1);
    } else if (loc.id === 'base' && loc.owner === 'player' && !loc.baseBuilt) {
        desc.textContent = 'Здесь будет ваша главная база. Постройте её, чтобы начать.';
        addBtn(btns, '🏕️ Построить базу (3 🍞, 2 🪵)', function() { buildBase(loc); }, canAfford(CONFIG.costs.buildBase));
    } else if (loc.owner === 'player') {
        desc.textContent = 'Локация под вашим контролем.';
    } else {
        desc.textContent = 'Разведано. Но пока не присоединено.';
    }

    panel.classList.add('open');
}

function addBtn(container, label, onClick, enabled) {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = label;
    btn.disabled = !enabled;
    btn.onclick = onClick;
    container.appendChild(btn);
}

function closeActionPanel() {
    document.getElementById('action-panel').classList.remove('open');
}

// ============================================================
// ДЕЙСТВИЯ
// ============================================================
function scoutLocation(loc) {
    if (state.resources.food < 1) return;
    state.resources.food -= 1;
    loc.scouted = true;
    loc.owner = 'player';
    checkTask('scout', true);
    closeActionPanel();
    renderMap();
    renderResources();
    renderCurrentTask();
    checkVictory();
}

function buildBase(loc) {
    if (!canAfford(CONFIG.costs.buildBase)) return;
    state.resources.food -= CONFIG.costs.buildBase.food;
    state.resources.wood -= CONFIG.costs.buildBase.wood;
    loc.baseBuilt = true;
    checkTask('base', true);
    closeActionPanel();
    renderMap();
    renderResources();
    renderCurrentTask();
    checkVictory();
}

// ============================================================
// РЕСУРСЫ
// ============================================================
function canAfford(cost) {
    for (const key in cost) {
        if (state.resources[key] < cost[key]) return false;
    }
    return true;
}

// ============================================================
// ЗАДАЧИ
// ============================================================
function checkTask(id, value) {
    if (state.tasks[id] !== value) {
        state.tasks[id] = value;
        renderCurrentTask();
    }
}

// ============================================================
// ПАТРИОТИЗМ
// ============================================================
function startPatriotTimer() {
    if (state.patriotTimer) clearInterval(state.patriotTimer);
    state.patriotTimer = setInterval(function() {
        if (state.gameOver) return;
        state.patriot = Math.max(0, state.patriot - CONFIG.patriot.decayPerTick);
        renderResources();
        if (state.patriot <= CONFIG.patriot.revoltThreshold) {
            triggerRevolt();
        }
    }, CONFIG.patriot.tickMs);
}

function triggerRevolt() {
    if (state.gameOver) return;
    state.gameOver = true;
    clearInterval(state.patriotTimer);
    showModal('💀 Мятеж!', 'Патриотизм упал до нуля. Народ восстал. Поражение.', 'Заново', function() { location.reload(); });
}

// ============================================================
// ПОБЕДА
// ============================================================
function checkVictory() {
    const baseOk = state.tasks.base;
    const allTasks = CONFIG.tasks.every(function(t) { return state.tasks[t.id]; });
    if (baseOk && allTasks) {
        state.gameOver = true;
        clearInterval(state.patriotTimer);
        showModal('🏆 Победа!', 'Все задачи выполнены, база под контролем. Миссия 1 пройдена!', 'Заново', function() { location.reload(); });
    }
}

// ============================================================
// МОДАЛКА
// ============================================================
function showModal(title, text, btnText, onClick) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-text').textContent = text;
    const btn = document.getElementById('modal-btn');
    btn.textContent = btnText;
    btn.onclick = onClick;
    document.getElementById('modal').classList.add('open');
}

// ============================================================
// СТАРТ МИССИИ
// ============================================================
function startMission() {
    document.getElementById('briefing').classList.remove('active');
    document.getElementById('map-screen').classList.add('active');
    initState();
    startPatriotTimer();
}

// ============================================================
// ЗАПУСК
// ============================================================
initState();
