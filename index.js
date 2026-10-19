'use strict';

// ============================================================
// КОНФИГ
// ============================================================
const CONFIG = {
    map: { cols: 4, rows: 5 },

    startingResources: { wood: 10, provant: 20, peasants: 5 },

    scoutCostByRing: [1, 2, 3, 4, 5, 6, 7, 8],

    peasantExtractionMs: 5000,

    city: {
        stockadeCostWood: 150,
        missionTimeLimitSec: 600
    },

    forest: {
        upperWidth: 6,
        upperHeight: 5,
        upperTotal: 30,
        resourceSquares: 3,
        amountPerSquare: 75,
        unlockCostProvant: 1,
        warehouseCapacity: 100,
        warehouseCosts: [10, 12, 14, 16, 18, 20, 22],
        extractionTimeMs: 5000
    },

    field: {
        width: 6,
        height: 5,
        total: 30,
        barnCapacity: 100,
        growthTimeSec: 60,
        seedsPerSquare: 10,
        yieldPerSquare: 50,
        startingSeeds: 50,
        barnCosts: [10, 12, 14, 16, 18, 20, 22]
    },

    // Маршруты (Общие правила, п.6)
    route: {
        maxPerTrip: 25,
        secPerStep: 5,
        stepDelayMs: 1000,
        tickMs: 250
    },

    paternalismStart: 50,
    passionarityStart: 50,

    tasks: [
        { id: 'buildBase',     text: 'Построить базу' },
        { id: 'avoidHunger',   text: 'Избежать голода (амбар ржи ×100)' },
        { id: 'buildStockade', text: 'Построить частокол (150 🪵)' }
    ]
};

const PLANTS = {
    rye: { id: 'rye', name: 'Рожь', icon: '🌾' }
};

// ============================================================
// СОСТОЯНИЕ
// ============================================================
const state = {
    resources: {
        provantStarting: 0,
        woodStarting: 0,
        peasantsTotal: 0
    },
    seeds: { rye: 50 },           // ← ОБЩИЕ семена на всю миссию
    paternalism: 50,
    passionarity: 50,
    tasks: {},
    locations: [],
    routes: [],                    // активные маршруты
    selectedLoc: null,
    selectedForestTile: null,
    selectedFieldTile: null,
    selectedSeedType: 'rye',
    currentForestLoc: null,
    currentCityLoc: null,
    currentFieldLoc: null,
    gameOver: false,
    missionStarted: false,
    missionTimeLeft: 0,

    patriotTimer: null,
    extractionTimer: null,
    missionTimer: null,
    fieldGrowthTimer: null,
    routeTimer: null
};

// ============================================================
// УТИЛИТЫ
// ============================================================
function pickRandomDistinct(pool, count) {
    const copy = pool.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
}

function getLocationByIdx(idx) { return state.locations[idx] || null; }

// ============================================================
// ГЕНЕРАЦИЯ
// ============================================================
function generateForestData() {
    const tiles = [];
    const warehouses = [];

    const all = [];
    for (let i = 0; i < CONFIG.forest.upperTotal; i++) all.push(i);
    const resourceIndices = pickRandomDistinct(all, CONFIG.forest.resourceSquares);

    const guaranteed = (CONFIG.forest.upperHeight - 1) * CONFIG.forest.upperWidth + 0;
    if (!resourceIndices.includes(guaranteed)) resourceIndices[0] = guaranteed;

    for (let i = 0; i < CONFIG.forest.upperTotal; i++) {
        const col = i % CONFIG.forest.upperWidth;
        const row = Math.floor(i / CONFIG.forest.upperWidth);
        const isResource = resourceIndices.includes(i);
        const isBottom = row === CONFIG.forest.upperHeight - 1;

        tiles.push({
            index: i, col, row,
            scouted: isBottom,
            id: isResource ? 'wood' : 'empty',
            name: isResource ? 'Древесина' : 'Пустой квадрат леса',
            icon: isResource ? '🪵' : '🌿',
            amount: isResource ? CONFIG.forest.amountPerSquare : 0,
            hasPeasant: false,
            depleted: false
        });
    }

    for (let i = 0; i < 7; i++) {
        warehouses.push({ index: i, built: false, storedType: 'none', amount: 0 });
    }

    return { upperTiles: tiles, lowerWarehouses: warehouses };
}

