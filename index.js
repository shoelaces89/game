// ============================================================
// КОНФИГ И БАЗОВЫЕ КОНСТАНТЫ ИЗ ТЗ
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

    // ТЗ Константы по Лесу
    forest: {
        upperWidth: 6,
        upperHeight: 5,
        totalSquares: 30,
        resourceSquaresCount: 21,
        amountPerSquare: 75,
        warehouseCapacity: 100,
        unlockCostProvision: 1,
        extractionTimeMs: 5000, // 5 секунд из ТЗ
        warehouseCosts: [10, 12, 14, 16, 18, 20, 22] // Стоимость прогрессии
    },

    tasks: [
        { id: 'base', text: 'Построить базу' },
        { id: 'scout', text: 'Провести разведку местности' },
        { id: 'wood5', text: 'Добыть древесину в лесу ×5' },
        { id: 'berries5', text: 'Собрать лесные ягоды ×5' }
    ]
};

// Типы ресурсов лесного массива для распределения
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
    peasants: { total: 0 }, // При старте 0, база даст +5
    patriot: CONFIG.patriot.start,
    tasks: {},
    locations: [],
    selectedLoc: null,       // Глобальная выбранная локация
    selectedForestTile: null,// Выбранный лесной тайл (верхний или нижний)
    currentForestLoc: null,  // Ссылка на активный глобальный Лес
    gameOver: false,
    patriotTimer: null,
    extractionTimer: null    // Таймер добычи 5 сек
};

// ============================================================
// ГЕНЕРАЦИЯ ДАННЫХ ЛОКАЦИИ ЛЕСА (ТЗ СЕКЦИИ 3 и 7)
// ============================================================
function generateForestData() {
    const upperTiles = [];
    const lowerWarehouses = [];

    // Создаем пул ресурсов (21 ресурсный квадрат: 7 типов х 3 шт)
    const pool = [];
    FOREST_RES_TYPES.forEach(type => {
        for (let i = 0; i < 3; i++) {
            pool.push({ id: type.id, name: type.name, icon: type.icon });
        }
    });
    // Добиваем пустыми до 30
    while (pool.length < CONFIG.forest.totalSquares) {
        pool.push({ id: 'empty', name: 'Пустой квадрат леса', icon: '🌿' });
    }
    // Шаффл
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // Собираем верхнее поле 6х5
    for (let i = 0; i < CONFIG.forest.totalSquares; i++) {
        const col = i % CONFIG.forest.upperWidth;
        const row = Math.floor(i / CONFIG.forest.upperWidth);
        const resData = pool[i];

        upperTiles.push({
            index: i, col: col, row: row,
            id: resData.id, name: resData.name, icon: resData.icon,
            scouted: false,
            amount: resData.id !== 'empty' ? CONFIG.forest.amountPerSquare : 0,
            hasPeasant: false,
            depleted: false
        });
    }

    // Нижнее поле: 7 пустых слотов под склады
    for (let i = 0; i < 7; i++) {
        lowerWarehouses.push({
            index: i,
            built: false,
            storedType: 'none', // 'none' или id ресурса
            amount: 0
        });
    }

    // Открываем самый первый ряд/левый угол как стартовую точку для снятия тумана войны
    upperTiles[0].scouted = true;

    return { upperTiles, lowerWarehouses };
}

function generateMap() {
    const cols = CONFIG.map.cols;
    const rows = CONFIG.map.rows;
    const total = cols * rows;
    const locs = [];
    const baseIndex = (rows - 1) * cols + 0; // Левый нижний угол карты

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
            index: i, col: col, row: row, id: id, name: name, icon: icon,
            owner: i === baseIndex ? 'player' : 'none',
            scouted: i === baseIndex,
            baseBuilt: false,
            forestData: id === 'forest' ? generateForestData() : null
        });
    }
    return locs;
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ И СЧЕТ КРЕСТЬЯН (ТЗ СЕКЦИЯ 6)
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

    CONFIG.tasks.forEach(t => state.tasks[t.id] = false);

    state.locations = generateMap();

    if (state.patriotTimer) clearInterval(state.patriotTimer);
    state.patriotTimer = setInterval(gameTick, CONFIG.patriot.tickMs);

    if (state.extractionTimer) clearInterval(state.extractionTimer);
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

