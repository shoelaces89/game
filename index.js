// ============================================================
// КОНФИГ
// ============================================================
const CONFIG = {
    resources: {
        food: { name: 'Еда', icon: '🍞', start: 100 },
        wood: { name: 'Древесина', icon: '🪵', start: 100 },
        gold: { name: 'Золото', icon: '🪙', start: 0 },
        peasants: { name: 'Крестьяне', icon: '👨‍🌾', start: 100 }
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
        gold: CONFIG.resources.gold.start,
        peasants: CONFIG.resources.peasants.start
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
            baseBuilt: false,
            workers: 0 // Сюда назначаются крестьяне
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
        gold: CONFIG.resources.gold.start,
        peasants: CONFIG.resources.peasants.start
    };
    state.patriot = CONFIG.patriot.start;
    state.tasks = {};
    CONFIG.tasks.forEach(function(t) { state.tasks[t.id] = false; });
    state.locations = generateMap();
    state.selectedLoc = null;
    state.gameOver = false;

    if (state.patriotTimer) clearInterval(state.patriotTimer);
    state.patriotTimer = setInterval(gameTick, CONFIG.patriot.tickMs);

    renderResources();
    renderMap();
    renderCurrentTask();
}

// ============================================================
// ИГРОВОЙ ТАКТ (АВТОМАТИЧЕСКАЯ ДОБЫЧА РЕСУРСОВ)
// ============================================================
function gameTick() {
    if (state.gameOver) return;

    // 1. Убывание патриотизма со временем
    state.patriot -= CONFIG.patriot.decayPerTick;
    if (state.patriot <= CONFIG.patriot.revoltThreshold) {
        state.patriot = 0;
        endGame(false, 'Бунт! Уровень патриотизма упал до нуля. Народ сверг воеводу.');
        return;
    }

    // Variables to track total production in this tick
    let totalFoodGathered = 0;
    let totalWoodGathered = 0;
    let totalGoldGathered = 0;

    // 2. Сбор ресурсов со всех подконтрольных клеток, где есть рабочие
    state.locations.forEach(function(loc) {
        if (loc.owner === 'player' && loc.workers > 0) {
            if (loc.id === 'field') {
                totalFoodGathered += loc.workers; // 1 рабочий = 1 еда
            } else if (loc.id === 'forest') {
                totalWoodGathered += loc.workers; // 1 рабочий = 1 дерево
            } else if (loc.id === 'village') {
                totalGoldGathered += loc.workers; // 1 рабочий = 1 золото
            }
        }
    });

    // Добавляем добытое в общие ресурсы
    state.resources.food += totalFoodGathered;
    state.resources.wood += totalWoodGathered;
    state.resources.gold += totalGoldGathered;

    // Проверяем выполнение квестов на производство за такт
    if (totalFoodGathered >= 5) {
        checkTask('food5');
    }
    if (totalWoodGathered >= 5) {
        checkTask('wood5');
    }

    renderResources();
}

// ============================================================
// РАСПРЕДЕЛЕНИЕ ТРУДА (УПРАВЛЕНИЕ КРЕСТЬЯНАМИ)
// ============================================================
function getAssignedPeasantsCount() {
    return state.locations.reduce(function(sum, loc) { return sum + (loc.workers || 0); }, 0);
}

function getFreePeasantsCount() {
    return state.resources.peasants - getAssignedPeasantsCount();
}

function assignPeasant(loc) {
    if (getFreePeasantsCount() > 0) {
        loc.workers++;
        onLocationClick(loc); // Обновляем текст и доступность кнопок в меню
        renderMap();
    }
}

