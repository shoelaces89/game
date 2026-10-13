// ============================================================
// КОНФИГ
// ============================================================
const CONFIG = {
    resources: {
        food: { start: 100 },
        wood: { start: 100 },
        honey: { start: 0 },
        wax: { start: 0 },
        peasants: { start: 100 }
    },
    map: { cols: 4, rows: 5 },
    forest: {
        cols: 6,
        rows: 5,
        totalSquares: 30,
        amountPerSquare: 75,
        storageCapacity: 100,
        storageSlots: 7,
        unlockCost: 1,
        extractionTimeMs: 5000
    },
    storageCost: [10, 12, 14, 16, 18, 20, 22],
    costs: {
        scoutLoc: 2,
        buildBase: 5
    },
    missionTasks: [
        { id: 'buildBase', text: '📜 Построить базу' },
        { id: 'scout', text: '📜 Разведать территорию' },
        { id: 'openForest', text: '📜 Открыть лес' },
        { id: 'buildStorage', text: '📜 Построить склад' },
        { id: 'assignPeasant', text: '📜 Назначить крестьянина' }
    ],
    eras: [
        {
            id: 'era1',
            title: 'Эпоха 1: Киевская Русь',
            regions: [
                {
                    id: 'region1',
                    title: 'Киевская земля',
                    desc: 'Начни с малого — построй базу и разведай окрестности.',
                    unlocked: true,
                    missions: [
                        { id: 'm1', title: 'Миссия 1: Земля предков', unlocked: true, completed: false },
                        { id: 'm2', title: 'Миссия 2: Хлеб насущный', unlocked: false, completed: false },
                        { id: 'm3', title: 'Миссия 3: Железо и оружие', unlocked: false, completed: false },
                        { id: 'm4', title: 'Миссия 4: Оборона рубежей', unlocked: false, completed: false },
                        { id: 'm5', title: 'Миссия 5: Путь из варяг', unlocked: false, completed: false }
                    ]
                },
                {
                    id: 'region2',
                    title: 'Северные княжества',
                    desc: 'Откроется после прохождения Киевской земли.',
                    unlocked: false,
                    missions: []
                },
                {
                    id: 'region3',
                    title: 'Степь',
                    desc: 'Откроется после прохождения Северных княжеств.',
                    unlocked: false,
                    missions: []
                }
            ]
        }
    ]
};

// ============================================================
// СОСТОЯНИЕ
// ============================================================
const state = {
    resources: {
        food: CONFIG.resources.food.start,
        wood: CONFIG.resources.wood.start,
        honey: CONFIG.resources.honey.start,
        wax: CONFIG.resources.wax.start,
        peasants: CONFIG.resources.peasants.start
    },
    currentEra: 0,
    currentRegion: null,
    currentMission: null,
    missionMap: [],
    forestMap: [],
    forestStorage: [],
    selectedLoc: null,
    gatherTimers: {},
    taskIndex: 0
};

const LOCATION_TYPES = [
    { id: 'field', name: 'Поле', icon: '🌾' },
    { id: 'forest', name: 'Лес', icon: '🌲' },
    { id: 'village', name: 'Село', icon: '🏘️' },
    { id: 'empty', name: 'Пустошь', icon: '⬜' }
];

const FOREST_RESOURCES = {
    wood: { icon: '🌲', gives: ['wood'] },
    beehive: { icon: '🐝', gives: ['honey', 'wax'] },
    animals: { icon: '🐗', gives: ['food'] }
};

const RESOURCE_NAMES = {
    wood: { name: 'Древесина', icon: '🪵' },
    honey: { name: 'Мёд', icon: '🍯' },
    wax: { name: 'Воск', icon: '🕯️' },
    food: { name: 'Еда', icon: '🍞' },
    nothing: { name: 'Ничего', icon: '⛔' }
};

// ============================================================
// ГЕНЕРАЦИЯ
// ============================================================
function generateMissionMap() {
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

function generateForestMap() {
    const total = CONFIG.forest.totalSquares;
    const cells = [];
    const types = [];

    for (let i = 0; i < 7; i++) types.push('wood');
    for (let i = 0; i < 7; i++) types.push('beehive');
    for (let i = 0; i < 7; i++) types.push('animals');
    while (types.length < total) types.push('empty');

    for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = types[i]; types[i] = types[j]; types[j] = tmp;
    }

    const startIndex = (CONFIG.forest.rows - 1) * CONFIG.forest.cols + 0;

    for (let i = 0; i < total; i++) {
        const col = i % CONFIG.forest.cols;
        const row = Math.floor(i / CONFIG.forest.cols);
        const typeId = types[i];
        const isStart = i === startIndex;
        cells.push({
            index: i, col: col, row: row,
            open: isStart,
            type: typeId,
            remaining: typeId !== 'empty' ? CONFIG.forest.amountPerSquare : 0,
            worker: false
        });
    }
    return cells;
}

