const CONFIG = {
    resources: {
        food: { name: 'Еда', icon: '🍞', start: 100 },
        wood: { name: 'Древесина', icon: '🪵', start: 100 },
        honey: { name: 'Мёд', icon: '🍯', start: 0 },
        wax: { name: 'Воск', icon: '🕯️', start: 0 }
    },
    map: { cols: 4, rows: 5 },
    miniMap: { cols: 6, rows: 5 },
    storageSlots: 5,
    maxResourcePerCell: 25,
    storageCapacity: 100,
    gatherIntervalMs: 10000,
    costs: {
        scoutLoc: 2,
        buildBase: 5,
        openCell: 1,
        buildStorage: 5
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
        wax: CONFIG.resources.wax.start
    },
    currentEra: 0,
    currentRegion: null,
    currentMission: null,
    missionMap: [],
    fieldMap: [],
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

const CELL_TYPES = {
    empty: { icon: '', class: '' },
    granary: { icon: '🏚️', class: 'building' },
    field: { icon: '🌱', class: 'building' },
    warehouse: { icon: '🏭', class: 'building' },
    stump: { icon: '🪵', class: 'ready' }
};

const RESOURCE_LIST = [
    { id: 'wood', name: 'Древесина', icon: '🪵' },
    { id: 'honey', name: 'Мёд', icon: '🍯' },
    { id: 'wax', name: 'Воск', icon: '🕯️' },
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
    const { cols, rows } = CONFIG.miniMap;
    const total = cols * rows;
    const cells = [];
    for (let i = 0; i < total; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const rand = Math.random();
        let type = 'empty';
        let resource = null;
        let hasResource = false;

        if (rand < 0.35) {
            type = 'wood'; hasResource = true; resource = 'wood';
        } else if (rand < 0.45) {
            type = 'beehive'; hasResource = true; resource = 'beehive';
        }

        const isStart = (col === 0 && row === rows - 1);
        cells.push({
            index: i,
            col, row,
            open: isStart,
            type: type,
            hasResource: hasResource,
            resource: resource,
            remaining: hasResource ? CONFIG.maxResourcePerCell : 0,
            worker: false
        });
    }
    return cells;
}

function generateFieldMap() {
    const { cols, rows } = CONFIG.miniMap;
    const total = cols * rows;
    const cells = [];
    for (let i = 0; i < total; i++) {
        const isFog = Math.random() < 0.6;
        cells.push({
            index: i,
            type: 'empty',
            fog: isFog,
            ready: false
        });
    }
    return cells;
}

function generateStorage() {
    const slots = [];
    for (let i = 0; i < CONFIG.storageSlots; i++) {
        slots.push({
            index: i,
            built: false,
            resource: null,
            amount: 0,
            capacity: CONFIG.storageCapacity
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
    const { cols, rows } = CONFIG.miniMap;
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
        addActionBtn(btns, '🌲 Открыть лес', () => { closeActionPanel(); openForest(); }, true);
        if (state.forestStorage.length > 0) {
            const info = state.forestStorage
                .filter(s => s.built && s.resource && s.resource !== 'nothing' && s.amount > 0)
                .map(s => {
                    const res = RESOURCE_LIST.find(r => r.id === s.resource);
                    return `${res.icon} ${s.amount}/${s.capacity}`;
                }).join(' · ');
            if (info) {
                addActionBtn(btns, `📦 ${info}`, () => {}, false);
            }
        }
    } else if (loc.owner === 'player') {
        addActionBtn(btns, '✅ Под контролем', () => {}, false);
    } else {
        addActionBtn(btns, '✅ Разведано', () => {}, false);
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

function closeActionPanel() {
    document.getElementById('action-panel').classList.remove('open');
}

function