function generateFieldData() {
    const squares = [];
    for (let i = 0; i < CONFIG.field.total; i++) {
        squares.push({ index: i, planted: null, plantedAt: 0, ready: false });
    }
    const barns = [];
    for (let i = 0; i < 7; i++) {
        barns.push({ index: i, built: false, plantType: 'none', amount: 0 });
    }
    // seeds теперь глобальные — в state.seeds
    return { squares, barns };
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

function generateMap() {
    const cols = CONFIG.map.cols;
    const rows = CONFIG.map.rows;
    const total = cols * rows;
    const locs = [];

    const cityIndex = (rows - 1) * cols + 0;
    const forestIndex = cityIndex - 1;
    const fieldIndex = cityIndex - cols;

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
        const def = LOCATION_DEF(typeId);

        locs.push({
            index: i, col, row,
            id: typeId,
            name: def.name,
            icon: def.icon,
            owner: i === cityIndex ? 'player' : 'none',
            scouted: i === cityIndex,
            baseBuilt: false,
            stockadeBuilt: false,
            stockadeCollectedWood: 0,
            activeConstruction: null,
            forestData: typeId === 'forest' ? generateForestData() : null,
            fieldData:  typeId === 'field'  ? generateFieldData()  : null
        });
    }

    return locs;
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
function initState() {
    stopAllTimers();

    state.resources = { provantStarting: 0, woodStarting: 0, peasantsTotal: 0 };
    state.seeds = { rye: CONFIG.field.startingSeeds };
    state.paternalism = CONFIG.paternalismStart;
    state.passionarity = CONFIG.passionarityStart;
    state.tasks = {};
    CONFIG.tasks.forEach(t => state.tasks[t.id] = false);

    state.locations = generateMap();
    state.routes = [];
    state.selectedLoc = null;
    state.selectedForestTile = null;
    state.selectedFieldTile = null;
    state.selectedSeedType = 'rye';
    state.currentForestLoc = null;
    state.currentCityLoc = null;
    state.currentFieldLoc = null;
    state.gameOver = false;
    state.missionStarted = false;
    state.missionTimeLeft = 0;

    renderResources();
    renderMap();
    renderCurrentTask();
    hideNotifications();
    closeActionPanel();
    closeModal();
}

function stopAllTimers() {
    ['patriotTimer', 'extractionTimer', 'missionTimer', 'fieldGrowthTimer', 'routeTimer'].forEach(k => {
        if (state[k]) { clearInterval(state[k]); state[k] = null; }
    });
}

function startTimers() {
    state.patriotTimer = setInterval(gameTick, 10000);
    state.extractionTimer = setInterval(forestExtractionTick, CONFIG.forest.extractionTimeMs);
    state.missionTimer = setInterval(missionTick, 1000);
    state.fieldGrowthTimer = setInterval(fieldGrowthTick, 1000);
    state.routeTimer = setInterval(routesTick, CONFIG.route.tickMs);
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
    if (state.paternalism > 0) state.paternalism = Math.max(0, state.paternalism - 1);
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
            const warehouse = loc.forestData.lowerWarehouses.find(
                w => w.built && w.storedType === tile.id && w.amount < CONFIG.forest.warehouseCapacity
            );
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
        renderResources();
        if (state.currentForestLoc) {
            renderForestScreen(state.currentForestLoc);
            if (state.selectedForestTile) refreshForestActionPanel();
        }
    }
}

function fieldGrowthTick() {
    if (state.gameOver) return;
    let needRender = false;

    state.locations.forEach(loc => {
        if (loc.id !== 'field' || !loc.fieldData) return;
        loc.fieldData.squares.forEach(sq => {
            if (sq.planted && !sq.ready) {
                const elapsed = (Date.now() - sq.plantedAt) / 1000;
                if (elapsed >= CONFIG.field.growthTimeSec) {
                    sq.ready = true;
                    needRender = true;
                } else if (state.currentFieldLoc === loc) {
                    needRender = true;
                }
            }
        });
    });

    if (needRender) {
        if (state.currentFieldLoc) renderFieldScreen(state.currentFieldLoc);
        if (state.selectedFieldTile) refreshFieldActionPanel(state.currentFieldLoc);
    }
    checkHungerTask();
}

// ============================================================
// МАРШРУТЫ
// ============================================================
function routesTick() {
    if (state.gameOver) return;
    if (!state.routes.length) return;

    const now = Date.now();
    let needMapRender = false;
    let needCityRender = false;

    state.routes.forEach(route => {
        if (route.status !== 'active') return;

        // Ожидание между партиями
        if (now < route.nextDepartAt) return;

        // Готовим партию
        if (route.currentTrip === null) {
            const source = state.locations.find(l => l.index === route.fromIdx);
            if (!source || !source.forestData) { route.status = 'cancelled'; return; }

            const available = getForestWoodTotal(source);
            if (available <= 0 && route.delivered < route.amountTotal) {
                // Пауза: источник пуст
                route.status = 'paused';
                return;
            }

            const remaining = route.amountTotal - route.delivered;
            const tripAmount = Math.min(available, remaining, CONFIG.route.maxPerTrip);
            if (tripAmount <= 0) { route.status = 'cancelled'; return; }

            // Списываем с источника
            spendForestWood(source, tripAmount);
            route.currentTrip = {
                amount: tripAmount,
                departAt: now,
                arriveAt: now + route.stepMs
            };
            needMapRender = true;
        }

        // Прибытие
        if (route.currentTrip && now >= route.currentTrip.arriveAt) {
            route.delivered += route.currentTrip.amount;
            const target = state.locations.find(l => l.index === route.toIdx);
            if (target && target.id === 'city') {
                target.stockadeCollectedWood =
                    Math.min(CONFIG.city.stockadeCostWood,
                        (target.stockadeCollectedWood || 0) + route.currentTrip.amount);
                needCityRender = true;
            }
            route.currentTrip = null;

            if (route.delivered >= route.amountTotal) {
                route.status = 'done';
                notify('Маршрут завершён: древесина доставлена', 'success');
            } else {
                route.nextDepartAt = now + CONFIG.route.stepDelayMs;
            }
            needMapRender = true;
        }
    });

    // Убираем завершённые
    state.routes = state.routes.filter(r => r.status === 'active' || r.status === 'paused');

    if (needMapRender) renderMap();
    if (needCityRender && state.currentCityLoc) renderCityScreen(state.currentCityLoc);
}