function generateStorage() {
    const slots = [];
    for (let i = 0; i < CONFIG.forest.storageSlots; i++) {
        slots.push({
            index: i,
            built: false,
            resource: null,
            amount: 0,
            capacity: CONFIG.forest.storageCapacity
        });
    }
    return slots;
}

// ============================================================
// РЕНДЕР
// ============================================================
function renderResources() {
    document.getElementById('r-food').textContent = state.resources.food;
    document.getElementById('r-wood').textContent = state.resources.wood;
    document.getElementById('r-honey').textContent = state.resources.honey;
    document.getElementById('r-wax').textContent = state.resources.wax;
    document.getElementById('r-peasants').textContent = state.resources.peasants;
}

function renderTask() {
    const el = document.getElementById('mission-task-text');
    if (!el) return;
    const task = CONFIG.missionTasks[state.taskIndex];
    el.textContent = task ? task.text : '📜 Все задачи выполнены';
}

function renderEra() {
    const era = CONFIG.eras[state.currentEra];
    const titleEl = document.getElementById('era-title');
    if (titleEl) titleEl.textContent = era.title;

    const cont = document.getElementById('era-regions');
    if (!cont) return;
    cont.innerHTML = '';

    for (let i = 0; i < era.regions.length; i++) {
        const region = era.regions[i];
        const div = document.createElement('div');
        div.className = 'region-card' + (region.unlocked ? '' : ' locked');
        div.innerHTML =
            '<div class="rc-title">' + region.title + '</div>' +
            '<div class="rc-desc">' + region.desc + '</div>';

        if (region.unlocked) {
            div.onclick = (function(r) {
                return function() { openRegion(r.id); };
            })(region);
        }
        cont.appendChild(div);
    }
    showScreen('screen-era');
}

