'use strict';

// ============================================================
// КОНФИГ И БАЗОВЫЕ КОНСТАНТЫ
// ============================================================
const CONFIG = {
    resources: {
        food: { name: 'Еда', icon: '🍞', start: 10 },
        wood: { name: 'Древесина', icon: '🪵', start: 15 },
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

    forest: {
        upperWidth: 6,
        upperHeight: 5,
        totalSquares: 30,
        resourceSquaresCount: 21,
        amountPerSquare: 75,
        warehouseCapacity: 100,
        unlockCostProvision: 1,
        extractionTimeMs: 5000,
        warehouseCosts: [10, 12, 14, 16, 18, 20, 22]
    },

    tasks: [
        { id: 'base', text: 'Построить базу' },
        { id: 'scout', text: 'Провести разведку местности' },
        { id: 'wood5', text: 'Добыть древесину в лесу ×5' },
        { id: 'berries5', text: 'Собрать лесные ягоды ×5' }
    ]
};

const FOREST_RES_TYPES = [
    { id: 'wood', name: 'Древесина', icon: '🪵' },
    { id: 'hive', name: 'Улей пчелиный', icon: '🐝' },
    { id: 'animals', name: 'Звери', icon: '🦊' },
    { id: 'resin', name: 'Смола', icon: '💧' },
    { id: 'bark', name: 'Кора', icon: '🪵' },
    { id: 'mushrooms', name: 'Грибы', icon: '🍄' },
    { id: 'berries', name: 'Ягоды', icon: '🍒' }
];

const LOCATION_TYPES = [
    { id: 'field', name: 'Поле', icon: '🌾' },
    { id: 'forest', name: 'Лес', icon: '🌲' },
    { id: 'village', name: 'Село', icon: '🏘️' },
    { id: 'empty', name: 'Пустошь', icon: '⬜' }
];

// ============================================================
// ИГРОВОЕ СОСТОЯНИЕ
// ============================================================
const state = {
    resources: { food: 0, wood: 0, gold: 0 },
    peasants: { total: 0 },
    patriot: CONFIG.patriot.start,
    tasks: {},
    locations: [],
    selectedLoc: null,
    selectedForestTile: null,
    currentForestLoc: null,
    gameOver: false,
    patriotTimer: null,
    extractionTimer: null,
    // Счётчики суммарной добычи для задач
    totalExtracted: { wood: 0, berries: 0 }
};

// ============================================================
// ГЕНЕРАЦИЯ ДАННЫХ
// ============================================================
function generateForestData() {
    const upperTiles = [];
    const lowerWarehouses = [];

    const pool = [];
    FOREST_RES_TYPES.forEach(type => {
        for (let i = 0; i < 3; i++) {
            pool.push({ id: type.id, name: type.name, icon: type.icon });
        }
    });

    while (pool.length < CONFIG.forest.totalSquares) {
        pool.push({ id: 'empty', name: 'Пустой квадрат леса', icon: '🌿' });
    }

    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    for (let i = 0; i < CONFIG.forest.totalSquares; i++) {
        const col = i % CONFIG.forest.upperWidth;
        const row = Math.floor(i / CONFIG.forest.upperWidth);
        const resData = pool[i];

        upperTiles.push({
            index: i, col, row,
            id: resData.id, name: resData.name, icon: resData.icon,
            scouted: false,
            amount: resData.id !== 'empty' ? CONFIG.forest.amountPerSquare : 0,
            hasPeasant: false,
            depleted: false
        });
    }

    for (let i = 0; i < 7; i++) {
        lowerWarehouses.push({
            index: i,
            built: false,
            storedType: 'none',
            amount: 0
        });
    }

    // Открываем левый верхний тайл как точку входа
    upperTiles[0].scouted = true;

    return { upperTiles, lowerWarehouses };
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
        types.push(LOCATION_TYPES[Math.floor(Math.random() * LOCATION_TYPES.length)].id);
    }
    for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
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
            const def = LOCATION_TYPES.find(t => t.id === typeId);
            id = typeId; name = def.name; icon = def.icon;
        }

        locs.push({
            index: i, col, row, id, name, icon,
            owner: i === baseIndex ? 'player' : 'none',
            scouted: i === baseIndex,
            baseBuilt: false,
            forestData: id === 'forest' ? generateForestData() : null
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
    state.peasants.total = 0;
    state.patriot = CONFIG.patriot.start;
    state.gameOver = false;
    state.currentForestLoc = null;
    state.selectedLoc = null;
    state.selectedForestTile = null;
    state.totalExtracted = { wood: 0, berries: 0 };

    CONFIG.tasks.forEach(t => state.tasks[t.id] = false);

    state.locations = generateMap();

    if (state.patriotTimer) clearInterval(state.patriotTimer);
    if (state.extractionTimer) clearInterval(state.extractionTimer);

    state.patriotTimer = setInterval(gameTick, CONFIG.patriot.tickMs);
    state.extractionTimer = setInterval(forestExtractionTick, CONFIG.forest.extractionTimeMs);

    renderResources();
    renderMap();
    renderCurrentTask();
}

function getAssignedPeasantsCount() {
    let assigned = 0;
    state.locations.forEach(loc => {
        if (loc.forestData) {
            loc.forestData.upperTiles.forEach(tile => {
                if (tile.hasPeasant) assigned++;
            });
        }
    });
    return assigned;
}

function getFreePeasantsCount() {
    return state.peasants.total - getAssignedPeasantsCount();
}

// ============================================================
// ИГРОВЫЕ ТИКИ
// ============================================================
function gameTick() {
    if (state.gameOver) return;
    state.patriot -= CONFIG.patriot.decayPerTick;
    if (state.patriot <= CONFIG.patriot.revoltThreshold) {
        state.patriot = 0;
        endGame(false, 'Бунт! Патриотизм на нуле. Народ сверг воеводу.');
        return;
    }
    renderResources();
}

function forestExtractionTick() {
    if (state.gameOver) return;

    let updateRequired = false;

    state.locations.forEach(loc => {
        if (loc.id === 'forest' && loc.owner === 'player' && loc.forestData) {
            loc.forestData.upperTiles.forEach(tile => {
                if (!tile.hasPeasant || tile.amount <= 0 || tile.depleted) return;

                // Ищем подходящий склад с местом
                const warehouse = loc.forestData.lowerWarehouses.find(
                    w => w.built && w.storedType === tile.id && w.amount < CONFIG.forest.warehouseCapacity
                );

                // Без склада крестьянин не добывает
                if (!warehouse) return;

                tile.amount--;
                warehouse.amount++;
                updateRequired = true;

                // Суммарные счётчики для задач
                if (tile.id === 'wood') {
                    state.totalExtracted.wood++;
                    if (state.totalExtracted.wood >= 5) checkTask('wood5');
                }
                if (tile.id === 'berries') {
                    state.totalExtracted.berries++;
                    if (state.totalExtracted.berries >= 5) checkTask('berries5');
                }

                if (tile.amount <= 0) {
                    tile.amount = 0;
                    tile.hasPeasant = false;
                    tile.depleted = true;
                    tile.id = 'empty';
                    tile.name = 'Отработанный пустой квадрат';
                    tile.icon = '⬜';
                }
            });
        }
    });

    if (updateRequired) {
        renderResources();
        if (state.currentForestLoc) {
            renderForestScreen(state.currentForestLoc);
            if (state.selectedForestTile) {
                refreshForestActionPanel();
            }
        }
    }
}

// ============================================================
// РЕНДЕР HUD И КАРТЫ
// ============================================================
function renderResources() {
    document.getElementById('r-food').textContent = state.resources.food;
    document.getElementById('r-wood').textContent = state.resources.wood;
    document.getElementById('r-gold').textContent = state.resources.gold;
    document.getElementById('r-peasants').textContent = getFreePeasantsCount() + ' / ' + state.peasants.total;
    document.getElementById('r-patriot').textContent = state.patriot;
    document.getElementById('patriot-fill').style.width = (state.patriot / CONFIG.patriot.max * 100) + '%';
    const bar = document.getElementById('patriot-bar');
    if (bar) bar.setAttribute('aria-valuenow', state.patriot);
}

function renderCurrentTask() {
    const current = CONFIG.tasks.find(t => !state.tasks[t.id]);
    document.getElementById('task-text').textContent = current
        ? '📜 ' + current.text
        : '✅ Все задачи выполнены';
}

function renderMap() {
    const grid = document.getElementById('map-grid');
    grid.innerHTML = '';
    const sorted = state.locations.slice().sort((a, b) =>
        a.row !== b.row ? a.row - b.row : a.col - b.col
    );

    sorted.forEach(loc => {
        const div = document.createElement('div');
        div.className = 'loc';

        const isAdj = isAdjacentToPlayer(loc);
        const showInfo = loc.scouted || loc.owner === 'player';

        if (!showInfo) div.classList.add('fog');
        if (loc.owner === 'player') div.classList.add('player');
        if (loc.owner !== 'player' && !loc.scouted && !isAdj) div.classList.add('locked');

        let statusText = 'туман войны';
        if (loc.owner === 'player') {
            statusText = (loc.id === 'base' && !loc.baseBuilt) ? 'требует постройки' : 'под контролем';
        } else if (loc.scouted) {
            statusText = 'разведано';
        } else if (!isAdj) {
            statusText = 'далеко';
        }

        div.innerHTML = `
            <div class="loc-icon">${showInfo ? loc.icon : '❓'}</div>
            <div class="loc-name">${showInfo ? loc.name : '???'}</div>
            <div class="loc-status">${statusText}</div>
        `;

        div.addEventListener('click', () => onLocationClick(loc));
        grid.appendChild(div);
    });
}

function isAdjacentToPlayer(loc) {
    const cols = CONFIG.map.cols;
    const neighbors = [];
    if (loc.col > 0) neighbors.push(loc.index - 1);
    if (loc.col < cols - 1) neighbors.push(loc.index + 1);
    if (loc.row > 0) neighbors.push(loc.index - cols);
    if (loc.row < CONFIG.map.rows - 1) neighbors.push(loc.index + cols);
    return neighbors.some(nIdx => state.locations[nIdx].owner === 'player');
}

// ============================================================
// ВЗАИМОДЕЙСТВИЕ С КАРТОЙ
// ============================================================
function onLocationClick(loc) {
    if (state.gameOver) return;
    if (loc.owner !== 'player' && !loc.scouted && !isAdjacentToPlayer(loc)) return;

    state.selectedLoc = loc;

    const btns = document.getElementById('action-buttons');
    const title = document.getElementById('action-title');
    const desc = document.getElementById('action-desc');
    btns.innerHTML = '';
    title.textContent = (loc.scouted || loc.owner === 'player') ? loc.name : 'Неизвестная территория';

    if (!loc.scouted && loc.owner !== 'player') {
        desc.textContent = 'Локация скрыта туманом. Отправьте разведчиков.';
        addBtn(btns, '🔍 Разведка (1 🍞)', () => scoutLocation(loc),
            state.resources.food >= CONFIG.costs.scout.food);
    } else if (loc.id === 'base' && loc.owner === 'player' && !loc.baseBuilt) {
        desc.textContent = 'Оснуйте город, чтобы получить первых подданных.';
        addBtn(btns, '🏕️ Построить город (3 🍞, 2 🪵)', () => buildBase(loc),
            state.resources.food >= CONFIG.costs.buildBase.food &&
            state.resources.wood >= CONFIG.costs.buildBase.wood);
    } else if (loc.owner === 'player') {
        if (loc.id === 'forest') {
            let warehouseList = 'Построенные склады:\n';
            let builtAny = false;
            loc.forestData.lowerWarehouses.forEach((w, i) => {
                if (w.built) {
                    builtAny = true;
                    const resName = FOREST_RES_TYPES.find(r => r.id === w.storedType)?.name || 'Пусто';
                    warehouseList += `• Слот ${i + 1}: ${resName} (${w.amount} / ${CONFIG.forest.warehouseCapacity} ед.)\n`;
                }
            });
            if (!builtAny) warehouseList += 'Склады отсутствуют.';

            desc.textContent = warehouseList;
            addBtn(btns, '🚪 Зайти в Лес', () => {
                closeActionPanel();
                openForestScreen(loc);
            }, true);
        } else {
            desc.textContent = loc.id === 'field'
                ? 'Регион поставляет ресурсы на внешние рынки.'
                : 'Селение выплачивает регулярные подати.';
        }
    } else {
        desc.textContent = 'Земля разведана. Присоедините её к своим владениям.';
        addBtn(btns, '🚩 Присоединить мирно', () => {
            loc.owner = 'player';
            closeActionPanel();
            renderMap();
        }, true);
    }

    document.getElementById('action-panel').classList.add('open');
}

function scoutLocation(loc) {
    if (state.resources.food < CONFIG.costs.scout.food) return;
    state.resources.food -= CONFIG.costs.scout.food;
    loc.scouted = true;
    checkTask('scout');
    closeActionPanel();
    renderResources();
    renderMap();
}

function buildBase(loc) {
    const { food, wood } = CONFIG.costs.buildBase;
    if (state.resources.food < food || state.resources.wood < wood) return;

    state.resources.food -= food;
    state.resources.wood -= wood;
    loc.baseBuilt = true;
    state.peasants.total += 5;
    checkTask('base');
    closeActionPanel();
    renderResources();
    renderMap();
}

// ============================================================
// ЭКРАН ЛЕСА
// ============================================================
function openForestScreen(loc) {
    state.currentForestLoc = loc;
    document.getElementById('map-screen').classList.remove('active');
    document.getElementById('submap-screen').classList.add('active');
    renderForestScreen(loc);
}

function backToGlobalMap() {
    closeActionPanel();
    state.currentForestLoc = null;
    state.selectedForestTile = null;
    document.getElementById('submap-screen').classList.remove('active');
    document.getElementById('map-screen').classList.add('active');
    renderMap();
}

function renderForestScreen(loc) {
    const upperGrid = document.getElementById('submap-grid-upper');
    upperGrid.innerHTML = '';

    loc.forestData.upperTiles.forEach(tile => {
        const div = document.createElement('div');
        div.className = 'forest-tile';

        if (!tile.scouted) {
            div.classList.add('upper-fog');
            div.innerHTML = `<span class="tile-icon">❓</span>`;
            if (isAdjacentInForest(tile, loc.forestData.upperTiles)) {
                div.addEventListener('click', () => onForestUpperClick(tile));
            } else {
                div.classList.add('locked');
            }
        } else {
            if (tile.depleted || tile.id === 'empty') {
                div.classList.add('upper-empty');
                div.innerHTML = `<span class="tile-icon">${tile.icon}</span>`;
            } else {
                div.classList.add(tile.hasPeasant ? 'upper-working' : 'upper-resource');
                div.innerHTML = `
                    <span class="tile-icon">${tile.icon}</span>
                    <span class="tile-badge">${tile.hasPeasant ? '👨‍🌾 ' : ''}${tile.amount}</span>
                `;
            }
            div.addEventListener('click', () => onForestUpperClick(tile));
        }
        upperGrid.appendChild(div);
    });

    const lowerGrid = document.getElementById('submap-grid-lower');
    lowerGrid.innerHTML = '';

    loc.forestData.lowerWarehouses.forEach(w => {
        const div = document.createElement('div');
        div.className = 'forest-tile';

        if (!w.built) {
            div.classList.add('lower-empty');
            div.innerHTML = `<span class="tile-icon">➕</span>`;
        } else {
            div.classList.add('lower-warehouse');
            const resDef = FOREST_RES_TYPES.find(r => r.id === w.storedType);
            div.innerHTML = `
                <span class="tile-icon">🏠</span>
                <span class="tile-badge">${resDef ? resDef.icon : '⬜'}:${w.amount}</span>
            `;
        }
        div.addEventListener('click', () => onForestLowerClick(w));
        lowerGrid.appendChild(div);
    });
}

function isAdjacentInForest(tile, allTiles) {
    const w = CONFIG.forest.upperWidth;
    const neighbors = [];
    if (tile.col > 0) neighbors.push(tile.index - 1);
    if (tile.col < w - 1) neighbors.push(tile.index + 1);
    if (tile.row > 0) neighbors.push(tile.index - w);
    if (tile.row < CONFIG.forest.upperHeight - 1) neighbors.push(tile.index + w);
    return neighbors.some(nIdx => allTiles[nIdx].scouted);
}

// ============================================================
// КЛИКИ ПО ЛЕСНЫМ ТАЙЛАМ
// ============================================================
function onForestUpperClick(tile) {
    if (state.gameOver) return;
    state.selectedForestTile = { type: 'upper', data: tile };
    refreshForestActionPanel();
}

function onForestLowerClick(warehouse) {
    if (state.gameOver) return;
    state.selectedForestTile = { type: 'lower', data: warehouse };
    refreshForestActionPanel();
}

function refreshForestActionPanel() {
    if (!state.selectedForestTile) return;

    const { type, data: item } = state.selectedForestTile;
    const btns = document.getElementById('action-buttons');
    const title = document.getElementById('action-title');
    const desc = document.getElementById('action-desc');
    btns.innerHTML = '';

    if (type === 'upper') {
        if (!item.scouted) {
            title.textContent = 'Густая лесная чаща';
            desc.textContent = `Квадрат скрыт ветвями. Прорубить тропу к ресурсам?\nСтоимость: ${CONFIG.forest.unlockCostProvision} 🍞.`;
            addBtn(btns, '🪓 Прорубить просеку',
                () => unlockForestSquare(item),
                state.resources.food >= CONFIG.forest.unlockCostProvision);
        } else {
            title.textContent = item.name;
            if (item.id === 'empty') {
                desc.textContent = 'Здесь нет ничего ценного, обычная поляна.';
            } else {
                const warehouse = state.currentForestLoc.forestData.lowerWarehouses.find(
                    w => w.built && w.storedType === item.id && w.amount < CONFIG.forest.warehouseCapacity
                );
                const hasWarehouse = !!warehouse;

                desc.textContent =
                    `Осталось запасов: ${item.amount} ед.\n` +
                    `Крестьян занято: ${item.hasPeasant ? '1' : '0'}.\n` +
                    (hasWarehouse
                        ? `Склад: ${warehouse.amount}/${CONFIG.forest.warehouseCapacity} ед.`
                        : `⚠️ Нет склада под «${item.name}». Постройте в нижнем поле.`);

                if (!item.hasPeasant) {
                    const hasFree = getFreePeasantsCount() > 0;
                    addBtn(btns, '👨‍🌾 Отправить добывать',
                        () => togglePeasantOnSquare(item, true),
                        hasFree && hasWarehouse);
                } else {
                    addBtn(btns, '🛑 Отозвать крестьянина',
                        () => togglePeasantOnSquare(item, false),
                        true);
                }
            }
        }
    } else if (type === 'lower') {
        const currentCount = state.currentForestLoc.forestData.lowerWarehouses.filter(w => w.built).length;

        if (!item.built) {
            const cost = CONFIG.forest.warehouseCosts[currentCount] || 22;
            title.textContent = 'Пустой слот под склад';
            desc.textContent = `Построить лесной склад для координации добычи?\nСтоимость: ${cost} 🪵.`;
            addBtn(btns, `🪵 Построить склад (${cost} ед.)`,
                () => buildForestWarehouse(item, cost),
                state.resources.wood >= cost);
        } else {
            title.textContent = 'Лесной Склад';
            const resDef = FOREST_RES_TYPES.find(r => r.id === item.storedType);
            desc.textContent =
                `Тип хранения: ${resDef ? resDef.name : 'Пусто'}.\n` +
                `Заполнено: ${item.amount} / ${CONFIG.forest.warehouseCapacity} ед.`;

            FOREST_RES_TYPES.forEach(res => {
                if (item.storedType !== res.id) {
                    addBtn(btns, `📦 Хранить ${res.icon} ${res.name}`,
                        () => changeWarehouseResource(item, res.id), true);
                }
            });

            if (item.storedType !== 'none') {
                addBtn(btns, '🗑️ Сбросить фильтр склада',
                    () => changeWarehouseResource(item, 'none'), true);
            }
        }
    }

    document.getElementById('action-panel').classList.add('open');
}

function unlockForestSquare(tile) {
    if (state.resources.food < CONFIG.forest.unlockCostProvision) return;
    state.resources.food -= CONFIG.forest.unlockCostProvision;
    tile.scouted = true;
    renderResources();
    renderForestScreen(state.currentForestLoc);
    onForestUpperClick(tile);
}

function togglePeasantOnSquare(tile, activate) {
    if (activate) {
        if (getFreePeasantsCount() <= 0) return;
        tile.hasPeasant = true;
    } else {
        tile.hasPeasant = false;
    }
    renderResources();
    renderForestScreen(state.currentForestLoc);
    onForestUpperClick(tile);
}

function buildForestWarehouse(warehouse, cost) {
    if (state.resources.wood < cost) return;
    state.resources.wood -= cost;
    warehouse.built = true;
    warehouse.storedType = 'none';
    warehouse.amount = 0;
    renderResources();
    renderForestScreen(state.currentForestLoc);
    onForestLowerClick(warehouse);
}

function changeWarehouseResource(warehouse, newTypeId) {
    if (warehouse.amount > 0) {
        if (!confirm('Внимание! На складе есть запасы. При смене типа хранения они удалятся безвозвратно. Продолжить?')) {
            return;
        }
    }
    warehouse.storedType = newTypeId;
    warehouse.amount = 0;
    renderForestScreen(state.currentForestLoc);
    onForestLowerClick(warehouse);
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ
// ============================================================
function addBtn(container, label, onClick, enabled) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = label;
    btn.disabled = !enabled;
    btn.addEventListener('click', onClick);
    container.appendChild(btn);
}

function closeActionPanel() {
    document.getElementById('action-panel').classList.remove('open');
    state.selectedLoc = null;
    state.selectedForestTile = null;
}

// ============================================================
// ЗАПУСК / ЗАВЕРШЕНИЕ
// ============================================================
function startMission() {
    document.getElementById('briefing').classList.remove('active');
    document.getElementById('map-screen').classList.add('active');
    initState();
}

function checkTask(id) {
    if (state.tasks[id] === false) {
        state.tasks[id] = true;
        renderCurrentTask();
        const allDone = CONFIG.tasks.every(t => state.tasks[t.id]);
        if (allDone) endGame(true, 'Победа! Все задачи миссии выполнены. Дремучие леса освоены!');
    }
}

function endGame(isVictory, message) {
    state.gameOver = true;
    if (state.patriotTimer) { clearInterval(state.patriotTimer); state.patriotTimer = null; }
    if (state.extractionTimer) { clearInterval(state.extractionTimer); state.extractionTimer = null; }

    const modal = document.getElementById('modal');
    document.getElementById('modal-title').textContent = isVictory ? 'Победа!' : 'Поражение';
    document.getElementById('modal-text').textContent = message;

    const btn = document.getElementById('modal-btn');
    btn.textContent = isVictory ? 'Отлично' : 'Начать заново';
    btn.onclick = () => {
        modal.classList.remove('open');
        if (state.currentForestLoc) backToGlobalMap();
        document.getElementById('map-screen').classList.remove('active');
        document.getElementById('briefing').classList.add('active');
        if (!isVictory) {
            // Полный сброс перед новой попыткой
            initState();
        }
    };

    modal.classList.add('open');
}

// ============================================================
// НАВЕШИВАНИЕ ОБРАБОТЧИКОВ
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-start').addEventListener('click', startMission);
    document.getElementById('btn-back-to-map').addEventListener('click', backToGlobalMap);
    document.getElementById('btn-cancel-action').addEventListener('click', closeActionPanel);
});