function createRoute(fromLoc, toLoc, amountTotal) {
    const steps = Math.abs(fromLoc.col - toLoc.col) + Math.abs(fromLoc.row - toLoc.row);
    const stepMs = Math.max(1, steps) * CONFIG.route.secPerStep * 1000;

    state.routes.push({
        id: 'route_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        fromIdx: fromLoc.index,
        toIdx: toLoc.index,
        amountTotal,
        delivered: 0,
        status: 'active',
        stepMs,
        currentTrip: null,
        nextDepartAt: Date.now()
    });
    renderMap();
}

function getRouteSourceOptions() {
    // Все локации игрока, где есть древесина на складах
    return state.locations.filter(loc =>
        loc.owner === 'player' &&
        loc.forestData &&
        getForestWoodTotal(loc) > 0
    );
}

function getActiveRouteFromIdx(idx) {
    return state.routes.find(r => r.fromIdx === idx && (r.status === 'active' || r.status === 'paused'));
}

// ============================================================
// HUD
// ============================================================
function renderResources() {
    document.getElementById('r-provant').textContent = getTotalProvant();
    document.getElementById('r-wood').textContent = getWoodTotal();
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
    if (!state.missionStarted) { el.textContent = '--:--'; return; }
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
// КАРТА
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
        if (loc.id === 'field') div.classList.add('field');
        if (loc.owner !== 'player' && !loc.scouted && !isAdj) div.classList.add('locked');

        let statusText = 'туман войны';
        if (loc.owner === 'player') {
            if (loc.id === 'city') statusText = loc.baseBuilt ? 'под контролем' : 'требует постройки';
            else statusText = 'под контролем';
        } else if (loc.scouted) statusText = 'разведано';
        else if (!isAdj) statusText = 'далеко';

        // Бейдж: стройка частокола или активный маршрут
        let badge = '';
        if (loc.id === 'city' && (loc.activeConstruction === 'stockade' || loc.stockadeBuilt)) {
            const activeRoute = state.routes.find(r => r.toIdx === loc.index && r.status === 'active');
            const routeInfo = activeRoute
                ? ` · 🚚 ${activeRoute.delivered}/${activeRoute.amountTotal}`
                : '';
            badge = `<div class="loc-construction-badge">🪵 ${loc.stockadeCollectedWood}/${CONFIG.city.stockadeCostWood}${routeInfo}</div>`;
        } else {
            const activeRoute = state.routes.find(r => r.fromIdx === loc.index && r.status === 'active');
            if (activeRoute) {
                badge = `<div class="loc-construction-badge">🚚 ${activeRoute.delivered}/${activeRoute.amountTotal}</div>`;
            }
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

function getRingFromCity(loc) {
    const city = state.locations.find(l => l.id === 'city');
    if (!city) return 1;
    return Math.abs(loc.col - city.col) + Math.abs(loc.row - city.row);
}

function getScoutCostForLoc(loc) {
    const ring = Math.max(1, getRingFromCity(loc));
    return CONFIG.scoutCostByRing[Math.min(ring - 1, CONFIG.scoutCostByRing.length - 1)];
}

// ============================================================
// ПРОВИАНТ
// ============================================================
function getBarnsRyeTotal() {
    let total = 0;
    state.locations.forEach(loc => {
        if (!loc.fieldData) return;
        loc.fieldData.barns.forEach(b => {
            if (b.built && b.plantType === 'rye') total += b.amount;
        });
    });
    return total;
}

function getTotalProvant() {
    return state.resources.provantStarting + getBarnsRyeTotal();
}

function spendProvant(amount) {
    if (getTotalProvant() < amount) return false;
    let need = amount;

    const fromStarting = Math.min(state.resources.provantStarting, need);
    state.resources.provantStarting -= fromStarting;
    need -= fromStarting;

    if (need > 0) {
        const barns = [];
        state.locations.forEach(loc => {
            if (!loc.fieldData) return;
            loc.fieldData.barns.forEach(b => {
                if (b.built && b.plantType === 'rye' && b.amount > 0) barns.push(b);
            });
        });
        barns.sort((a, b) => b.amount - a.amount);
        for (const b of barns) {
            if (need <= 0) break;
            const take = Math.min(b.amount, need);
            b.amount -= take;
            need -= take;
        }
    }

    renderResources();
    return true;
}

// ============================================================
// ДРЕВЕСИНА
// ============================================================
function getForestWoodTotal(loc) {
    if (!loc || !loc.forestData) return 0;
    let total = 0;
    loc.forestData.lowerWarehouses.forEach(w => {
        if (w.built && w.storedType === 'wood') total += w.amount;
    });
    return total;
}

function getWoodTotal() {
    let total = state.resources.woodStarting || 0;
    state.locations.forEach(loc => {
        if (loc.forestData) total += getForestWoodTotal(loc);
    });
    return total;
}

function spendGlobalWood(amount) {
    if (getWoodTotal() < amount) return false;
    let need = amount;

    const fromStarting = Math.min(state.resources.woodStarting || 0, need);
    state.resources.woodStarting -= fromStarting;
    need -= fromStarting;

    if (need > 0) {
        const whs = [];
        state.locations.forEach(loc => {
            if (!loc.forestData) return;
            loc.forestData.lowerWarehouses.forEach(w => {
                if (w.built && w.storedType === 'wood' && w.amount > 0) whs.push(w);
            });
        });
        whs.sort((a, b) => b.amount - a.amount);
        for (const w of whs) {
            if (need <= 0) break;
            const take = Math.min(w.amount, need);
            w.amount -= take;
            need -= take;
        }
    }

    renderResources();
    return need === 0;
}

function spendForestWood(loc, amount) {
    if (!loc || !loc.forestData) return false;
    let need = amount;
    const whs = loc.forestData.lowerWarehouses
        .filter(w => w.built && w.storedType === 'wood' && w.amount > 0)
        .sort((a, b) => b.amount - a.amount);
    for (const w of whs) {
        if (need <= 0) break;
        const take = Math.min(w.amount, need);
        w.amount -= take;
        need -= take;
    }
    return need === 0;
}

// ============================================================
// КРЕСТЬЯНЕ
// ============================================================
function getAssignedPeasants() {
    let assigned = 0;
    state.locations.forEach(loc => {
        if (!loc.forestData) return;
        loc.forestData.upperTiles.forEach(t => { if (t.hasPeasant) assigned++; });
    });
    return assigned;
}
function getFreePeasants() {
    return Math.max(0, state.resources.peasantsTotal - getAssignedPeasants());
}

// ============================================================
// КЛИК ПО ЛОКАЦИИ
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
        desc.textContent = `Стоимость разведки: ${cost} 🍞 (круг ${getRingFromCity(loc)}).`;
        addBtn(btns, `🔍 Разведать (${cost} 🍞)`, () => scoutLocation(loc), getTotalProvant() >= cost);
    } else if (loc.owner !== 'player' && loc.scouted) {
        desc.textContent = 'Земля разведана. Присоедините её.';
        addBtn(btns, '🚩 Присоединить мирно', () => {
            loc.owner = 'player';
            closeActionPanel();
            renderMap();
        }, true);
    } else if (loc.id === 'city') {
        desc.textContent = cityDescription(loc);
        addBtn(btns, '🚪 Зайти в город', () => { closeActionPanel(); openCityScreen(loc); }, true);
    } else if (loc.id === 'forest') {
        desc.textContent = forestDescription(loc);
        addBtn(btns, '🚪 Зайти в лес', () => { closeActionPanel(); openForestScreen(loc); }, true);
    } else if (loc.id === 'field') {
        desc.textContent = fieldDescription(loc);
        addBtn(btns, '🚪 Зайти на поле', () => { closeActionPanel(); openFieldScreen(loc); }, true);
    } else {
        desc.textContent = 'Тихая земля. Пока здесь нечего делать.';
    }

    document.getElementById('action-panel').classList.add('open');
}

