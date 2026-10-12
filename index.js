const CONFIG = {
    resources: {
        food: { name: 'Еда', icon: '🍞', start: 100 },
        wood: { name: 'Древесина', icon: '🪵', start: 100 },
        honey: { name: 'Мёд', icon: '🍯', start: 0 },
        wax: { name: 'Воск', icon: '🕯️', start: 0 },
        resin: { name: 'Смола', icon: '🪔', start: 0 },
        bark: { name: 'Кора', icon: '🪵', start: 0 },
        mushrooms: { name: 'Грибы', icon: '🍄', start: 0 },
        berries: { name: 'Ягоды', icon: '🫐', start: 0 },
        peasants: { name: 'Крестьяне', icon: '👷', start: 5 }
    },
    map: { cols: 4, rows: 5 },
    forest: {
        cols: 6,
        rows: 5,
        totalSquares: 30,
        resourceSquares: 21,
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

const state = {
    resources: {
        food: CONFIG.resources.food.start,
        wood: CONFIG.resources.wood.start,
        honey: CONFIG.resources.honey.start,
        wax: CONFIG.resources.wax.start,
        resin: CONFIG.resources.resin.start,
        bark: CONFIG.resources.bark.start,
        mushrooms: CONFIG.resources.mushrooms.start,
        berries: CONFIG.resources.berries.start,
        peasants: CONFIG.resources.peasants.start
    },
    currentEra: 0,
    currentRegion: null,
    currentMission: null,
    missionMap: [],
    forestMap: [],
    forestStorage: [],
    selectedLoc: null,
    gatherTimers: {}
};

const LOCATION_TYPES = [
    { id: 'field', name: 'Поле', icon: '🌾' },
    { id: 'forest', name: 'Лес', icon: '🌲' },
    { id: 'village', name: 'Село', icon: '🏘️' },
    { id: 'empty', name: 'Пустошь', icon: '⬜' }
];

const FOREST_RESOURCES = [
    { id: 'wood', icon: '🌲', gives: ['wood'] },
    { id: 'beehive', icon: '🐝', gives: ['honey', 'wax'] },
    { id: 'animals', icon: '🐗', gives: ['food'] },
    { id: 'resin', icon: '🪔', gives: ['resin'] },
    { id: 'bark', icon: '🌳', gives: ['bark'] },
    { id: 'mushrooms', icon: '🍄', gives: ['mushrooms'] },
    { id: 'berries', icon: '🫐', gives: ['berries'] }
];

const RESOURCE_LIST = [
    { id: 'wood', name: 'Древесина', icon: '🪵' },
    { id: 'honey', name: 'Мёд', icon: '🍯' },
    { id: 'wax', name: 'Воск', icon: '🕯️' },
    { id: 'food', name: 'Еда', icon: '🍞' },
    { id: 'resin', name: 'Смола', icon: '🪔' },
    { id: 'bark', name: 'Кора', icon: '🪵' },
    { id: 'mushrooms', name: 'Грибы', icon: '🍄' },
    { id: 'berries', name: 'Ягоды', icon: '🫐' },
    { id: 'nothing', name: 'Ничего', icon: '⛔' }
];

function generateMissionMap() {
    const { cols, rows } = CONFIG.map;
    const total = cols * rows;
    const locs = [];
    const baseIndex = (rows - 1) * cols + 0;

    const guaranteed = ['field', 'forest', 'village'];
    const types = [];
    guaranteed.forEach(t => types.push(t));
    while (types.length < total - 1) {
        const t = LOCATION_TYPES[Math.floor(Math.random() * LOCATION_TYPES.length)].id;
        types.push(t);
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
            baseBuilt: false
        });
    }
    return locs;
}