function renderMissionMap() {
    const cont = document.getElementById('mission-map');
    if (!cont) return;
    cont.innerHTML = '';

    const sorted = state.missionMap.slice().sort(function(a, b) {
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

        div.onclick = (function(l) {
            return function() { onLocClick(l); };
        })(loc);

        cont.appendChild(div);
    }
}

function renderForest() {
    const cont = document.getElementById('forest-grid');
    if (!cont) return;
    cont.innerHTML = '';

    for (let i = 0; i < state.forestMap.length; i++) {
        const cell = state.forestMap[i];
        const div = document.createElement('div');
        div.className = 'cell';

        if (!cell.open) {
            div.classList.add('fog');
            div.textContent = '🌫️';
        } else if (cell.type !== 'empty' && cell.remaining > 0) {
            const res = FOREST_RESOURCES[cell.type];
            if (res) {
                div.textContent = res.icon;
                if (cell.worker) div.classList.add('worker');
                const amount = document.createElement('div');
                amount.className = 'cell-amount';
                amount.textContent = cell.remaining;
                div.appendChild(amount);
            }
        }

        div.onclick = (function(c) {
            return function() { onCellClick(c); };
        })(cell);

        cont.appendChild(div);
    }
}

function renderStorage() {
    const cont = document.getElementById('forest-storage');
    if (!cont) return;
    cont.innerHTML = '';

    for (let i = 0; i < state.forestStorage.length; i++) {
        const slot = state.forestStorage[i];
        const div = document.createElement('div');
        div.className = 'storage-slot';

        if (slot.built) {
            div.classList.add('built');
            const res = RESOURCE_NAMES[slot.resource] || RESOURCE_NAMES.nothing;
            div.innerHTML =
                '<div class="st-icon">' + res.icon + '</div>' +
                '<div class="st-amount">' + slot.amount + '/' + slot.capacity + '</div>' +
                '<div class="st-label">' + res.name + '</div>';
        } else {
            const cost = CONFIG.storageCost[slot.index];
            div.innerHTML = '<div class="st-amount">' + cost + '🪵</div>';
        }

        div.onclick = (function(s) {
            return function() { onStorageClick(s); };
        })(slot);

        cont.appendChild(div);
    }
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ
// ============================================================
function showScreen(id) {
    const screens = document.querySelectorAll('.screen');
    for (let i = 0; i < screens.length; i++) {
        screens[i].classList.remove('active');
    }
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function showModal(title, bodyHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal').classList.add('open');
}

function closeModal() {
    document.getElementById('modal').classList.remove('open');
}

function toggleMenu() {
    document.getElementById('menu-panel').classList.toggle('open');
}

function showSettings() { toggleMenu(); showModal('Настройки', 'Раздел в разработке.'); }
function showSave() { toggleMenu(); showModal('Сохранение', 'Сохранение в разработке.'); }
function showExit() { toggleMenu(); showModal('Выход', 'Выход в разработке.'); }

function toggleRegionInfo() {
    document.getElementById('region-info-full').classList.toggle('open');
}

function closeActionPanel() {
    document.getElementById('action-panel').classList.remove('open');
}

function nextTask() {
    state.taskIndex += 1;
    renderTask();
}

// ============================================================
// ПЕРЕХОДЫ
// ============================================================
function openRegion(regionId) {
    const era = CONFIG.eras[state.currentEra];
    const region = era.regions.find(function(r) { return r.id === regionId; });
    if (!region) return;
    state.currentRegion = region;

    const completed = region.missions.filter(function(m) { return m.completed; }).length;
    const shortEl = document.getElementById('region-info-short');
    if (shortEl) {
        shortEl.textContent = region.title + ' · ' + completed + '/' + region.missions.length + ' миссий';
    }

    const missionsCont = document.getElementById('region-missions');
    if (missionsCont) {
        missionsCont.innerHTML = '';
        for (let i = 0; i < region.missions.length; i++) {
            const mission = region.missions[i];
            const div = document.createElement('div');
            div.className = 'mission-card' + (mission.unlocked ? '' : ' locked');
            const status = mission.completed ? '✅ Пройдена' : (mission.unlocked ? '▶ Доступна' : '🔒 Закрыта');
            div.innerHTML =
                '<div class="mc-title">' + mission.title + '</div>' +
                '<div class="mc-status">' + status + '</div>';

            if (mission.unlocked && !mission.completed) {
                div.onclick = (function(m) {
                    return function() { openMission(m.id); };
                })(mission);
            }
            missionsCont.appendChild(div);
        }
    }

    showScreen('screen-region');
}

function openMission(missionId) {
    state.currentMission = missionId;
    state.missionMap = generateMissionMap();
    state.forestMap = [];
    state.forestStorage = [];
    state.gatherTimers = {};
    state.taskIndex = 0;
    renderTask();
    renderMissionMap();
    showScreen('screen-mission');
}

function backToRegion() {
    renderEra();
}

function backToMission() {
    renderMissionMap();
    showScreen('screen-mission');
}

function openField() {
    showScreen('screen-field');
}

function openForest() {
    if (state.forestMap.length === 0) {
        state.forestMap = generateForestMap();
        state.forestStorage = generateStorage();
    }
    renderForest();
    renderStorage();
    showScreen('screen-forest');
    if (state.taskIndex === 2) nextTask();
}

// ============================================================
// КАРТА МИССИИ
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
        if (state.missionMap[neighbors[i]].owner === 'player') return true;
    }
    return false;
}

function getLocStatus(loc) {
    if (loc.owner === 'player') {
        if (loc.id === 'base' && !loc.baseBuilt) return 'построить базу';
        if (loc.id === 'field') return 'открыть поле';
        if (loc.id === 'forest') return 'открыть лес';
        return 'под контролем';
    }
    if (loc.scouted) return 'разведано';
    if (!isAdjacentToPlayer(loc)) return 'далеко';
    return 'туман войны';
}

function onLocClick(loc) {
    state.selectedLoc = loc;
    if (loc.owner !== 'player' && !loc.scouted && !isAdjacentToPlayer(loc)) return;

    const panel = document.getElementById('action-panel');
    const title = document.getElementById('action-title');
    const btns = document.getElementById('action-buttons');
    btns.innerHTML = '';

    title.textContent = (loc.scouted || loc.owner === 'player') ? loc.name : 'Неизвестная локация';

    if (loc.owner !== 'player' && !loc.scouted) {
        addActionBtn(btns, '🔍 Разведка (' + CONFIG.costs.scoutLoc + ' 🍞)', function() { scoutLoc(loc); }, state.resources.food >= CONFIG.costs.scoutLoc);
    } else if (loc.id === 'base' && !loc.baseBuilt) {
        addActionBtn(btns, '🏕️ Построить базу (' + CONFIG.costs.buildBase + ' 🪵)', function() { buildBase(loc); }, state.resources.wood >= CONFIG.costs.buildBase);
    } else if (loc.id === 'field' && loc.owner === 'player') {
        addActionBtn(btns, '🌾 Открыть поле', function() { closeActionPanel(); openField(); }, true);
    } else if (loc.id === 'forest' && loc.owner === 'player') {
        addActionBtn(btns, '🌲 Зайти в лес', function() { closeActionPanel(); openForest(); }, true);
        const summary = getForestSummary();
        if (summary) {
            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'font-size:12px; color:#b0a890; margin-bottom:8px; padding:6px; background:#2a2418; border-radius:4px;';
            infoDiv.textContent = '📦 ' + summary;
            btns.appendChild(infoDiv);
        }
    } else if (loc.owner === 'player') {
        addActionBtn(btns, '✅ Под контролем', function() {}, false);
    } else {
        addActionBtn(btns, '✅ Разведано', function() {}, false);
    }

    panel.classList.add('open');
}

function addActionBtn(container, label, onClick, enabled) {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = label;
    btn.disabled = !enabled;
    btn.onclick = onClick;
    container.appendChild(btn);
}

function getForestSummary() {
    if (state.forestStorage.length === 0) return null;
    const totals = {};
    for (let i = 0; i < state.forestStorage.length; i++) {
        const s = state.forestStorage[i];
        if (s.built && s.resource && s.resource !== 'nothing' && s.amount > 0) {
            totals[s.resource] = (totals[s.resource] || 0) + s.amount;
        }
    }
    const parts = [];
    const keys = Object.keys(totals);
    for (let i = 0; i < keys.length; i++) {
        const resId = keys[i];
        const res = RESOURCE_NAMES[resId];
        parts.push(res.icon + ' ' + totals[resId]);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
}

function scoutLoc(loc) {
    if (state.resources.food < CONFIG.costs.scoutLoc) return;
    state.resources.food -= CONFIG.costs.scoutLoc;
    loc.scouted = true;
    loc.owner = 'player';
    renderResources();
    renderMissionMap();
    closeActionPanel();
    if (state.taskIndex === 1) nextTask();
}

function buildBase(loc) {
    if (state.resources.wood < CONFIG.costs.buildBase) return;
    state.resources.wood -= CONFIG.costs.buildBase;
    loc.baseBuilt = true;
    renderResources();
    renderMissionMap();
    closeActionPanel();
    if (state.taskIndex === 0) nextTask();
}

// ============================================================
// ЛЕС
// ============================================================
function isAdjacentOpenForest(cell) {
    const cols = CONFIG.forest.cols;
    const rows = CONFIG.forest.rows;
    const neighbors = [];
    if (cell.col > 0)        neighbors.push(cell.index - 1);
    if (cell.col < cols - 1) neighbors.push(cell.index + 1);
    if (cell.row > 0)        neighbors.push(cell.index - cols);
    if (cell.row < rows - 1) neighbors.push(cell.index + cols);
    for (let i = 0; i < neighbors.length; i++) {
        if (state.forestMap[neighbors[i]].open) return true;
    }
    return false;
}

function onCellClick(cell) {
    if (!cell.open) {
        if (!isAdjacentOpenForest(cell)) {
            showModal('Нельзя открыть', 'Можно открывать только соседние клетки.');
            return;
        }
        if (state.resources.food < CONFIG.forest.unlockCost) {
            showModal('Нет еды', 'Недостаточно еды для разведки.');
            return;
        }
        state.resources.food -= CONFIG.forest.unlockCost;
        cell.open = true;
        renderResources();
        renderForest();
        return;
    }

    if (cell.type === 'empty' || cell.remaining <= 0) {
        showModal('Пустая клетка', 'Здесь нечего добывать.');
        return;
    }

    if (cell.worker) {
        showWorkerMenu(cell);
    } else {
        showGatherMenu(cell);
    }
}

function showGatherMenu(cell) {
    const res = FOREST_RESOURCES[cell.type];
    const html =
        '<div style="margin-bottom:10px; font-size:13px; color:#b0a890;">' +
        'Ресурс: ' + res.icon + '. Осталось: ' + cell.remaining + ' ед.' +
        '</div>' +
        '<button class="btn btn-primary" id="gather-btn">👷 Добывать</button>';

    showModal('Добыча', html);

    document.getElementById('gather-btn').onclick = function() {
        if (state.resources.peasants <= 0) {
            closeModal();
            showModal('Нет крестьян', 'Все крестьяне заняты.');
            return;
        }
        cell.worker = true;
        state.resources.peasants -= 1;
        renderResources();
        renderForest();
        closeModal();
        startGathering(cell);
        if (state.taskIndex === 4) nextTask();
    };
}

function showWorkerMenu(cell) {
    const html =
        '<div style="margin-bottom:10px; font-size:13px; color:#b0a890;">' +
        'Крестьянин работает. Осталось: ' + cell.remaining + ' ед.' +
        '</div>' +
        '<button class="btn" id="stop-btn">⏹️ Снять крестьянина</button>';

    showModal('Крестьянин', html);

    document.getElementById('stop-btn').onclick = function() {
        cell.worker = false;
        state.resources.peasants += 1;
        stopGathering(cell);
        renderResources();
        renderForest();
        closeModal();
    };
}

function startGathering(cell) {
    if (state.gatherTimers[cell.index]) return;

    state.gatherTimers[cell.index] = setInterval(function() {
        if (cell.remaining <= 0) {
            stopGathering(cell);
            cell.worker = false;
            state.resources.peasants += 1;
            cell.open = false;
            renderResources();
            renderForest();
            return;
        }

        const res = FOREST_RESOURCES[cell.type];
        if (!res) return;

        let gathered = false;
        for (let i = 0; i < res.gives.length; i++) {
            const resId = res.gives[i];
            let slot = null;
            for (let j = 0; j < state.forestStorage.length; j++) {
                const s = state.forestStorage[j];
                if (s.built && s.resource === resId && s.amount < s.capacity) {
                    slot = s; break;
                }
            }
            if (slot) {
                slot.amount += 1;
                gathered = true;
            }
        }

        if (gathered) {
            cell.remaining -= 1;
            renderStorage();
            renderForest();
        }
    }, CONFIG.forest.extractionTimeMs);
}

function stopGathering(cell) {
    if (state.gatherTimers[cell.index]) {
        clearInterval(state.gatherTimers[cell.index]);
        delete state.gatherTimers[cell.index];
    }
}

function onStorageClick(slot) {
    if (!slot.built) {
        const cost = CONFIG.storageCost[slot.index];
        const disabled = state.resources.wood < cost ? 'disabled' : '';
        const html =
            '<div style="margin-bottom:10px; font-size:13px; color:#b0a890;">' +
            'Построить склад за ' + cost + ' 🪵?' +
            '</div>' +
            '<button class="btn btn-primary" id="build-btn" ' + disabled + '>🏭 Построить склад</button>';

        showModal('Пустая ячейка', html);

        document.getElementById('build-btn').onclick = function() {
            if (state.resources.wood < cost) return;
            state.resources.wood -= cost;
            slot.built = true;
            slot.resource = 'nothing';
            slot.amount = 0;
            renderResources();
            renderStorage();
            closeModal();
            if (state.taskIndex === 3) nextTask();
        };
        return;
    }

    showStorageResourceMenu(slot);
}

function showStorageResourceMenu(slot) {
    let html = '<div style="margin-bottom:10px; font-size:13px; color:#b0a890;">Выберите ресурс:</div>';

    const keys = Object.keys(RESOURCE_NAMES);
    for (let i = 0; i < keys.length; i++) {
        const resId = keys[i];
        const res = RESOURCE_NAMES[resId];
        const selected = slot.resource === resId ? ' btn-primary' : '';
        html += '<button class="btn' + selected + '" data-res="' + resId + '">' + res.icon + ' ' + res.name + '</button>';
    }

    html += '<button class="btn btn-close" id="cancel-btn">Отмена</button>';

    showModal('Настройка склада', html);

    const buttons = document.querySelectorAll('#modal-body button[data-res]');
    for (let i = 0; i < buttons.length; i++) {
        buttons[i].onclick = function() {
            const resId = this.getAttribute('data-res');
            if (slot.resource !== resId) {
                slot.amount = 0;
            }
            slot.resource = resId;
            renderStorage();
            closeModal();
        };
    }

    document.getElementById('cancel-btn').onclick = closeModal;
}

// ============================================================
// ЗАПУСК
// ============================================================
renderEra();
renderResources();