function cityDescription(loc) {
    if (!loc.baseBuilt) return 'Город разрушен. Постройте базу.';
    if (loc.stockadeBuilt) return 'Город под контролем. Частокол построен.';
    if (loc.activeConstruction === 'stockade')
        return `Идёт стройка: Частокол (${loc.stockadeCollectedWood}/${CONFIG.city.stockadeCostWood} 🪵).`;
    return 'Город под контролем. Частокол не начат.';
}

function forestDescription(loc) {
    let s = 'Лес под контролем.\n';
    let builtAny = false;
    loc.forestData.lowerWarehouses.forEach((w, i) => {
        if (w.built) {
            builtAny = true;
            const resName = w.storedType === 'wood' ? 'Древесина' : 'Пусто';
            s += `• Слот ${i + 1}: ${resName} (${w.amount}/${CONFIG.forest.warehouseCapacity})\n`;
        }
    });
    if (!builtAny) s += 'Склады отсутствуют.';
    const activeRoute = getActiveRouteFromIdx(loc.index);
    if (activeRoute) s += `\n🚚 Активный маршрут: ${activeRoute.delivered}/${activeRoute.amountTotal}`;
    return s;
}

function fieldDescription(loc) {
    let s = 'Поле под контролем.\n';
    let builtAny = false;
    loc.fieldData.barns.forEach((b, i) => {
        if (b.built) {
            builtAny = true;
            const plantName = b.plantType === 'rye' ? 'Рожь' : 'Пусто';
            s += `• Амбар ${i + 1}: ${plantName} (${b.amount}/${CONFIG.field.barnCapacity})\n`;
        }
    });
    if (!builtAny) s += 'Амбары отсутствуют.';
    s += `\nСемена ржи (общие): ${state.seeds.rye}.`;
    return s;
}

function scoutLocation(loc) {
    const cost = getScoutCostForLoc(loc);
    if (!spendProvant(cost)) return;
    loc.scouted = true;
    notify(`Разведано: ${loc.name}`, 'success');
    closeActionPanel();
    renderMap();
}