// ТЗ Секция 5.2 - 5.5 Автоматическая добыча раз в 5 сек
function forestExtractionTick() {
    if (state.gameOver) return;

    let updateRequired = false;

    state.locations.forEach(loc => {
        if (loc.id === 'forest' && loc.owner === 'player' && loc.forestData) {
            loc.forestData.upperTiles.forEach(tile => {
                if (tile.hasPeasant && tile.amount > 0 && !tile.depleted) {
                    // Ищем склад, принимающий данный ресурс
                    const warehouse = loc.forestData.lowerWarehouses.find(w => w.built && w.storedType === tile.id && w.amount < CONFIG.forest.warehouseCapacity);

                    if (warehouse) {
                        tile.amount--;
                        warehouse.amount++;
                        updateRequired = true;

                        // Проверка выполнения квестов по накоплению на складах леса
                        if (tile.id === 'wood' && warehouse.amount >= 5) checkTask('wood5');
                        if (tile.id === 'berries' && warehouse.amount >= 5) checkTask('berries5');

                        // Истощение жилы (Секция 5.5)
                        if (tile.amount <= 0) {
                            tile.amount = 0;
                            tile.hasPeasant = false;
                            tile.depleted = true;
                            tile.id = 'empty';
                            tile.name = 'Отработанный пустой квадрат';
                            tile.icon = '⬜';
                        }
                    }
                    // Если склад заполнен, крестьянин просто ждет (добыча на паузе)
                }
            });
        }
    });

    if (updateRequired) {
        renderResources();
        if (state.currentForestLoc) {
            renderForestScreen(state.currentForestLoc);
            if (state.selectedForestTile) {
                // Обновляем открытую панель действий, чтобы видеть цифры в реалтайме
                refreshForestActionPanel();
            }
        }
    }
}

// ============================================================
// РЕНДЕР ХУДА И КАРТЫ
// ============================================================
function renderResources() {
    document.getElementById('r-food').textContent = state.resources.food;
    document.getElementById('r-wood').textContent = state.resources.wood;
    document.getElementById('r-gold').textContent = state.resources.gold;
    document.getElementById('r-peasants').textContent = getFreePeasantsCount() + ' / ' + state.peasants.total;
    document.getElementById('r-patriot').textContent = state.patriot;
    document.getElementById('patriot-fill').style.width = (state.patriot / CONFIG.patriot.max * 100) + '%';
}
function renderCurrentTask() {
    const current = CONFIG.tasks.find(t => !state.tasks[t.id]);
    document.getElementById('task-text').textContent = current ? '📜 ' + current.text : '✅ Все задачи выполнены';
}
function renderMap() {
    const grid = document.getElementById('map-grid');
    grid.innerHTML = '';
    const sorted = state.locations.slice().sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col);
    sorted.forEach(loc => {
        const div = document.createElement('div');
        div.className = 'loc';
        if (!loc.scouted && loc.owner !== 'player') div.classList.add('fog');
        if (loc.owner === 'player') div.classList.add('player');
        if (loc.owner !== 'player' && !loc.scouted && !isAdjacentToPlayer(loc)) div.classList.add('locked');
        const showInfo = loc.scouted || loc.owner === 'player';
        let statusText = 'туман войны';
        if (loc.owner === 'player') {
            statusText = (loc.id === 'base' && !loc.baseBuilt) ? 'требует постройки' : 'под контролем';
        } else if (loc.scouted) {
            statusText = 'разведано';
        } else if (!isAdjacentToPlayer(loc)) {
            statusText = 'далеко';
        }
        div.innerHTML = <div class="loc-icon">${showInfo ? loc.icon : '❓'}</div> <div class="loc-name">${showInfo ? loc.name : '???'}</div> <div class="loc-status">${statusText}</div>;
        div.onclick = () => onLocationClick(loc);
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
// ВЗАИМОДЕЙСТВИЕ: ГЛОБАЛЬНАЯ КАРТА & ТЗ ОКНО СКЛАДОВ
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
        addBtn(btns, '🔍 Разведка (1 🍞)', () => scoutLocation(loc), state.resources.food >= CONFIG.costs.scout.food);
    } else if (loc.id === 'base' && loc.owner === 'player' && !loc.baseBuilt) {
        desc.textContent = 'Оснуйте город, чтобы получить первых подданных.';
        addBtn(btns, '🏕️ Построить город (3 🍞, 2 🪵)', () => buildBase(loc), state.resources.food >= 3 && state.resources.wood >= 2);
    } else if (loc.owner === 'player') {
// ТЗ Секция 2.1 Контекстное меню со списком складов и кнопкой «Зайти»
        if (loc.id === 'forest') {
            let warehouseList = 'Построенные склады:\n';
            let builtAny = false;
            loc.forestData.lowerWarehouses.forEach((w, i) => {
                if (w.built) {
                    builtAny = true;
                    const resName = FOREST_RES_TYPES.find(r => r.id === w.storedType)?.name || 'Пусто';
                    warehouseList += • Слот ${i+1}: ${resName} (${w.amount} / ${CONFIG.forest.warehouseCapacity} ед.)\n;
                }
            });
            if (!builtAny) warehouseList += 'Склады отсутствуют.';
            desc.textContent = warehouseList;
            addBtn(btns, '🚪 Зайти в Лес', () => { closeActionPanel(); openForestScreen(loc); }, true);
        } else {
            desc.textContent = loc.id === 'field' ? 'Регион поставляет ресурсы на внешние рынки.' : 'Селение выплачивает регулярные подати.';
        }
    } else {
        desc.textContent = 'Земля разведана. Присоедините её к своим владениям.';
        addBtn(btns, '🚩 Присоединить мирно', () => { loc.owner = 'player'; closeActionPanel(); renderMap(); }, true);
    }
    document.getElementById('action-panel').classList.add('open');
}
function scoutLocation(loc) {
    if (state.resources.food >= CONFIG.costs.scout.food) {
        state.resources.food -= CONFIG.costs.scout.food;
        loc.scouted = true;
        checkTask('scout');
        closeActionPanel();
        renderResources();
        renderMap();
    }
}
function buildBase(loc) {
    if (state.resources.food >= 3 && state.resources.wood >= 2) {
        state.resources.food -= 3;
        state.resources.wood -= 2;
        loc.baseBuilt = true;
        state.peasants.total += 5; // ТЗ Секция 6: Город дает 5 крестьян
        checkTask('base');
        closeActionPanel();
        renderResources();
        renderMap();
    }
}
// ============================================================
// ВНУТРЕННИЙ ЭКРАН ЛЕСА
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
// Верхнее поле (Добыча 6х5)
    const upperGrid = document.getElementById('submap-grid-upper');
    upperGrid.innerHTML = '';
    loc.forestData.upperTiles.forEach(tile => {
        const div = document.createElement('div');
        div.className = 'forest-tile';
        if (!tile.scouted) {
            div.classList.add('upper-fog');
            div.innerHTML = '❓';
// Проверяем ТЗ: Открывать можно только соседние с уже открытыми
            if (isAdjacentInForest(tile, loc.forestData.upperTiles)) {
                div.onclick = () => onForestUpperClick(tile);
            } else {
                div.classList.add('locked');
            }
        } else {
            if (tile.depleted || tile.id === 'empty') {
                div.classList.add('upper-empty');
                div.innerHTML = <span class="tile-icon">${tile.icon}</span>;
            } else {
                div.classList.add(tile.hasPeasant ? 'upper-working' : 'upper-resource');
                div.innerHTML = <span class="tile-icon">${tile.icon}</span> <span class="tile-badge">${tile.hasPeasant ? '👨‍🌾 ' : ''}${tile.amount}</span>;
            }
            div.onclick = () => onForestUpperClick(tile);
        }
        upperGrid.appendChild(div);
    });
