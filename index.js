'use strict';

// ============================================================
// КОНФИГ И БАЗОВЫЕ КОНСТАНТЫ
// ============================================================
const CONFIG = {
    map: { cols: 4, rows: 5 },

    // Стартовые ресурсы (док. «Город», п.5.1)
    startingResources: {
        wood: 10,
        provant: 20,
        peasants: 5
    },

    // Провиант
    provant: {
        // стартовый запас — часть resources.provant; тратится первым
        // рожь из амбаров — заглушка, поле не реализовано
        startingSupply: 20
    },

    // Стоимость разведки по кругу (док. «Общие», п.3.1)
    scoutCostByRing: [1, 2, 3, 4, 5, 6, 7, 8],

    // Разное
    peasantCapacityPerSquare: 1,
    peasantExtractionMs: 5000,

    // Город
    city: {
        stockadeCostWood: 150,
        missionTimeLimitSec: 600
    },

    // Лес (док. «Лес»)
    forest: {
        upperWidth: 6,
        upperHeight: 5,
        upperTotal: 30,
        resourceSquares: 3,          // 3 квадрата с древесиной
        amountPerSquare: 75,
        unlockCostProvant: 1,
        warehouseCapacity: 100,
        warehouseCosts: [10, 12, 14, 16, 18, 20, 22],
        extractionTimeMs: 5000
    },

    // Спец-параметры
    paternalismStart: 50,
    passionarityStart: 50,

    // Задания (док. «Город», п.6)
    tasks: [
        { id: 'buildBase',     text: 'Построить базу' },
        { id: 'avoidHunger',   text: 'Избежать голода (амбар ржи ×100)' },
        { id: 'buildStockade', text: 'Построить частокол (150 🪵)' }
    ]
};

// Ресурсы, которые можно хранить в лесу (док. «Лес», п.4.1 — «Пусто» или «древесина»)
const FOREST_RES_TYPES = [
    { id: 'wood', name: 'Древесина', icon: '🪵' }
];

// ============================================================
// ИГРОВОЕ СОСТОЯНИЕ
// ============================================================
const state = {
    resources: {
        provant: 0,        // стартовый запас (тратится первым)
        wood: 0,           // суммарно по складам (для HUD)
        peasantsTotal: 0
    },
    paternalism: 50,
    passionarity: 50,
    tasks: {},
    locations: [],
    selectedLoc: null,
    selectedForestTile: null,
    currentForestLoc: null,
    currentCityLoc: null,
    gameOver: false,
    missionStarted: false,
    missionTimeLeft: 0,

    // Таймеры
    patriotTimer: null,      // общий тик (патернализм/провиант)
    extractionTimer: null,   // добыча в лесу
    missionTimer: null,      // таймер миссии

    // Заглушки под поле/амбары — появятся в следующем этапе
    barns: { rye: 0 }
};

// ============================================================
// ГЕНЕРАЦИЯ ДАННЫХ
// ============================================================
function generateForestData() {
    const tiles = [];
    const warehouses = [];

    // Верхнее поле 6x5 = 30. Нижний ряд (row = 4) открыт сразу.
    // Гарантированно первый открытый квадрат с ресурсом.
    // Раскладка: 3 квадрата с древесиной по 75, остальные — пустые.
    const resourceIndices = pickRandomDistinct(
        // кандидаты — не угловые/любые, но для гарантии ставим в нижний ряд
        // и ещё два в другие ряды
        buildResourceCandidates(CONFIG.forest.upperWidth, CONFIG.forest.upperHeight),
        CONFIG.forest.resourceSquares
    );

    // Гарантия: первый открытый квадрат (нижний ряд, col=0) — древесина.
    // Если его нет в списке — заменяем первый элемент.
    const guaranteedIndex = (CONFIG.forest.upperHeight - 1) * CONFIG.forest.upperWidth + 0;
    if (!resourceIndices.includes(guaranteedIndex)) {
        resourceIndices[0] = guaranteedIndex;
    }

    for (let i = 0; i < CONFIG.forest.upperTotal; i++) {
        const col = i % CONFIG.forest.upperWidth;
        const row = Math.floor(i / CONFIG.forest.upperWidth);
        const isResource = resourceIndices.includes(i);
        const isBottomRow = row === CONFIG.forest.upperHeight - 1;

        tiles.push({
            index: i, col, row,
            scouted: isBottomRow,
            id: isResource ? 'wood' : 'empty',
            name: isResource ? 'Древесина' : 'Пустой квадрат леса',
            icon: isResource ? '🪵' : '🌿',
            amount: isResource ? CONFIG.forest.amountPerSquare : 0,
            hasPeasant: false,
            depleted: false
        });
    }

    for (let i = 0; i < 7; i++) {
        warehouses.push({
            index: i,
            built: false,
            storedType: 'none',
            amount: 0
        });
    }

    return { upperTiles: tiles, lowerWarehouses: warehouses };
}