// ============================================================
// ПОСТРОЙКА БАЗЫ
// ============================================================
function buildBase(loc) {
    if (loc.baseBuilt) return;
    loc.baseBuilt = true;
    loc.name = 'Город';
    loc.icon = '🏘️';

    state.resources.provantStarting += CONFIG.startingResources.provant;
    state.resources.woodStarting    += CONFIG.startingResources.wood;
    state.resources.peasantsTotal   += CONFIG.startingResources.peasants;

    state.missionStarted = true;
    state.missionTimeLeft = CONFIG.city.missionTimeLimitSec;
    startTimers();

    state.tasks.buildBase = true;
    renderCurrentTask();

    notify('Вы получили стартовый запас: 20 провианта, 10 древесины, 5 крестьян', 'success', 4000);

    closeActionPanel();
    renderResources();
    renderMap();
    if (state.currentCityLoc === loc) renderCityScreen(loc);
}

// ============================================================
// ГОРОД
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

    const building = document.getElementById('city-building');
    const bIcon = building.querySelector('.city-building-icon');
    const bLabel = building.querySelector('.city-building-label');
    building.classList.toggle('ruined', !loc.baseBuilt);
    building.classList.toggle('built', loc.baseBuilt);
    bIcon.textContent = loc.baseBuilt ? '🏛️' : '🏚️';
    bLabel.textContent = loc.baseBuilt ? 'Центральное здание' : 'Разрушенное здание';

    const stockade = document.getElementById('city-stockade-zone');
    stockade.classList.toggle('built', !!loc.stockadeBuilt);
    const sIcon = stockade.querySelector('.city-stockade-icon');
    const sLabel = stockade.querySelector('.city-stockade-label');
    sIcon.textContent = loc.stockadeBuilt ? '🛡️' : '🪵';
    if (loc.stockadeBuilt) sLabel.textContent = 'Частокол построен';
    else if (loc.activeConstruction === 'stockade')
        sLabel.textContent = `Частокол: ${loc.stockadeCollectedWood}/${CONFIG.city.stockadeCostWood} 🪵`;
    else sLabel.textContent = 'Место под частокол';

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
    } else {
        const hint = document.createElement('div');
        hint.className = 'construction-item disabled';
        hint.innerHTML = `<span class="ci-name">Сначала постройте базу</span>`;
        list.appendChild(hint);
    }

    const ul = document.getElementById('city-tasks-list');
    ul.innerHTML = '';
    CONFIG.tasks.forEach(t => {
        if (t.id === 'buildBase' && state.tasks.buildBase) return;
        const li = document.createElement('li');
        li.textContent = t.text;
        if (state.tasks[t.id]) li.classList.add('done');
        ul.appendChild(li);
    });

    building.onclick = () => onCentralBuildingClick(loc);
    stockade.onclick = () => onStockadeClick(loc);
}

function onCentralBuildingClick(loc) {
    if (!loc.baseBuilt) { buildBase(loc); return; }
    openTaskDialog(loc);
}

function openTaskDialog(loc) {
    const active = CONFIG.tasks.filter(t => !state.tasks[t.id] && t.id !== 'buildBase');
    let html = '<p>Боярин, люди напуганы. Одни боятся голода, другие — набегов. ' +
        'Помоги им: наполни амбар и поставь частокол. Времени мало.</p>';
    if (active.length === 0) html += '<p>Все задания выполнены. Город процветает.</p>';
    else {
        html += '<ul>';
        active.forEach(t => { html += `<li>${t.text}</li>`; });
        html += '</ul>';
    }
    openModal('Воевода', html, 'Закрыть', () => closeModal());
}

function onStockadeClick(loc) {
    if (!loc.baseBuilt) { notify('Сначала постройте базу', 'warn'); return; }
    if (loc.stockadeBuilt) { notify('Частокол уже построен', 'success'); return; }

    // Если стройка ещё не активна — активируем
    if (loc.activeConstruction !== 'stockade') {
        loc.activeConstruction = 'stockade';
        notify('Начата стройка: Частокол (150 🪵)', 'warn');
        renderCityScreen(loc);
        renderMap();
        return;
    }

    // Стройка активна — открываем панель действий
    openStockadeActionPanel(loc);
}