function generateForestMap() {
    const total = CONFIG.forest.totalSquares;
    const cells = [];

    // Собираем список типов: 21 ресурсная + 9 пустых
    const types = [];
    FOREST_RESOURCES.forEach(res => {
        for (let i = 0; i < 3; i++) types.push(res.id);
    });
    while (types.length < total) types.push('empty');

    // Перемешиваем
    for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
    }

    // Стартовая клетка — левый нижний угол (индекс 30? нет — 30 клеток: 0..29)
    // Сетка 6 колонок × 5 строк. Индекс = row * 6 + col
    // Левый нижний: row=4, col=0 → индекс 24
    const startIndex = 4 * CONFIG.forest.cols + 0;

    for (let i = 0; i < total; i++) {
        const col = i % CONFIG.forest.cols;
        const row = Math.floor(i / CONFIG.forest.cols);
        const typeId = types[i];
        const isStart = i === startIndex;
        cells.push({
            index: i,
            col, row,
            open: isStart,
            type: typeId,
            remaining: typeId !== 'empty' ? CONFIG.forest.amountPerSquare : 0,
            worker: false,
            workerId: null
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

function isAdjacentToPlayer(loc) {
    const { cols, rows } = CONFIG.map;
    const neighbors = [];
    if (loc.col > 0)        neighbors.push(loc.index - 1);
    if (loc.col < cols - 1) neighbors.push(loc.index + 1);
    if (loc.row > 0)        neighbors.push(loc.index - cols);
    if (loc.row < rows - 1) neighbors.push(loc.index + cols);
    return neighbors.some(idx => state.missionMap[idx].owner === 'player');
}

function isAdjacentOpenForest(cell) {
    const { cols, rows } = CONFIG.forest;
    const neighbors = [];
    if (cell.col > 0)        neighbors.push(cell.index - 1);
    if (cell.col < cols - 1) neighbors.push(cell.index + 1);
    if (cell.row > 0)        neighbors.push(cell.index - cols);
    if (cell.row < rows - 1) neighbors.push(cell.index + cols);
    return neighbors.some(idx => state.forestMap[idx].open);
}

function renderResources() {
    document.getElementById('r-food').textContent = state.resources.food;
    document.getElementById('r-wood').textContent = state.resources.wood;
    document.getElementById('r-honey').textContent = state.resources.honey;
    document.getElementById('r-wax').textContent = state.resources.wax;
    document.getElementById('r-peasants').textContent = state.resources.peasants;
}

function log(msg) {
    const el = document.getElementById('log');
    const div = document.createElement('div');
    div.textContent = '▸ ' + msg;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function toggleMenu() {
    document.getElementById('menu-panel').classList.toggle('open');
}

function showSettings() { toggleMenu(); showModal('Настройки', 'Раздел в разработке.'); }
function showSave() { toggleMenu(); showModal('Сохранение', 'Сохранение в разработке.'); }
function showExit() { toggleMenu(); showModal('Выход', 'Выход в разработке.'); }

function showModal(title, body) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal').classList.add('open');
}

function closeModal() {
    document.getElementById('modal').classList.remove('open');
}

function renderEra() {
    const era = CONFIG.eras[state.currentEra];
    document.getElementById('era-title').textContent = era.title;
    const cont = document.getElementById('era-regions');
    cont.innerHTML = '';
    era.regions.forEach(region => {
        const div = document.createElement('div');
        div.className = 'region-card' + (region.unlocked ? '' : ' locked');
        div.innerHTML = `
      <div class="rc-title">${region.title}</div>
      <div class="rc-desc">${region.desc}</div>
    `;
        if (region.unlocked) {
            div.onclick = () => openRegion(region.id);
        }
        cont.appendChild(div);
    });
    showScreen('screen-era');
}

function openRegion(regionId) {
    const era = CONFIG.eras[state.currentEra];
    const region = era.regions.find(r => r.id === regionId);
    state.currentRegion = region;

    const completed = region.missions.filter(m => m.completed).length;
    document.getElementById('region-info-short').textContent =
        `${region.title} · ${completed}/${region.missions.length} миссий`;

    const missionsCont = document.getElementById('region-missions');
    missionsCont.innerHTML = '';
    region.missions.forEach(mission => {
        const div = document.createElement('div');
        div.className = 'mission-card' + (mission.unlocked ? '' : ' locked');
        const status = mission.completed ? '✅ Пройдена' : (mission.unlocked ? '▶ Доступна' : '🔒 Закрыта');
        div.innerHTML = `
      <div class="mc-title">${mission.title}</div>
      <div class="mc-status">${status}</div>
    `;
        if (mission.unlocked && !mission.completed) {
            div.onclick = () => openMission(mission.id);
        }
        missionsCont.appendChild(div);
    });

    showScreen('screen-region');
}

function toggleRegionInfo() {
    document.getElementById('region-info-full').classList.toggle('open');
}

function backToRegion() {
    renderEra();
}

function openMission(missionId) {
    state.currentMission = missionId;
    state.missionMap = generateMissionMap();
    state.forestMap = [];
    state.forestStorage = [];
    state.gatherTimers = {};
    document.getElementById('mission-task-text').textContent = '📜 Построить базу';
    renderMissionMap();
    showScreen('screen-mission');
    log('Миссия началась. Постройте базу.');
}

function renderMissionMap() {
    const cont = document.getElementById('mission-map');
    cont.innerHTML = '';
    const sorted = [...state.missionMap].sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return a.col - b.col;
    });
    sorted.forEach(loc => {
        const div = document.createElement('div');
        div.className = 'loc';
        if (!loc.scouted && loc.owner !== 'player') div.classList.add('fog');
        if (loc.owner === 'player') div.classList.add('player');
        if (loc.owner !== 'player' && !loc.scouted && !isAdjacentToPlayer(loc)) {
            div.classList.add('locked');
        }
        const showInfo = loc.scouted || loc.owner === 'player';
        div.innerHTML = `
      <div class="loc-icon">${showInfo ? loc.icon : '❓'}</div>
      <div class="loc-name">${showInfo ? loc.name : '???'}</div>
      <div class="loc-status">${getLocStatus(loc)}</div>
    `;
        div.onclick = () => onLocClick(loc);
        cont.appendChild(div);
    });
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

    if (loc.owner !== 'player' && !loc.scouted && !isAdjacentToPlayer(loc)) {
        log('Слишком далеко.');
        return;
    }

    const panel = document.getElementById('action-panel');
    const title = document.getElementById('action-title');
    const btns = document.getElementById('action-buttons');
    btns.innerHTML = '';

    title.textContent = (loc.scouted || loc.owner === 'player') ? loc.name : 'Неизвестная локация';

    if (loc.owner !== 'player' && !loc.scouted) {
        addActionBtn(btns, `🔍 Разведка (${CONFIG.costs.scoutLoc} 🍞)`, () => scoutLoc(loc), state.resources.food >= CONFIG.costs.scoutLoc);
    } else if (loc.id === 'base' && !loc.baseBuilt) {
        addActionBtn(btns, `🏕️ Построить базу (${CONFIG.costs.buildBase} 🪵)`, () => buildBase(loc), state.resources.wood >= CONFIG.costs.buildBase);
    } else if (loc.id === 'field' && loc.owner === 'player') {
        addActionBtn(btns, '🌾 Открыть поле', () => { closeActionPanel(); openField(); }, true);
    } else if (loc.id === 'forest' && loc.owner === 'player') {
        addActionBtn(btns, '🌲 Зайти в лес', () => { closeActionPanel(); openForest(); }, true);
        const summary = getForestSummary();
        if (summary) {
            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'font-size:12px; color:#b0a890; margin-bottom:8px; padding:6px; background:#2a2418; border-radius:4px;';
            infoDiv.textContent = '📦 ' + summary;
            btns.appendChild(infoDiv);
        }
    } else if (loc.owner === 'player') {
        addActionBtn(btns, '✅ Под контролем', () => {}, false);
    } else {
        addActionBtn(btns, '✅ Разведано', () => {}, false);
    }

    panel.classList.add('open');
}

function getForestSummary() {
    if (state.forestStorage.length === 0) return null;
    const totals = {};
    state.forestStorage.forEach(s => {
        if (s.built && s.resource && s.resource !== 'nothing' && s.amount > 0) {
            totals[s.resource] = (totals[s.resource] || 0) + s.amount;
        }
    });
    const parts = Object.entries(totals).map(([resId, amount]) => {
        const res = RESOURCE_LIST.find(r => r.id === resId);
        return `${res.icon} ${amount}`;
    });
    return parts.length > 0 ? parts.join(' · ') : null;
}

function addActionBtn(container, label, onClick, enabled) {
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

function scoutLoc(loc) {
    if (state.resources.food < CONFIG.costs.scoutLoc) { log('Недостаточно еды.'); return; }
    state.resources.food -= CONFIG.costs.scoutLoc;
    loc.scouted = true;
    loc.owner = 'player';
    renderResources();
    renderMissionMap();
    closeActionPanel();
    log(`Разведана локация «${loc.name}».`);
}

function buildBase(loc) {
    if (state.resources.wood < CONFIG.costs.buildBase) { log('Недостаточно древесины.'); return; }
    state.resources.wood -= CONFIG.costs.buildBase;
    loc.baseBuilt = true;
    renderResources();
    renderMissionMap();
    closeActionPanel();
    log('База построена!');
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
    log('Лес открыт. Открывайте клетки и назначайте крестьян.');
}

function renderForest() {
    const cont = document.getElementById('forest-grid');
    cont.innerHTML = '';
    state.forestMap.forEach(cell => {
        const div = document.createElement('div');
        div.className = 'cell';
        if (!cell.open) {
            div.classList.add('fog');
            div.textContent = '🌫️';
        } else if (cell.type !== 'empty' && cell.remaining > 0) {
            const resDef = FOREST_RESOURCES.find(r => r.id === cell.type);
            div.classList.add(cell.worker ? 'worker' : 'building');
            div.textContent = resDef.icon;
            const amount = document.createElement('div');
            amount.className = 'cell-amount';
            amount.textContent = cell.remaining;
            div.appendChild(amount);
        }
        div.onclick = () => onForestCellClick(cell);
        cont.appendChild(div);
    });
}

function renderStorage() {
    const cont = document.getElementById('forest-storage');
    cont.innerHTML = '';
    state.forestStorage.forEach(slot => {
        const div = document.createElement('div');
        div.className = 'storage-slot';
        if (slot.built) div.classList.add('built');
        if (slot.built) {
            const res = RESOURCE_LIST.find(r => r.id === slot.resource) || RESOURCE_LIST[8];
            div.innerHTML = `
        <div class="st-icon">${res.icon}</div>
        <div class="st-amount">${slot.amount}/${slot.capacity}</div>
        <div class="st-label">${res.name}</div>
      `;
        } else {
            const cost = CONFIG.storageCost[slot.index];
            div.innerHTML = `<div class="st-amount">${cost}🪵</div>`;
        }
        div.onclick = () => onStorageClick(slot);
        cont.appendChild(div);
    });
}

function onForestCellClick(cell) {
    if (!cell.open) {
        if (!isAdjacentOpenForest(cell)) { log('Можно открывать только соседние клетки.'); return; }
        if (state.resources.food < CONFIG.forest.unlockCost) { log('Недостаточно еды.'); return; }
        state.resources.food -= CONFIG.forest.unlockCost;
        cell.open = true;
        renderResources();
        renderForest();
        return;
    }

    if (cell.type === 'empty' || cell.remaining <= 0) {
        log('Пустая клетка.');
        return;
    }

    if (cell.worker) {
        const body = document.getElementById('modal-body');
        body.innerHTML = '';
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = '⏹️ Снять крестьянина';
        btn.onclick = () => {
            cell.worker = false;
            if (cell.workerId !== null) {
                state.resources.peasants += 1;
            }
            cell.workerId = null;
            stopGathering(cell);
            renderResources();
            renderForest();
            closeModal();
            log('Крестьянин снят.');
        };
        body.appendChild(btn);
        showModal('Крестьянин работает', `Осталось: ${cell.remaining}`);
        return;
    }

    if (state.resources.peasants <= 0) {
        showModal('Нет крестьян', 'Все крестьяне заняты. Дождитесь освобождения или захватите новое село.');
        return;
    }

    const resDef = FOREST_RESOURCES.find(r => r.id === cell.type);
    const body = document.getElementById('modal-body');
    body.innerHTML = '';
    const info = document.createElement('div');
    info.style.cssText = 'margin-bottom:10px; font-size:13px; color:#b0a890;';
    info.textContent = `Ресурс: ${resDef.icon}. Осталось: ${cell.remaining} ед.`;
    body.appendChild(info);

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = '👷 Добывать';
    btn.onclick = () => {
        cell.worker = true;
        state.resources.peasants -= 1;
        renderResources();
        renderForest();
        closeModal();
        startGathering(cell);
        log('Крестьянин назначен. Добыча началась.');
    };
    body.appendChild(btn);
    showModal('Добыча', '');
}

function startGathering(cell) {
    if (state.gatherTimers[cell.index]) return;
    state.gatherTimers[cell.index] = setInterval(() => {
        if (cell.remaining <= 0) {
            stopGathering(cell);
            cell.worker = false;
            cell.workerId = null;
            state.resources.peasants += 1;
            cell.open = false;
            renderResources();
            renderForest();
            log('Ресурс закончился. Крестьянин ушёл, квадрат закрыт.');
            return;
        }

        const resDef = FOREST_RESOURCES.find(r => r.id === cell.type);
        let gathered = false;

        resDef.gives.forEach(resId => {
            const slot = state.forestStorage.find(s => s.built && s.resource === resId && s.amount < s.capacity);
            if (slot) {
                slot.amount += 1;
                gathered = true;
            }
        });

        if (gathered) {
            cell.remaining -= 1;
            renderStorage();
            renderForest();
        } else {
            log('Склад заполнен. Добыча на паузе.');
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
    const body = document.getElementById('modal-body');
    body.innerHTML = '';

    if (!slot.built) {
        const cost = CONFIG.storageCost[slot.index];
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.textContent = `🏭 Построить склад (${cost} 🪵)`;
        btn.disabled = state.resources.wood < cost;
        btn.onclick = () => {
            state.resources.wood -= cost;
            slot.built = true;
            slot.resource = 'nothing';
            slot.amount = 0;
            renderResources();
            renderStorage();
            closeModal();
            log('Склад построен.');
        };
        body.appendChild(btn);
        showModal('Пустая ячейка', '');
        return;
    }

    const title = document.createElement('div');
    title.style.cssText = 'margin-bottom:10px; font-size:13px; color:#b0a890;';
    title.textContent = 'Выберите ресурс для хранения:';
    body.appendChild(title);

    RESOURCE_LIST.forEach(res => {
        const btn = document.createElement('button');
        btn.className = 'btn' + (slot.resource === res.id ? ' btn-primary' : '');
        btn.textContent = `${res.icon} ${res.name}`;
        btn.onclick = () => {
            if (slot.resource !== res.id) {
                slot.amount = 0;
            }
            slot.resource = res.id;
            renderStorage();
            closeModal();
            log(`Склад: выбран ресурс «${res.name}».`);
        };
        body.appendChild(btn);
    });

    if (slot.amount > 0) {
        const info = document.createElement('div');
        info.style.cssText = 'margin-top:10px; font-size:12px; color:#f0d060;';
        info.textContent = `На складе: ${slot.amount} ед.`;
        body.appendChild(info);
    }

    showModal('Настройка склада', '');
}

function backToMission() {
    renderMissionMap();
    showScreen('screen-mission');
}

renderEra();
renderResources();