function buildResourceCandidates(width, height) {
    // Все индексы верхнего поля
    const arr = [];
    for (let i = 0; i < width * height; i++) arr.push(i);
    return arr;
}

function pickRandomDistinct(pool, count) {
    const copy = pool.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
}

function generateMap() {
    const cols = CONFIG.map.cols;
    const rows = CONFIG.map.rows;
    const total = cols * rows;
    const locs = [];

    // Город — нижний левый угол
    const cityIndex = (rows - 1) * cols + 0;
    // Лес — рядом с городом (соседний по ребру)
    const forestIndex = cityIndex - 1; // (rows-1)*cols - 1, если col 0 -> берём индекс выше
    // Поле — тоже рядом
    const fieldIndex = cityIndex - cols;

    // Гарантированные типы: city, forest, field, остальное — случайно
    const types = new Array(total).fill(null);
    types[cityIndex] = 'city';
    types[forestIndex] = 'forest';
    types[fieldIndex] = 'field';

    const pool = ['field', 'forest', 'village', 'empty', 'village', 'empty'];
    for (let i = 0; i < total; i++) {
        if (types[i]) continue;
        types[i] = pool[Math.floor(Math.random() * pool.length)];
    }

    for (let i = 0; i < total; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const typeId = types[i];

        let def = LOCATION_DEF(typeId);
        locs.push({
            index: i, col, row,
            id: typeId,
            name: def.name,
            icon: def.icon,
            owner: i === cityIndex ? 'player' : 'none',
            scouted: i === cityIndex,
            baseBuilt: false,
            stockadeBuilt: false,
            activeConstruction: null,
            forestData: typeId === 'forest' ? generateForestData() : null
        });
    }
    return locs;
}

