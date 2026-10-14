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
        scout: { food: 1 },
        subScout: { food: 1 },         // Стоимость разведки квадрата в лесу
        buildWarehouse: { gold: 10 }   // Стоимость постройки склада в лесу
    },
    patriot: {
        start: 100,
        max: 100,
        decayPerTick: 1,
        tickMs: 10000,
        revoltThreshold: 0
    },
    map: { cols: 4, rows: 5 },
    subMap: { cols: 3, rows: 3 }, // Размерность внутренней сетки леса
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
    selectedLoc: null,     // Текущая глобальная локация
    selectedSubLoc: null,  // Текущий квадрат внутри подлокации
    currentSubMapLoc: null,// Ссылка на глобальный Лес, в котором сейчас находится игрок
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
// ГЕНЕРАЦИЯ КАРТЫ И ПОДЛОКАЦИЙ
// ============================================================
function generateSubMap() {
    const total = CONFIG.subMap.cols * CONFIG.subMap.rows;
    const subLocs = [];

    // Генерируем 9 квадратов для леса. Гарантируем хотя бы 3 квадрата с богатым ресурсом
    const types = ['resource', 'resource', 'resource'];
    while (types.length < total) {
        types.push(Math.random() > 0.4 ? 'empty' : 'resource');
    }
    // Перемешиваем
    for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = types[i]; types[i] = types[j]; types[j] = tmp;
    }

    for (let i = 0; i < total; i++) {
        const isResource = types[i] === 'resource';
        subLocs.push({
            index: i,
            id: isResource ? 'wood_vein' : 'thicket',
            name: isResource ? 'Золотая жила леса' : 'Густая чаща',
            icon: isResource ? '🪵' : '🌿',
            scouted: false,
            hasWarehouse: false,
            workers: 0
        });
    }
    return subLocs;
}

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
            workers: 0, // Для Полей и Сел оставляем прямую добычу
            subLocs: id === 'forest' ? generateSubMap() : null, // Подсетка только для Леса
            warehouses: 0
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
    state.selectedSubLoc = null;
    state.currentSubMapLoc = null;
    state.gameOver = false;

    if (state.patriotTimer) clearInterval(state.patriotTimer);
    state.patriotTimer = setInterval(gameTick, CONFIG.patriot.tickMs);

    renderResources();
    renderMap();
    renderCurrentTask();
}

// ============================================================
// ИГРОВОЙ ТАКТ
// ============================================================
function gameTick() {
    if (state.gameOver) return;

    state.patriot -= CONFIG.patriot.decayPerTick;
    if (state.patriot <= CONFIG.patriot.revoltThreshold) {
        state.patriot = 0;
        endGame(false, 'Бунт! Уровень патриотизма упал до нуля. Народ сверг воеводу.');
        return;
    }

    let totalFoodGathered = 0;
    let totalWoodGathered = 0;
    let totalGoldGathered = 0;

    state.locations.forEach(function(loc) {
        if (loc.owner === 'player') {
            if (loc.id === 'field') {
                totalFoodGathered += loc.workers;
            } else if (loc.id === 'village') {
                totalGoldGathered += loc.workers;
            } else if (loc.id === 'forest' && loc.subLocs) {
                // Сбор дерева идет с каждого конкретного квадрата внутри подлокации леса
                loc.subLocs.forEach(function(sub) {
                    if (sub.id === 'wood_vein' && sub.workers > 0) {
                        // Базовая добыча 1 + бонус 1, если на этом квадрате построен склад
                        let bonus = sub.hasWarehouse ? 1 : 0;
                        totalWoodGathered += sub.workers * (1 + bonus);
                    }
                });
            }
        }
    });

    state.resources.food += totalFoodGathered;
    state.resources.wood += totalWoodGathered;
    state.resources.gold += totalGoldGathered;

    if (totalFoodGathered >= 5) checkTask('food5');
    if (totalWoodGathered >= 5) checkTask('wood5');

    renderResources();

    // Динамически обновляем интерфейсы, если игрок находится в меню
    if (state.currentSubMapLoc) {
        renderSubMap(state.currentSubMapLoc);
        if (state.selectedSubLoc) onSubLocationClick(state.selectedSubLoc);
    } else if (state.selectedLoc) {
        onLocationClick(state.selectedLoc);
    }
}