function openStockadeActionPanel(loc) {
    const btns = document.getElementById('action-buttons');
    const title = document.getElementById('action-title');
    const desc = document.getElementById('action-desc');
    btns.innerHTML = '';

    title.textContent = 'Стройка: Частокол';

    const have = loc.stockadeCollectedWood;
    const need = CONFIG.city.stockadeCostWood;
    let descText =
        `Собрано: ${have} / ${need} 🪵.\n` +
        `Требуется ещё: ${Math.max(0, need - have)} 🪵.`;

    const activeRouteToCity = state.routes.find(r => r.toIdx === loc.index && (r.status === 'active' || r.status === 'paused'));
    if (activeRouteToCity) {
        descText += `\n🚚 Активный маршрут: ${activeRouteToCity.delivered}/${activeRouteToCity.amountTotal}`;
    }
    desc.textContent = descText;

    // Кнопка завершения (если набрали)
    if (have >= need) {
        addBtn(btns, '🏗️ Построить частокол', () => completeStockade(loc), true);
    } else {
        // Выбор источника для маршрута
        const sources = getRouteSourceOptions();
        if (!sources.length) {
            addBtn(btns, '🚚 Нет источников с древесиной', () => {}, false);
        } else {
            sources.forEach(src => {
                const activeRoute = getActiveRouteFromIdx(src.index);
                if (activeRoute) {
                    addBtn(btns,
                        `🚚 ${src.name}: уже в пути (${activeRoute.delivered}/${activeRoute.amountTotal})`,
                        () => {}, false);
                } else {
                    const woodInSource = getForestWoodTotal(src);
                    const canSend = woodInSource > 0;
                    const remainingNeed = need - have;
                    const defaultAmount = Math.min(woodInSource, remainingNeed, CONFIG.route.maxPerTrip);
                    addBtn(btns,
                        `🚚 Из «${src.name}» (${defaultAmount} 🪵)`,
                        () => {
                            const amount = Math.min(woodInSource, remainingNeed);
                            createRoute(src, loc, amount);
                            notify(`Маршрут отправлен: ${amount} 🪵 из «${src.name}»`, 'success');
                            closeActionPanel();
                            renderMap();
                            renderCityScreen(loc);
                        },
                        canSend);
                }
            });
        }
    }

    document.getElementById('action-panel').classList.add('open');
}