function LOCATION_DEF(id) {
    switch (id) {
        case 'city':    return { name: 'Разрушенный город', icon: '🏚️' };
        case 'forest':  return { name: 'Лес', icon: '🌲' };
        case 'field':   return { name: 'Поле', icon: '🌾' };
        case 'village': return { name: 'Село', icon: '🏘️' };
        default:        return { name: 'Пустошь', icon: '⬜' };
    }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
function initState() {
    stopAllTimers();

    state.resources = { provant: 0, wood: 0, peasantsTotal: 0 };
    state.paternalism = CONFIG.paternalismStart;
    state.passionarity = CONFIG.passionarityStart;
    state.tasks = {};
    CONFIG.tasks.forEach(t => state.tasks[t.id] = false);

    state.locations = generateMap();
    state.selectedLoc = null;
    state.selectedForestTile = null;
    state.currentForestLoc = null;
    state.currentCityLoc = null;
    state.gameOver = false;
    state.missionStarted = false;
    state.missionTimeLeft = 0;
    state.barns = { rye: 0 };

    renderResources();
    renderMap();
    renderCurrentTask();
    hideNotifications();
    closeActionPanel();
    closeModal();
}

function stopAllTimers() {
    if (state.patriotTimer) { clearInterval(state.patriotTimer); state.patriotTimer = null; }
    if (state.extractionTimer) { clearInterval(state.extractionTimer); state.extractionTimer = null; }
    if (state.missionTimer) { clearInterval(state.missionTimer); state.missionTimer = null; }
}

function startTimers() {
    if (state.patriotTimer) clearInterval(state.patriotTimer);
    state.patriotTimer = setInterval(gameTick, 10000);

    if (state.extractionTimer) clearInterval(state.extractionTimer);
    state.extractionTimer = setInterval(forestExtractionTick, CONFIG.forest.extractionTimeMs);

    if (state.missionTimer) clearInterval(state.missionTimer);
    state.missionTimer = setInterval(missionTick, 1000);
}

function startMission() {
    document.getElementById('briefing').classList.remove('active');
    document.getElementById('map-screen').classList.add('active');
    initState();
}

// ============================================================
// ТИКИ
// ============================================================
function gameTick() {
    if (state.gameOver) return;

    // Патернализм медленно снижается, если есть провиант/амбары — тратим
    if (state.paternalism > 0) {
        state.paternalism = Math.max(0, state.paternalism - 1);
    }
    renderResources();
}

function missionTick() {
    if (state.gameOver || !state.missionStarted) return;
    state.missionTimeLeft -= 1;

    if (state.missionTimeLeft <= 0) {
        state.missionTimeLeft = 0;
        renderTimer();
        const hungerDone = state.tasks.avoidHunger;
        const stockadeDone = state.tasks.buildStockade;

        if (!hungerDone && !stockadeDone) {
            endGame(false,
                'Ты не оправдал возложенных на тебя ожиданий. Крестьяне взбунтовались ' +
                'и привели тебя к князю. Вскоре ты умер в темнице.');
        } else if (!stockadeDone) {
            endGame(false,
                'Ты слишком затянул с постройкой частокола, князь недоволен, ' +
                'люди недовольны твоим отношением. Тебе придётся уйти.');
        } else if (!hungerDone) {
            endGame(false,
                'Ты не смог убедить крестьян, что им не грозит голодная смерть. ' +
                'Отчаявшаяся толпа подняла бунт и тебя на вилы.');
        }
        return;
    }
    renderTimer();
}

function forestExtractionTick() {
    if (state.gameOver) return;

    let needRender = false;

    state.locations.forEach(loc => {
        if (loc.id !== 'forest' || loc.owner !== 'player' || !loc.forestData) return;

        loc.forestData.upperTiles.forEach(tile => {
            if (!tile.hasPeasant || tile.depleted || tile.id === 'empty' || tile.amount <= 0) return;

            // Ищем склад этого ресурса со свободным местом
            const warehouse = loc.forestData.lowerWarehouses.find(
                w => w.built && w.storedType === tile.id && w.amount < CONFIG.forest.warehouseCapacity
            );

            // Нет склада — пауза, крестьянин ждёт
            if (!warehouse) return;

            tile.amount -= 1;
            warehouse.amount += 1;
            needRender = true;

            if (tile.amount <= 0) {
                tile.amount = 0;
                tile.hasPeasant = false;
                tile.depleted = true;
                tile.id = 'empty';
                tile.name = 'Пустой квадрат леса';
                tile.icon = '🌿';
            }
        });
    });

    if (needRender) {
        renderResources();                 // суммарная древесина в HUD
        if (state.currentForestLoc) {
            renderForestScreen(state.currentForestLoc);
            if (state.selectedForestTile) refreshForestActionPanel();
        }
    }
}

// ============================================================
// РЕНДЕР HUD
// ============================================================
function renderResources() {
    const woodTotal = getWoodTotal();

    document.getElementById('r-provant').textContent = state.resources.provant;
    document.getElementById('r-wood').textContent = woodTotal;
    document.getElementById('r-peasants').textContent =
        getFreePeasants() + ' / ' + state.resources.peasantsTotal;

    document.getElementById('r-paternalism').textContent = state.paternalism;
    document.getElementById('r-passionarity').textContent = state.passionarity;

    const bar = document.getElementById('paternalism-bar');
    const fill = document.getElementById('paternalism-fill');
    if (bar && fill) {
        fill.style.width = state.paternalism + '%';
        bar.setAttribute('aria-valuenow', state.paternalism);
    }

    renderTimer();
}

function renderTimer() {
    const el = document.getElementById('r-timer');
    if (!el) return;
    if (!state.missionStarted) {
        el.textContent = '--:--';
        return;
    }
    const t = Math.max(0, state.missionTimeLeft);
    const m = Math.floor(t / 60);
    const s = t % 60;
    el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function renderCurrentTask() {
    const current = CONFIG.tasks.find(t => !state.tasks[t.id]);
    const el = document.getElementById('task-text');
    if (el) el.textContent = current ? '📜 ' + current.text : '✅ Все задачи выполнены';
}

// ============================================================
// РЕНДЕР КАРТЫ
// ============================================================
function renderMap() {
    const grid = document.getElementById('map-grid');
    if (!grid) return;
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
        if (loc.id === 'city') div.classList.add('city');
        if (loc.owner !== 'player' && !loc.scouted && !isAdj) div.classList.add('locked');

        let statusText = 'туман войны';
        if (loc.owner === 'player') {
            if (loc.id === 'city') {
                statusText = loc.baseBuilt ? 'под контролем' : 'требует постройки';
            } else {
                statusText = 'под контролем';
            }
        } else if (loc.scouted) {
            statusText = 'разведано';
        } else if (!isAdj) {
            statusText = 'далеко';
        }

        let badge = '';
        if (loc.id === 'city' && loc.activeConstruction === 'stockade') {
            const cost = CONFIG.city.stockadeCostWood;
            const have = getCityStockadeCollected(loc);
            badge = `<div class="loc-construction-badge">🪵 Древесина: ${have}/${cost}</div>`;
        }

        div.innerHTML = `
            ${badge}
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

// Круг от города (для разведки)
function getRingFromCity(loc) {
    const city = state.locations.find(l => l.id === 'city');
    if (!city) return 1;
    // Манхэттен по сетке — аналог «круга» на графе
    return Math.abs(loc.col - city.col) + Math.abs(loc.row - city.row);
}

function getScoutCostForLoc(loc) {
    const ring = Math.max(1, getRingFromCity(loc));
    const arr = CONFIG.scoutCostByRing;
    return arr[Math.min(ring - 1, arr.length - 1)];
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

    const showInfo = loc.scouted || loc.owner === 'player';
    title.textContent = showInfo ? loc.name : 'Неизвестная территория';

    if (!loc.scouted && loc.owner !== 'player') {
        const cost = getScoutCostForLoc(loc);
        desc.textContent =
            `Локация скрыта туманом войны.\nСтоимость разведки: ${cost} 🍞 (круг ${getRingFromCity(loc)}).`;
        addBtn(btns, `🔍 Разведать (${cost} 🍞)`, () => scoutLocation(loc),
            state.resources.provant >= cost);
    } else if (loc.owner !== 'player' && loc.scouted) {
        desc.textContent = 'Земля разведана. Присоедините её к своим владениям.';
        addBtn(btns, '🚩 Присоединить мирно', () => {
            loc.owner = 'player';
            closeActionPanel();
            renderMap();
        }, true);
    } else if (loc.id === 'city') {
        desc.textContent = cityDescription(loc);
        addBtn(btns, '🚪 Зайти в город', () => {
            closeActionPanel();
            openCityScreen(loc);
        }, true);
    } else if (loc.id === 'forest') {
        desc.textContent = forestDescription(loc);
        addBtn(btns, '🚪 Зайти в лес', () => {
            closeActionPanel();
            openForestScreen(loc);
        }, true);
    } else {
        desc.textContent = 'Тихая земля. Пока здесь нечего делать.';
    }

    document.getElementById('action-panel').classList.add('open');
}

function cityDescription(loc) {
    if (!loc.baseBuilt) return 'Город разрушен. Постройте базу, чтобы получить подданных.';
    let s = 'Город под контролем.\n';
    if (loc.activeConstruction === 'stockade') {
        s += `Идёт стройка: Частокол (${getCityStockadeCollected(loc)}/${CONFIG.city.stockadeCostWood} 🪵).`;
    } else if (loc.stockadeBuilt) {
        s += 'Частокол построен. Город защищён.';
    } else {
        s += 'Частокол не начат.';
    }
    return s;
}

function forestDescription(loc) {
    let s = 'Лес под контролем.\n';
    let builtAny = false;
    loc.forestData.lowerWarehouses.forEach((w, i) => {
        if (w.built) {
            builtAny = true;
            const resName = FOREST_RES_TYPES.find(r => r.id === w.storedType)?.name || 'Пусто';
            s += `• Слот ${i + 1}: ${resName} (${w.amount}/${CONFIG.forest.warehouseCapacity})\n`;
        }
    });
    if (!builtAny) s += 'Склады отсутствуют.';
    return s;
}

function scoutLocation(loc) {
    const cost = getScoutCostForLoc(loc);
    if (state.resources.provant < cost) return;
    state.resources.provant -= cost;
    loc.scouted = true;

    notify(`Разведано: ${loc.name}`, 'success');
    closeActionPanel();
    renderResources();
    renderMap();
}

// ============================================================
// ПОСТРОЙКА БАЗЫ (док. «Город», п.4)
// ============================================================
function buildBase(loc) {
    if (loc.baseBuilt) return;
    loc.baseBuilt = true;
    loc.name = 'Город';
    loc.icon = '🏘️';

    // Стартовые ресурсы
    state.resources.provant += CONFIG.startingResources.provant;
    state.resources.wood += CONFIG.startingResources.wood;
    state.resources.peasantsTotal += CONFIG.startingResources.peasants;

    // Запуск миссии
    state.missionStarted = true;
    state.missionTimeLeft = CONFIG.city.missionTimeLimitSec;
    startTimers();

    // Задание «Построить базу» выполнено
    state.tasks.buildBase = true;
    renderCurrentTask();

    notify('Вы получили стартовый запас: 20 провианта, 10 древесины, 5 крестьян', 'success', 4000);

    closeActionPanel();
    renderResources();
    renderMap();
    if (state.currentCityLoc === loc) renderCityScreen(loc);
}

// ============================================================
// ЭКРАН ГОРОДА
// ============================================================
function openCityScreen(loc) {
    state.currentCityLoc = loc;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('city-screen').classList.add('active');
    renderCityScreen(loc);
}

function renderCityScreen(loc) {
    if (!loc) return;
    document.getElementById('city-title').textContent = loc.baseBuilt ? 'Город' : 'Разрушенный город';

    // Центральное здание
    const building = document.getElementById('city-building');
    const bIcon = building.querySelector('.city-building-icon');
    const bLabel = building.querySelector('.city-building-label');
    building.classList.toggle('ruined', !loc.baseBuilt);
    building.classList.toggle('built', loc.baseBuilt);
    bIcon.textContent = loc.baseBuilt ? '🏛️' : '🏚️';
    bLabel.textContent = loc.baseBuilt ? 'Центральное здание' : 'Разрушенное здание';

    // Зона частокола
    const stockade = document.getElementById('city-stockade-zone');
    stockade.classList.toggle('built', !!loc.stockadeBuilt);
    const sIcon = stockade.querySelector('.city-stockade-icon');
    const sLabel = stockade.querySelector('.city-stockade-label');
    sIcon.textContent = loc.stockadeBuilt ? '🛡️' : '🪵';
    if (loc.stockadeBuilt) {
        sLabel.textContent = 'Частокол построен';
    } else if (loc.activeConstruction === 'stockade') {
        sLabel.textContent =
            `Частокол: ${getCityStockadeCollected(loc)}/${CONFIG.city.stockadeCostWood} 🪵`;
    } else {
        sLabel.textContent = 'Место под частокол';
    }

    // Список строек
    const list = document.getElementById('city-construction-list');
    list.innerHTML = '';
    if (loc.baseBuilt) {
        const item = document.createElement('div');
        item.className = 'construction-item';
        const isActive = loc.activeConstruction === 'stockade';
        const isDone = loc.stockadeBuilt;
        if (isActive) item.classList.add('active');
        if (isDone) item.classList.add('disabled');

        item.innerHTML = `
            <span class="ci-name">${isDone ? '🛡️ Частокол' : (isActive ? '⏳ Частокол (в процессе)' : '🪵 Частокол')}</span>
            <span class="ci-cost">${isDone ? 'готово' : CONFIG.city.stockadeCostWood + ' 🪵'}</span>
        `;
        item.addEventListener('click', () => {
            if (isDone || isActive) return;
            loc.activeConstruction = 'stockade';
            notify('Начата стройка: Частокол (150 🪵)', 'warn');
            renderCityScreen(loc);
            renderMap();
        });
        list.appendChild(item);

        if (!loc.stockadeBuilt && loc.activeConstruction !== 'stockade') {
            const hint = document.createElement('div');
            hint.className = 'construction-item disabled';
            hint.innerHTML = `<span class="ci-name">Выберите стройку</span><span class="ci-cost">нажмите на карточку</span>`;
            list.appendChild(hint);
        }
    } else {
        const hint = document.createElement('div');
        hint.className = 'construction-item disabled';
        hint.innerHTML = `<span class="ci-name">Сначала постройте базу</span>`;
        list.appendChild(hint);
    }

    // Панель заданий
    const ul = document.getElementById('city-tasks-list');
    ul.innerHTML = '';
    CONFIG.tasks.forEach(t => {
        if (t.id === 'buildBase' && state.tasks.buildBase) return; // скрываем выполненное базовое
        const done = state.tasks[t.id];
        const li = document.createElement('li');
        li.textContent = t.text;
        if (done) li.classList.add('done');
        ul.appendChild(li);
    });

    // Обработчики клика по зданию и частоколу
    building.onclick = () => onCentralBuildingClick(loc);
    stockade.onclick = () => onStockadeClick(loc);
}

function onCentralBuildingClick(loc) {
    if (!loc.baseBuilt) {
        // Строим базу моментально и бесплатно
        buildBase(loc);
        return;
    }
    // Диалог с заданиями
    openTaskDialog(loc);
}

function openTaskDialog(loc) {
    const activeTasks = CONFIG.tasks.filter(t => !state.tasks[t.id] && t.id !== 'buildBase');
    let listHtml = '';
    if (activeTasks.length === 0) {
        listHtml = '<p>Все задания выполнены. Город процветает.</p>';
    } else {
        listHtml = '<ul>';
        activeTasks.forEach(t => { listHtml += `<li>${t.text}</li>`; });
        listHtml += '</ul>';
    }

    openModal(
        'Воевода',
        `<p>Боярин, люди напуганы. Одни боятся голода, другие — набегов. ` +
        `Помоги им: наполни амбар и поставь частокол. Времени мало.</p>${listHtml}`,
        'Закрыть',
        () => closeModal()
    );
}

function onStockadeClick(loc) {
    if (!loc.baseBuilt) {
        notify('Сначала постройте базу', 'warn');
        return;
    }
    if (loc.stockadeBuilt) {
        notify('Частокол уже построен', 'success');
        return;
    }
    if (loc.activeConstruction !== 'stockade') {
        loc.activeConstruction = 'stockade';
        notify('Начата стройка: Частокол (150 🪵)', 'warn');
        renderCityScreen(loc);
        renderMap();
        return;
    }

    // Стройка активна — пытаемся достроить (если есть собранное)
    const have = getCityStockadeCollected(loc);
    if (have >= CONFIG.city.stockadeCostWood) {
        completeStockade(loc);
    } else {
        notify(`Нужно ещё ${CONFIG.city.stockadeCostWood - have} 🪵. Доставьте по маршруту.`, 'warn');
    }
}

function getCityStockadeCollected(loc) {
    // Заглушка: маршруты не реализованы (нет документа по Полю).
    // Пока считаем «собранным» только то, что явно передано.
    return loc.stockadeCollectedWood || 0;
}

function completeStockade(loc) {
    loc.stockadeBuilt = true;
    loc.activeConstruction = null;
    state.tasks.buildStockade = true;
    renderCurrentTask();
    renderCityScreen(loc);
    renderMap();
    notify('Частокол построен!', 'success');
    checkVictory();
}

// ============================================================
// ЭКРАН ЛЕСА
// ============================================================
function openForestScreen(loc) {
    state.currentForestLoc = loc;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('submap-screen').classList.add('active');
    renderForestScreen(loc);
}

function backToGlobalMap() {
    closeActionPanel();
    state.currentForestLoc = null;
    state.selectedForestTile = null;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('map-screen').classList.add('active');
    renderMap();
}

function renderForestScreen(loc) {
    if (!loc || !loc.forestData) return;

    // Верхнее поле
    const upper = document.getElementById('submap-grid-upper');
    upper.innerHTML = '';
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
        upper.appendChild(div);
    });

    // Нижнее поле
    const lower = document.getElementById('submap-grid-lower');
    lower.innerHTML = '';
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
        lower.appendChild(div);
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
    if (!state.selectedForestTile || !state.currentForestLoc) return;

    const { type, data: item } = state.selectedForestTile;
    const btns = document.getElementById('action-buttons');
    const title = document.getElementById('action-title');
    const desc = document.getElementById('action-desc');
    btns.innerHTML = '';

    if (type === 'upper') {
        if (!item.scouted) {
            title.textContent = 'Густая лесная чаща';
            desc.textContent =
                `Квадрат скрыт ветвями. Прорубить тропу к ресурсам?\n` +
                `Стоимость: ${CONFIG.forest.unlockCostProvant} 🍞 провианта.`;
            addBtn(btns, '🪓 Прорубить просеку',
                () => unlockForestSquare(item),
                state.resources.provant >= CONFIG.forest.unlockCostProvant);
        } else {
            title.textContent = item.name;
            if (item.id === 'empty' || item.depleted) {
                desc.textContent = 'Здесь нет ничего ценного, обычная поляна.';
            } else {
                const warehouse = state.currentForestLoc.forestData.lowerWarehouses.find(
                    w => w.built && w.storedType === item.id && w.amount < CONFIG.forest.warehouseCapacity
                );
                const hasWarehouse = !!warehouse;

                desc.textContent =
                    `Осталось запасов: ${item.amount} / ${CONFIG.forest.amountPerSquare} ед.\n` +
                    `Крестьян занято: ${item.hasPeasant ? '1' : '0'}.\n` +
                    (hasWarehouse
                        ? `Склад: ${warehouse.amount} / ${CONFIG.forest.warehouseCapacity} ед.`
                        : `⚠️ Нет склада под «${item.name}». Постройте в нижнем поле.`);

                if (!item.hasPeasant) {
                    const free = getFreePeasants() > 0;
                    addBtn(btns, '👨‍🌾 Отправить добывать',
                        () => togglePeasantOnSquare(item, true),
                        free && hasWarehouse);
                } else {
                    addBtn(btns, '🛑 Отозвать крестьянина',
                        () => togglePeasantOnSquare(item, false),
                        true);
                }
            }
        }
    } else if (type === 'lower') {
        const builtCount = state.currentForestLoc.forestData.lowerWarehouses.filter(w => w.built).length;

        if (!item.built) {
            const cost = CONFIG.forest.warehouseCosts[builtCount] || 22;
            const have = getForestWoodTotal(state.currentForestLoc);

            title.textContent = 'Пустой слот под склад';
            desc.textContent =
                `Построить лесной склад для координации добычи?\n` +
                `Стоимость: ${cost} 🪵.\n` +
                `В складах локации: ${have} 🪵.`;
            addBtn(btns, `🪵 Построить склад (${cost} 🪵)`,
                () => buildForestWarehouse(item, cost),
                have >= cost);
        } else {
            title.textContent = 'Лесной склад';
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
    if (state.resources.provant < CONFIG.forest.unlockCostProvant) return;
    state.resources.provant -= CONFIG.forest.unlockCostProvant;
    tile.scouted = true;
    renderResources();
    renderForestScreen(state.currentForestLoc);
    onForestUpperClick(tile);
}

function togglePeasantOnSquare(tile, activate) {
    if (activate) {
        if (getFreePeasants() <= 0) return;
        tile.hasPeasant = true;
    } else {
        tile.hasPeasant = false;
    }
    renderResources();
    renderForestScreen(state.currentForestLoc);
    onForestUpperClick(tile);
}

function buildForestWarehouse(warehouse, cost) {
    const loc = state.currentForestLoc;
    if (!loc) return;
    if (getForestWoodTotal(loc) < cost) return;

    spendForestWood(loc, cost);

    warehouse.built = true;
    warehouse.storedType = 'none';
    warehouse.amount = 0;

    renderResources();
    renderForestScreen(loc);
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
// РАБОТА С РЕСУРСАМИ ЛЕСА
// ============================================================
function getForestWoodTotal(loc) {
    if (!loc || !loc.forestData) return 0;
    let total = 0;
    loc.forestData.lowerWarehouses.forEach(w => {
        if (w.built && w.storedType === 'wood') total += w.amount;
    });
    return total;
}

function spendForestWood(loc, amount) {
    if (!loc || !loc.forestData) return false;
    let need = amount;

    // Списываем начиная с самого полного склада (док. «Лес», п.4.4)
    const warehouses = loc.forestData.lowerWarehouses
        .filter(w => w.built && w.storedType === 'wood' && w.amount > 0)
        .sort((a, b) => b.amount - a.amount);

    for (const w of warehouses) {
        if (need <= 0) break;
        const take = Math.min(w.amount, need);
        w.amount -= take;
        need -= take;
    }
    return need === 0;
}

function getWoodTotal() {
    // Суммарно по всем складам всех локаций (для HUD)
    let total = 0;
    state.locations.forEach(loc => {
        if (loc.forestData) total += getForestWoodTotal(loc);
    });
    return total;
}

// ============================================================
// КРЕСТЬЯНЕ
// ============================================================
function getAssignedPeasants() {
    let assigned = 0;
    state.locations.forEach(loc => {
        if (!loc.forestData) return;
        loc.forestData.upperTiles.forEach(tile => {
            if (tile.hasPeasant) assigned++;
        });
    });
    return assigned;
}

function getFreePeasants() {
    return Math.max(0, state.resources.peasantsTotal - getAssignedPeasants());
}

// ============================================================
// ЗАДАНИЯ И ПОБЕДА
// ============================================================
function checkVictory() {
    // Победа: оба задания выполнены (частокол + амбар)
    // Амбар — заглушка (поле не реализовано). Проверяем только частокол + базу.
    const hungerDone = state.tasks.avoidHunger;   // пока false — поле не реализовано
    const stockadeDone = state.tasks.buildStockade;

    if (stockadeDone && hungerDone) {
        endGame(true, 'Угроза голода миновала, частокол даёт защиту поселению.');
    }
    // Примечание: без реализации Поля победа недостижима — это ожидаемо.
}

// ============================================================
// УВЕДОМЛЕНИЯ
// ============================================================
function notify(message, kind = '', duration = 3000) {
    const box = document.getElementById('notifications');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'notification' + (kind ? ' ' + kind : '');
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.3s ease';
        setTimeout(() => el.remove(), 320);
    }, duration);
}

function hideNotifications() {
    const box = document.getElementById('notifications');
    if (box) box.innerHTML = '';
}

// ============================================================
// МОДАЛКА
// ============================================================
function openModal(title, htmlText, buttonLabel, onButton) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-text').innerHTML = htmlText;
    const btn = document.getElementById('modal-btn');
    btn.textContent = buttonLabel;
    btn.onclick = onButton;
    document.getElementById('modal').classList.add('open');
}

function closeModal() {
    document.getElementById('modal').classList.remove('open');
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
    const panel = document.getElementById('action-panel');
    if (panel) panel.classList.remove('open');
    state.selectedLoc = null;
    state.selectedForestTile = null;
}

// ============================================================
// ЗАВЕРШЕНИЕ ИГРЫ
// ============================================================
function endGame(isVictory, message) {
    state.gameOver = true;
    stopAllTimers();

    openModal(
        isVictory ? 'Победа!' : 'Поражение',
        `<p>${message}</p>`,
        isVictory ? 'Отлично' : 'Перезапустить',
        () => {
            closeModal();
            if (isVictory) {
                // возврат к брифингу
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.getElementById('briefing').classList.add('active');
            } else {
                // перезапуск миссии
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.getElementById('briefing').classList.add('active');
                initState();
            }
        }
    );
}

// ============================================================
// НАВЕШИВАНИЕ ОБРАБОТЧИКОВ
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Старт
    document.getElementById('btn-start').addEventListener('click', startMission);

    // Возврат с леса
    document.getElementById('btn-back-to-map').addEventListener('click', backToGlobalMap);

    // Возврат с города
    document.getElementById('btn-city-back').addEventListener('click', () => {
        state.currentCityLoc = null;
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('map-screen').classList.add('active');
        renderMap();
    });

    // Отмена панели действий
    document.getElementById('btn-cancel-action').addEventListener('click', closeActionPanel);

    // Нижняя панель
    document.getElementById('btn-nav-map').addEventListener('click', () => {
        closeActionPanel();
        state.currentForestLoc = null;
        state.currentCityLoc = null;
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('map-screen').classList.add('active');
        renderMap();
    });

    document.getElementById('btn-nav-tasks').addEventListener('click', () => {
        const city = state.locations.find(l => l.id === 'city');
        if (city && city.baseBuilt) {
            openTaskDialog(city);
        } else {
            notify('Задания появятся после постройки базы', 'warn');
        }
    });

    document.getElementById('btn-nav-settings').addEventListener('click', () => {
        notify('Настройки будут доступны позже', 'warn');
    });

    // Клик мимо модалки — закрыть
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal') closeModal();
    });
});