function removePeasant(loc) {
    if (loc.workers > 0) {
        loc.workers--;
        onLocationClick(loc); // Обновляем текст и доступность кнопок в меню
        renderMap();
    }
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
function canAfford(cost) {
    for (let res in cost) {
        if (state.resources[res] < cost[res]) return false;
    }
    return true;
}

function payCost(cost) {
    for (let res in cost) {
        state.resources[res] -= cost[res];
    }
}

function checkTask(id) {
    if (state.tasks[id] === false) {
        state.tasks[id] = true;
        renderCurrentTask();
        checkVictory();
    }
}

function checkVictory() {
    const allDone = CONFIG.tasks.every(function(t) { return state.tasks[t.id]; });
    if (allDone) {
        endGame(true, 'Победа! Все задачи миссии выполнены. Земля предков освоена!');
    }
}

// ============================================================
// РЕНДЕР ИНТЕРФЕЙСА
// ============================================================
function renderResources() {
    document.getElementById('r-food').textContent = state.resources.food;
    document.getElementById('r-wood').textContent = state.resources.wood;
    document.getElementById('r-gold').textContent = state.resources.gold;
    document.getElementById('r-peasants').textContent = getFreePeasantsCount() + ' / ' + state.resources.peasants;
    document.getElementById('r-patriot').textContent = state.patriot;
    const pct = (state.patriot / CONFIG.patriot.max) * 100;
    document.getElementById('patriot-fill').style.width = pct + '%';
}

function renderCurrentTask() {
    const current = CONFIG.tasks.find(function(t) { return !state.tasks[t.id]; });
    const el = document.getElementById('task-text');
    if (current) {
        el.textContent = '📜 ' + current.text;
    } else {
        el.textContent = '✅ Все задачи выполнены';
    }
}

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

        let workerBadge = '';
        if (loc.owner === 'player' && loc.workers > 0) {
            workerBadge = ' (' + loc.workers + '👨‍🌾)';
        }

        div.innerHTML =
            '<div class="loc-icon">' + (showInfo ? loc.icon : '❓') + '</div>' +
            '<div class="loc-name">' + (showInfo ? loc.name : '???') + workerBadge + '</div>' +
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
        if (loc.workers > 0) {
            if (loc.id === 'field') return 'растим хлеб...';
            if (loc.id === 'forest') return 'рубим лес...';
            if (loc.id === 'village') return 'собираем оброк...';
            return 'работают...';
        }
        return 'под контролем';
    }
    if (loc.scouted) return 'разведано';
    if (!isAdjacentToPlayer(loc)) return 'далеко';
    return 'туман войны';
}

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
// ВЗАИМОДЕЙСТВИЕ С ЗЕМЛЯМИ И НАЗНАЧЕНИЕ КРЕСТЬЯН
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
        addBtn(btns, '🔍 Разведка (1 🍞)', function() { scoutLocation(loc); }, state.resources.food >= CONFIG.costs.scout.food);
    } else if (loc.id === 'base' && loc.owner === 'player' && !loc.baseBuilt) {
        desc.textContent = 'Здесь будет ваша главная база. Постройте её, чтобы начать.';
        addBtn(btns, '🏕️ Построить базу (3 🍞, 2 🪵)', function() { buildBase(loc); }, canAfford(CONFIG.costs.buildBase));
    } else if (loc.owner === 'player') {
// Для любой подконтрольной территории выводим интерфейс управления рабочими
        let resourceInfo = '';
        if (loc.id === 'field') resourceInfo = 'производят Еду (🍞)';
        else if (loc.id === 'forest') resourceInfo = 'добывают Древесину (🪵)';
        else if (loc.id === 'village') resourceInfo = 'приносят Золото (🪙)';
        else resourceInfo = 'не приносят ресурсов (пустошь)';
        desc.textContent = 'Земля под вашим контролем. Назначено крестьян: ' + loc.workers + '. Они ' + resourceInfo + ' каждый такт.';
// Кнопки добавления и удаления рабочих
        addBtn(btns, '➕ Назначить крестьянина (Свободно: ' + getFreePeasantsCount() + ')', function() { assignPeasant(loc); }, getFreePeasantsCount() > 0);
        addBtn(btns, '➖ Убрать крестьянина', function() { removePeasant(loc); }, loc.workers > 0);
    } else {
        desc.textContent = 'Разведано. Вы можете присоединить эту землю к своим владениям.';
        addBtn(btns, '🚩 Присоединить земли', function() {
            loc.owner = 'player';
            closeActionPanel();
            renderMap();
            checkVictory();
        }, true);
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
// ============================================================
// УПРАВЛЕНИЕ ИГРОВЫМИ ДЕЙСТВИЯМИ
// ============================================================
function startMission() {
    document.getElementById('briefing').classList.remove('active');
    document.getElementById('map-screen').classList.add('active');
    initState();
}
function scoutLocation(loc) {
    if (state.resources.food >= CONFIG.costs.scout.food) {
        state.resources.food -= CONFIG.costs.scout.food;
        loc.scouted = true;
        const anyScouted = state.locations.some(function(l) { return l.index !== 16 && l.scouted; });
        if (anyScouted) {
            checkTask('scout');
        }
        closeActionPanel();
        renderResources();
        renderMap();
    }
}
function buildBase(loc) {
    if (canAfford(CONFIG.costs.buildBase)) {
        payCost(CONFIG.costs.buildBase);
        loc.baseBuilt = true;
        checkTask('base');
        closeActionPanel();
        renderResources();
        renderMap();
    }
}
function closeActionPanel() {
    document.getElementById('action-panel').classList.remove('open');
    state.selectedLoc = null;
}
function endGame(isVictory, message) {
    state.gameOver = true;
    if (state.patriotTimer) clearInterval(state.patriotTimer);
    const modal = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const text = document.getElementById('modal-text');
    const btn = document.getElementById('modal-btn');
    title.textContent = isVictory ? 'Победа!' : 'Поражение';
    text.textContent = message;
    btn.textContent = isVictory ? 'Отлично' : 'Начать заново';
    btn.onclick = function() {
        modal.classList.remove('open');
        if (!isVictory) {
            document.getElementById('map-screen').classList.remove('active');
            document.getElementById('briefing').classList.add('active');
        }
    };
    modal.classList.add('open');
}