function completeStockade(loc) {
    if (loc.stockadeCollectedWood < CONFIG.city.stockadeCostWood) return;
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
// ЛЕС
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
            } else div.classList.add('locked');
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
            const icon = w.storedType === 'wood' ? '🪵' : '⬜';
            div.innerHTML = `
                <span class="tile-icon">🏠</span>
                <span class="tile-badge">${icon}:${w.amount}</span>
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
                getTotalProvant() >= CONFIG.forest.unlockCostProvant);
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
                    addBtn(btns, '👨‍🌾 Отправить добывать',
                        () => togglePeasantOnSquare(item, true),
                        getFreePeasants() > 0 && hasWarehouse);
                } else {
                    addBtn(btns, '🛑 Отозвать крестьянина',
                        () => togglePeasantOnSquare(item, false), true);
                }
            }
        }
    } else if (type === 'lower') {
        const builtCount = state.currentForestLoc.forestData.lowerWarehouses.filter(w => w.built).length;

        if (!item.built) {
            const cost = CONFIG.forest.warehouseCosts[builtCount] || 22;
            const have = getWoodTotal();
            title.textContent = 'Пустой слот под склад';
            desc.textContent =
                `Построить лесной склад для координации добычи?\n` +
                `Стоимость: ${cost} 🪵.\n` +
                `Всего древесины: ${have} 🪵.`;
            addBtn(btns, `🪵 Построить склад (${cost} 🪵)`,
                () => buildForestWarehouse(item, cost), have >= cost);
        } else {
            title.textContent = 'Лесной склад';
            const resName = item.storedType === 'wood' ? 'Древесина' : 'Пусто';
            desc.textContent =
                `Тип хранения: ${resName}.\n` +
                `Заполнено: ${item.amount} / ${CONFIG.forest.warehouseCapacity} ед.`;
            if (item.storedType !== 'wood') {
                addBtn(btns, '📦 Хранить 🪵 Древесину',
                    () => changeWarehouseResource(item, 'wood'), true);
            }
            if (item.storedType !== 'none') {
                addBtn(btns, '🗑️ Сбросить фильтр склада',
                    () => changeWarehouseResource(item, 'none'), true);
            }
        }
    }

    document.getElementById('action-panel').classList.add('open');
}

function unlockForestSquare(tile) {
    if (!spendProvant(CONFIG.forest.unlockCostProvant)) return;
    tile.scouted = true;
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
    if (!spendGlobalWood(cost)) return;
    warehouse.built = true;
    warehouse.storedType = 'none';
    warehouse.amount = 0;
    renderResources();
    renderForestScreen(loc);
    onForestLowerClick(warehouse);
}

function changeWarehouseResource(warehouse, newTypeId) {
    if (warehouse.amount > 0) {
        if (!confirm('Внимание! На складе есть запасы. При смене типа хранения они удалятся безвозвратно. Продолжить?')) return;
    }
    warehouse.storedType = newTypeId;
    warehouse.amount = 0;
    renderForestScreen(state.currentForestLoc);
    onForestLowerClick(warehouse);
}

// ============================================================
// ПОЛЕ
// ============================================================
function openFieldScreen(loc) {
    state.currentFieldLoc = loc;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('field-screen').classList.add('active');
    renderFieldScreen(loc);
}

function renderFieldScreen(loc) {
    if (!loc || !loc.fieldData) return;

    // Поле 6×5
    const grid = document.getElementById('field-grid');
    grid.innerHTML = '';
    loc.fieldData.squares.forEach(sq => {
        const div = document.createElement('div');
        div.className = 'field-tile';

        if (!sq.planted) {
            div.classList.add('empty');
            div.innerHTML = `<span class="tile-icon">·</span>`;
        } else if (sq.ready) {
            div.classList.add('ready');
            const plant = PLANTS[sq.planted];
            div.innerHTML = `<span class="tile-icon">${plant.icon}</span>`;
        } else {
            div.classList.add('growing');
            const plant = PLANTS[sq.planted];
            const elapsed = (Date.now() - sq.plantedAt) / 1000;
            const pct = Math.max(0, Math.min(100, (elapsed / CONFIG.field.growthTimeSec) * 100));
            div.innerHTML = `
                <div class="growth-bar"><span style="width:${pct}%"></span></div>
                <span class="tile-icon">${plant.icon}</span>
            `;
        }
        div.addEventListener('click', () => onFieldTileClick(sq));
        grid.appendChild(div);
    });

    // Окно «Семена» — ОБЩИЕ семена из state.seeds
    const seedsList = document.getElementById('seeds-list');
    seedsList.innerHTML = '';
    Object.values(PLANTS).forEach(plant => {
        const count = state.seeds[plant.id] || 0;
        const item = document.createElement('div');
        item.className = 'seed-item';
        if (state.selectedSeedType === plant.id) item.classList.add('selected');
        if (count < CONFIG.field.seedsPerSquare) item.classList.add('empty');
        item.innerHTML = `
            <span class="seed-icon">${plant.icon}</span>
            <span class="seed-name">${plant.name}</span>
            <span class="seed-count">${count}</span>
        `;
        item.addEventListener('click', () => {
            state.selectedSeedType = plant.id;
            renderFieldScreen(loc);
        });
        seedsList.appendChild(item);
    });

    // Амбары
    const barnsGrid = document.getElementById('barns-grid');
    barnsGrid.innerHTML = '';
    loc.fieldData.barns.forEach(b => {
        const div = document.createElement('div');
        div.className = 'barn-tile';
        if (!b.built) {
            div.innerHTML = `<span class="tile-icon">➕</span>`;
        } else {
            div.classList.add('built');
            const plant = PLANTS[b.plantType];
            const icon = plant ? plant.icon : '⬜';
            div.innerHTML = `
                <span class="tile-icon">🏠</span>
                <span class="tile-badge">${icon}:${b.amount}</span>
            `;
        }
        div.addEventListener('click', () => onBarnClick(b));
        barnsGrid.appendChild(div);
    });
}

function onFieldTileClick(sq) {
    if (state.gameOver || !state.currentFieldLoc) return;
    const loc = state.currentFieldLoc;

    if (sq.planted && sq.ready) {
        tryHarvest(loc, sq);
        return;
    }
    if (sq.planted && !sq.ready) {
        if (!confirm('На этом квадрате уже растёт растение. Пересадить? Затраченные семена не вернутся.')) return;
        sq.planted = null;
        sq.plantedAt = 0;
        sq.ready = false;
        plantOnSquare(loc, sq);
        return;
    }
    plantOnSquare(loc, sq);
}

function plantOnSquare(loc, sq) {
    const plantId = state.selectedSeedType;
    const seeds = state.seeds[plantId] || 0;
    const cost = CONFIG.field.seedsPerSquare;

    if (seeds < cost) {
        notify(`Недостаточно семян ${PLANTS[plantId].name} (нужно ${cost}, есть ${seeds})`, 'warn');
        return;
    }
    state.seeds[plantId] -= cost;
    sq.planted = plantId;
    sq.plantedAt = Date.now();
    sq.ready = false;

    renderFieldScreen(loc);
}

function tryHarvest(loc, sq) {
    const plantId = sq.planted;
    const barn = loc.fieldData.barns.find(
        b => b.built && b.plantType === plantId && b.amount < CONFIG.field.barnCapacity
    );
    if (!barn) {
        notify('Нет амбара с местом под это растение. Освободите место.', 'warn');
        return;
    }
    const yieldAmount = Math.min(
        CONFIG.field.yieldPerSquare,
        CONFIG.field.barnCapacity - barn.amount
    );
    barn.amount += yieldAmount;

    const leftover = CONFIG.field.yieldPerSquare - yieldAmount;
    if (leftover > 0) {
        notify(`Амбар заполнен! Собрано ${yieldAmount}, осталось ${leftover} на квадрате.`, 'warn');
        return;
    }

    sq.planted = null;
    sq.plantedAt = 0;
    sq.ready = false;

    renderFieldScreen(loc);
    checkHungerTask();
}

function onBarnClick(b) {
    if (state.gameOver || !state.currentFieldLoc) return;
    state.selectedFieldTile = { type: 'barn', data: b };
    refreshFieldActionPanel(state.currentFieldLoc);
}

function refreshFieldActionPanel(loc) {
    const sel = state.selectedFieldTile;
    if (!sel) return;
    const b = sel.data;
    const btns = document.getElementById('action-buttons');
    const title = document.getElementById('action-title');
    const desc = document.getElementById('action-desc');
    btns.innerHTML = '';

    if (!b.built) {
        const builtCount = loc.fieldData.barns.filter(x => x.built).length;
        const cost = CONFIG.field.barnCosts[builtCount] || 22;
        const have = getWoodTotal();
        title.textContent = 'Пустой слот под амбар';
        desc.textContent =
            `Построить амбар?\nСтоимость: ${cost} 🪵.\nВсего древесины: ${have} 🪵.`;
        addBtn(btns, `🪵 Построить амбар (${cost} 🪵)`,
            () => buildBarn(b, cost), have >= cost);
    } else {
        title.textContent = 'Амбар';
        const plantName = b.plantType === 'rye' ? 'Рожь' : 'Пусто';
        desc.textContent = `Растение: ${plantName}.\nЗаполнено: ${b.amount}/${CONFIG.field.barnCapacity}.`;

        if (b.plantType !== 'rye') {
            addBtn(btns, '📦 Хранить 🌾 Рожь', () => changeBarnPlant(b, 'rye'), true);
        }
        if (b.plantType !== 'none') {
            addBtn(btns, '🗑️ Сбросить (Пусто)', () => changeBarnPlant(b, 'none'), true);
        }

        // === Семена: перевод из амбара в «карман» и обратно ===
        if (b.plantType === 'rye' && b.amount > 0) {
            const step = Math.min(CONFIG.field.seedsPerSquare, b.amount);
            addBtn(btns, `🌱 Взять ${step} семян из амбара`,
                () => {
                    const take = Math.min(CONFIG.field.seedsPerSquare, b.amount);
                    b.amount -= take;
                    state.seeds.rye += take;
                    renderFieldScreen(loc);
                    onBarnClick(b);
                    renderResources();
                }, true);
        }
        if (b.plantType === 'rye') {
            const freeSpace = CONFIG.field.barnCapacity - b.amount;
            const back = Math.min(CONFIG.field.seedsPerSquare, state.seeds.rye, freeSpace);
            if (back > 0) {
                addBtn(btns, `↩️ Вернуть ${back} семян в амбар`,
                    () => {
                        const put = Math.min(CONFIG.field.seedsPerSquare, state.seeds.rye,
                            CONFIG.field.barnCapacity - b.amount);
                        state.seeds.rye -= put;
                        b.amount += put;
                        renderFieldScreen(loc);
                        onBarnClick(b);
                        renderResources();
                    }, true);
            }
        }
    }
    document.getElementById('action-panel').classList.add('open');
}

function buildBarn(b, cost) {
    const loc = state.currentFieldLoc;
    if (!loc) return;
    if (!spendGlobalWood(cost)) return;
    b.built = true;
    b.plantType = 'none';
    b.amount = 0;
    renderResources();
    renderFieldScreen(loc);
    onBarnClick(b);
}

function changeBarnPlant(b, newType) {
    if (b.amount > 0) {
        if (!confirm('На амбаре есть запас. При смене растения он удалится безвозвратно. Продолжить?')) return;
    }
    b.plantType = newType;
    b.amount = 0;
    renderFieldScreen(state.currentFieldLoc);
    onBarnClick(b);
}

// ============================================================
// ЗАДАНИЕ «ИЗБЕЖАТЬ ГОЛОДА»
// ============================================================
function checkHungerTask() {
    if (state.tasks.avoidHunger) return;
    let full = false;
    state.locations.forEach(loc => {
        if (!loc.fieldData) return;
        loc.fieldData.barns.forEach(b => {
            if (b.built && b.plantType === 'rye' && b.amount >= CONFIG.field.barnCapacity) full = true;
        });
    });
    if (full) {
        state.tasks.avoidHunger = true;
        renderCurrentTask();
        notify('Задание выполнено: «Избежать голода»!', 'success');
        checkVictory();
    }
}

// ============================================================
// ПОБЕДА
// ============================================================
function checkVictory() {
    if (state.gameOver) return;
    if (state.tasks.avoidHunger && state.tasks.buildStockade) {
        endGame(true, 'Угроза голода миновала, частокол даёт защиту поселению.');
    }
}

// ============================================================
// УВЕДОМЛЕНИЯ / МОДАЛКА
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
    state.selectedFieldTile = null;
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
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById('briefing').classList.add('active');
            if (!isVictory) initState();
        }
    );
}

// ============================================================
// ОБРАБОТЧИКИ
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-start').addEventListener('click', startMission);
    document.getElementById('btn-back-to-map').addEventListener('click', backToGlobalMap);

    document.getElementById('btn-city-back').addEventListener('click', () => {
        state.currentCityLoc = null;
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('map-screen').classList.add('active');
        renderMap();
    });

    document.getElementById('btn-field-back').addEventListener('click', () => {
        state.currentFieldLoc = null;
        state.selectedFieldTile = null;
        closeActionPanel();
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('map-screen').classList.add('active');
        renderMap();
    });

    document.getElementById('btn-cancel-action').addEventListener('click', closeActionPanel);

    document.getElementById('btn-nav-map').addEventListener('click', () => {
        closeActionPanel();
        state.currentForestLoc = null;
        state.currentCityLoc = null;
        state.currentFieldLoc = null;
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('map-screen').classList.add('active');
        renderMap();
    });

    document.getElementById('btn-nav-tasks').addEventListener('click', () => {
        const city = state.locations.find(l => l.id === 'city');
        if (city && city.baseBuilt) openTaskDialog(city);
        else notify('Задания появятся после постройки базы', 'warn');
    });

    document.getElementById('btn-nav-settings').addEventListener('click', () => {
        notify('Настройки будут доступны позже', 'warn');
    });

    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal') closeModal();
    });
});