// Нижнее поле (Склады 1х7)
    const lowerGrid = document.getElementById('submap-grid-lower');
    lowerGrid.innerHTML = '';
    loc.forestData.lowerWarehouses.forEach(w => {
        const div = document.createElement('div');
        div.className = 'forest-tile';
        if (!w.built) {
            div.classList.add('lower-empty');
            div.innerHTML = '➕';
        } else {
            div.classList.add('lower-warehouse');
            const resDef = FOREST_RES_TYPES.find(r => r.id === w.storedType);
            div.innerHTML = <span class="tile-icon">🏠</span> <span class="tile-badge">${resDef ? resDef.icon : '⬜'}:${w.amount}</span>;
        }
        div.onclick = () => onForestLowerClick(w);
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
// КЛИКИ ПО ЛЕСНЫМ ТАЙЛАМ & ЛОГИКА ДЕЙСТВИЙ (ТЗ СЕКЦИИ 4 и 5)
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
    const type = state.selectedForestTile.type;
    const item = state.selectedForestTile.data;
    const btns = document.getElementById('action-buttons');
    const title = document.getElementById('action-title');
    const desc = document.getElementById('action-desc');
    btns.innerHTML = '';
    const panel = document.getElementById('action-panel');
    if (type === 'upper') {
        if (!item.scouted) {
            title.textContent = 'Густая лесная чаща';
            desc.textContent = Квадрат скрыт ветвями. Прорубить тропу к ресурсам?\nСтоимость: ${CONFIG.forest.unlockCostProvision} Еда.;
            addBtn(btns, '🪓 Прорубить просеку', () => unlockForestSquare(item), state.resources.food >= CONFIG.forest.unlockCostProvision);
        } else {
            title.textContent = item.name;
            if (item.id === 'empty') {
                desc.textContent = 'Здесь нет ничего ценного, обычная поляна.';
            } else {
                desc.textContent = Осталось запасов: ${item.amount} единиц.\nКрестьян занято: ${item.hasPeasant ? '1' : '0'}.;
                if (!item.hasPeasant) {
                    const hasFree = getFreePeasantsCount() > 0;
                    addBtn(btns, '👨‍🌾 Отправить добывать', () => togglePeasantOnSquare(item, true), hasFree);
                } else {
                    addBtn(btns, '🛑 Отозвать крестьянина', () => togglePeasantOnSquare(item, false), true);
                }
            }
        }
    } else if (type === 'lower') {
        const currentCount = state.currentForestLoc.forestData.lowerWarehouses.filter(w => w.built).length;
        if (!item.built) {
            const cost = CONFIG.forest.warehouseCosts[currentCount] || 22;
            title.textContent = 'Пустой слот под склад';
            desc.textContent = Построить лесной склад для координации логов? Стоимость: ${cost} Древесина.;
            addBtn(btns, 🪵 Построить склад (${cost} ед.), () => buildForestWarehouse(item, cost), state.resources.wood >= cost);
        } else {
            title.textContent = 'Лесной Склад';
            const resDef = FOREST_RES_TYPES.find(r => r.id === item.storedType);
            desc.textContent = Тип хранения: ${resDef ? resDef.name : 'Пусто'}.\nЗаполнено: ${item.amount} / ${CONFIG.forest.warehouseCapacity} ед.;
// Кнопки смены ресурса (Секция 4.1-4.2)
            FOREST_RES_TYPES.forEach(res => {
                if (item.storedType !== res.id) {
                    addBtn(btns, 📦 Хранить ${res.icon} ${res.name}, () => changeWarehouseResource(item, res.id), true);
                }
            });
            if (item.storedType !== 'none') {
                addBtn(btns, '🗑️ Сбросить фильтр склада', () => changeWarehouseResource(item, 'none'), true);
            }
        }
    }
    panel.classList.add('open');
}
// Пошаговое открытие сетки (Секция 3.2)
function unlockForestSquare(tile) {
    if (state.resources.food >= CONFIG.forest.unlockCostProvision) {
        state.resources.food -= CONFIG.forest.unlockCostProvision;
        tile.scouted = true;
        renderResources();
        renderForestScreen(state.currentForestLoc);
        onForestUpperClick(tile);
    }
}
// Назначение рабочих (Секция 5.1 / 6)
function togglePeasantOnSquare(tile, activate) {
    if (activate) {
        if (getFreePeasantsCount() > 0) {
            tile.hasPeasant = true;
        }
    } else {
        tile.hasPeasant = false;
    }
    renderResources();
    renderForestScreen(state.currentForestLoc);
    onForestUpperClick(tile);
}
// Постройка склада по прогрессивной шкале (Секция 4.1)
function buildForestWarehouse(warehouse, cost) {
    if (state.resources.wood >= cost) {
        state.resources.wood -= cost;
        warehouse.built = true;
        warehouse.storedType = 'none';
        warehouse.amount = 0;
        renderResources();
        renderForestScreen(state.currentForestLoc);
        onForestLowerClick(warehouse);
    }
}
// Смена ресурса со штрафом или бесплатно (Секция 4.2)
function changeWarehouseResource(warehouse, newTypeId) {
    if (warehouse.amount > 0) {
        if (!confirm('Внимание! На складе есть запасы. При смене типа хранения они удалятся безвозвратно. Продолжить?')) {
            return;
        }
    }
    warehouse.storedType = newTypeId;
    warehouse.amount = 0; // Полный сброс ресурсов
    renderForestScreen(state.currentForestLoc);
    onForestLowerClick(warehouse);
}
// ============================================================
// СИСТЕМНЫЕ КНОПКИ И ВСПОМОГАТЕЛЬНЫЙ КОД
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
function closeActionPanel() {
    document.getElementById('action-panel').classList.remove('open');
    state.selectedLoc = null;
    state.selectedForestTile = null;
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
    if (state.patriotTimer) clearInterval(state.patriotTimer);
    if (state.extractionTimer) clearInterval(state.extractionTimer);
    const modal = document.getElementById('modal');
    document.getElementById('modal-title').textContent = isVictory ? 'Победа!' : 'Поражение';
    document.getElementById('modal-text').textContent = message;
    const btn = document.getElementById('modal-btn');
    btn.textContent = isVictory ? 'Отлично' : 'Начать заново';
    btn.onclick = () => {
        modal.classList.remove('open');
        if (!isVictory) {
            if (state.currentForestLoc) backToGlobalMap();
            document.getElementById('map-screen').classList.remove('active');
            document.getElementById('briefing').classList.add('active');
        }
    };
    modal.classList.add('open');
}