// ============================================================
// УПРАВЛЕНИЕ КРЕСТЬЯНАМИ
// ============================================================
function getAssignedPeasantsCount() {
    let count = 0;
    state.locations.forEach(function(loc) {
        count += (loc.workers || 0);
        if (loc.subLocs) {
            loc.subLocs.forEach(function(sub) {
                count += (sub.workers || 0);
            });
        }
    });
    return count;
}

function getFreePeasantsCount() {
    return state.resources.peasants - getAssignedPeasantsCount();
}

function assignPeasant(loc) {
    if (getFreePeasantsCount() > 0) {
        loc.workers++;
        onLocationClick(loc);
        renderMap();
    }
}

function removePeasant(loc) {
    if (loc.workers > 0) {
        loc.workers--;
        onLocationClick(loc);
        renderMap();
    }
}

// Назначение крестьян внутри леса на конкретный квадрат
function assignSubPeasant(subLoc) {
    if (getFreePeasantsCount() > 0) {
        subLoc.workers++;
        onSubLocationClick(subLoc);
        renderSubMap(state.currentSubMapLoc);
    }
}

function removeSubPeasant(subLoc) {
    if (subLoc.workers > 0) {
        subLoc.workers--;
        onSubLocationClick(subLoc);
        renderSubMap(state.currentSubMapLoc);
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
        let totalWorkers = loc.workers || 0;
        if (loc.subLocs) {
            loc.subLocs.forEach(function(s) { totalWorkers += (s.workers || 0); });
        }
        let workerBadge = totalWorkers > 0 ? ' (' + totalWorkers + '👨‍🌾)' : '';
        div.innerHTML =
            '' + (showInfo ? loc.icon : '❓') + '' +
            '' + (showInfo ? loc.name : '???') + workerBadge + '' +
            '' + getLocStatus(loc, totalWorkers) + '';
        div.onclick = createLocHandler(loc);
        grid.appendChild(div);
    }
}
function createLocHandler(loc) {
    return function() { onLocationClick(loc); };
}
function getLocStatus(loc, totalWorkers) {
    if (loc.owner === 'player') {
        if (loc.id === 'base' && !loc.baseBuilt) return 'нужно построить базу';
        if (totalWorkers > 0) return 'идет добыча...';
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
// ВЗАИМОДЕЙСТВИЕ С ГЛОБАЛЬНОЙ КАРТОЙ
// ============================================================
function onLocationClick(loc) {
    if (state.gameOver) return;
    if (loc.owner !== 'player' && !loc.scouted && !isAdjacentToPlayer(loc)) return;
// ЕСЛИ КЛИКНУЛИ НА КУПЛЕННЫЙ ЛЕС -> ЗАХОДИМ ВНУТРЬ ЛОКАЦИИ ЛЕСА
    if (loc.id === 'forest' && loc.owner === 'player') {
        closeActionPanel();
        openSubMap(loc);
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
        let resourceInfo = loc.id === 'field' ? 'производят Еду (🍞)' : 'приносят Золото (🪙)';
        desc.textContent = 'Земля под вашим контролем. Назначено крестьян: ' + loc.workers + '. Они ' + resourceInfo + ' каждый такт.';
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
// ============================================================
// НОВАЯ ЛОГИКА: ВНУТРЕННИЙ ЭКРАН ЛЕСА (СУБКАРТА)
// ============================================================
function openSubMap(loc) {
    state.currentSubMapLoc = loc;
    document.getElementById('map-screen').classList.remove('active');
    document.getElementById('submap-screen').classList.add('active');
    renderSubMap(loc);
}
function backToGlobalMap() {
    closeActionPanel();
    state.currentSubMapLoc = null;
    state.selectedSubLoc = null;
    document.getElementById('submap-screen').classList.remove('active');
    document.getElementById('map-screen').classList.add('active');
    renderMap();
}
function renderSubMap(forestLoc) {
    document.getElementById('submap-warehouses').textContent = forestLoc.warehouses || 0;
    const grid = document.getElementById('submap-grid');
    grid.innerHTML = '';
    forestLoc.subLocs.forEach(function(sub) {
        const div = document.createElement('div');
        div.className = 'sub-loc';
        if (!sub.scouted) div.classList.add('fog');
        if (sub.scouted && sub.id === 'wood_vein') div.classList.add('has-resource');
        if (sub.hasWarehouse) div.classList.add('has-warehouse');
        let workerText = sub.workers > 0 ? ' (' + sub.workers + '👨‍🌾)' : '';
        div.innerHTML =
            '' + (sub.scouted ? sub.icon : '❓') + '' +
            '' + (sub.scouted ? sub.name : 'Чаща') + '' +
            '' + workerText + '';
        div.onclick = function() { onSubLocationClick(sub); };
        grid.appendChild(div);
    });
}
function onSubLocationClick(sub) {
    if (state.gameOver) return;
    state.selectedSubLoc = sub;
    const panel = document.getElementById('action-panel');
    const title = document.getElementById('action-title');
    const desc = document.getElementById('action-desc');
    const btns = document.getElementById('action-buttons');
    btns.innerHTML = '';
    title.textContent = sub.scouted ? sub.name : 'Неразведанная чаща';
    if (!sub.scouted) {
        desc.textContent = 'Этот квадрат леса зарос дикими колючками. Разведайте его, чтобы найти ресурсы или место под склад.';
        addBtn(btns, '🔍 Разведать квадрат (1 🍞)', function() { scoutSubLocation(sub); }, state.resources.food >= CONFIG.costs.subScout.food);
    } else {
        if (sub.id === 'wood_vein') {
            let prodRate = sub.hasWarehouse ? '2 🪵 (Со складом)' : '1 🪵';
            desc.textContent = 'Древесная жила. Сюда можно отправить крестьян. Каждый приносит ' + prodRate + ' в такт. Сейчас работает: ' + sub.workers + ' чел.';
            addBtn(btns, '➕ Назначить крестьянина (Свободно: ' + getFreePeasantsCount() + ')', function() { assignSubPeasant(sub); }, getFreePeasantsCount() > 0);
            addBtn(btns, '➖ Убрать крестьянина', function() { removeSubPeasant(sub); }, sub.workers > 0);
            if (!sub.hasWarehouse) {
                addBtn(btns, '🏠 Построить Склад (10 🪙)', function() { buildWarehouse(sub); }, state.resources.gold >= CONFIG.costs.buildWarehouse.gold);
            }
        } else {
            desc.textContent = 'Обычная лесная прогалина. Добывать дерево здесь нельзя, но площадка подходит для логистики.';
            if (!sub.hasWarehouse) {
                addBtn(btns, '🏠 Построить Склад (10 🪙)', function() { buildWarehouse(sub); }, state.resources.gold >= CONFIG.costs.buildWarehouse.gold);
            } else {
                desc.textContent = 'Здесь построен лесной Склад. Он улучшает общую координацию лесорубов.';
            }
        }
    }
    panel.classList.add('open');
}
function scoutSubLocation(sub) {
    if (state.resources.food >= CONFIG.costs.subScout.food) {
        state.resources.food -= CONFIG.costs.subScout.food;
        sub.scouted = true;
        renderResources();
        renderSubMap(state.currentSubMapLoc);
        onSubLocationClick(sub);
    }
}
function buildWarehouse(sub) {
    if (state.resources.gold >= CONFIG.costs.buildWarehouse.gold) {
        state.resources.gold -= CONFIG.costs.buildWarehouse.gold;
        sub.hasWarehouse = true;
        state.currentSubMapLoc.warehouses = (state.currentSubMapLoc.warehouses || 0) + 1;
        renderResources();
        renderSubMap(state.currentSubMapLoc);
        onSubLocationClick(sub);
    }
}
// ============================================================
// КНОПКИ И ДЕЙСТВИЯ
// ============================================================
function addBtn(container, label, onClick, enabled) {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = label;
    btn.disabled = !enabled;
    btn.onclick = onClick;
    container.appendChild(btn);
}
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
    state.selectedSubLoc = null;
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
            if (state.currentSubMapLoc) backToGlobalMap();
            document.getElementById('map-screen').classList.remove('active');
            document.getElementById('briefing').classList.add('active');
        }
    };
    modal.classList.add('open');
}
