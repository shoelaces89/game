const CONFIG = {
    resources: {
        food: { name: 'Еда', icon: '🍞', start: 100 },
        wood: { name: 'Древесина', icon: '🪵', start: 100 },
        gold: { name: 'Золото', icon: '🪙', start: 100 }
    },
    map: { cols: 4, rows: 5 },
    miniMap: { cols: 6, rows: 5 },
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
        gold: CONFIG.resources.gold.start
    },
    currentEra: 0,
    currentRegion: null,
    currentMission: null,
    missionMap: [],
    fieldMap: [],
    forestMap: [],
    selectedLoc: null,
    missionStarted: false
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

function generateMiniMap() {
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

function isAdjacentToPlayer(loc) {
    const { cols, rows } = CONFIG.map;
    const neighbors = [];
    if (loc.col > 0)        neighbors.push(loc.index - 1);
    if (loc.col < cols - 1) neighbors.push(loc.index + 1);
    if (loc.row > 0)        neighbors.push(loc.index - cols);
    if (loc.row < rows - 1) neighbors.push(loc.index + cols);
    return neighbors.some(idx => state.missionMap[idx].owner === 'player');
}

function renderResources() {
    document.getElementById('r-food').textContent = state.resources.food;
    document.getElementById('r-wood').textContent = state.resources.wood;
    document.getElementById('r-gold').textContent = state.resources.gold;
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
    state.missionStarted = true;

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
        addActionBtn(btns, '🔍 Разведка (2 🍞)', () => scoutLoc(loc), state.resources.food >= 2);
    } else if (loc.id === 'base' && !loc.baseBuilt) {
        addActionBtn(btns, '🏕️ Построить базу (5 🪵)', () => buildBase(loc), state.resources.wood >= 5);
    } else if (loc.id === 'field' && loc.owner === 'player') {
        addActionBtn(btns, '🌾 Открыть поле', () => { closeActionPanel(); openField(); }, true);
    } else if (loc.id === 'forest' && loc.owner === 'player') {
        addActionBtn(btns, '🌲 Открыть лес', () => { closeActionPanel(); openForest(); }, true);
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

function scoutLoc(loc) {
    if (state.resources.food < 2) { log('Недостаточно еды.'); return; }
    state.resources.food -= 2;
    loc.scouted = true;
    loc.owner = 'player';
    renderResources();
    renderMissionMap();
    closeActionPanel();
    log(`Разведана локация «${loc.name}».`);
}

function buildBase(loc) {
    if (state.resources.wood < 5) { log('Недостаточно древесины.'); return; }
    state.resources.wood -= 5;
    loc.baseBuilt = true;
    renderResources();
    renderMissionMap();
    closeActionPanel();
    log('База построена!');
}

function openField() {
    state.fieldMap = generateMiniMap();
    renderField();
    showScreen('screen-field');
}

function renderField() {
    const cont = document.getElementById('field-grid');
    cont.innerHTML = '';
    state.fieldMap.forEach(cell => {
        const div = document.createElement('div');
        div.className = 'cell';
        if (cell.fog) { div.classList.add('fog'); div.textContent = '🌫️'; }
        else if (cell.type !== 'empty') {
            const t = CELL_TYPES[cell.type];
            div.classList.add(t.class);
            div.textContent = t.icon;
        }
        div.onclick = () => onFieldCellClick(cell);
        cont.appendChild(div);
    });
}

function onFieldCellClick(cell) {
    if (cell.fog) {
        if (state.resources.food < 1) { log('Недостаточно еды.'); return; }
        state.resources.food -= 1;
        cell.fog = false;
        renderResources();
        renderField();
        log('Клетка разведана.');
        return;
    }
    if (cell.type === 'empty') {
        showModal('Клетка', 'Что построить?', '');
        const body = document.getElementById('modal-body');
        body.innerHTML = '';
        const btn1 = document.createElement('button');
        btn1.className = 'btn';
        btn1.textContent = '🏚️ Амбар';
        btn1.onclick = () => { cell.type = 'granary'; renderField(); closeModal(); };
        const btn2 = document.createElement('button');
        btn2.className = 'btn';
        btn2.textContent = '🌱 Грядка';
        btn2.onclick = () => { cell.type = 'field'; renderField(); closeModal(); };
        body.appendChild(btn1);
        body.appendChild(btn2);
        return;
    }
    if (cell.type === 'field' && !cell.ready) {
        cell.ready = true;
        renderField();
        log('Грядка созрела.');
    }
}

function backToMission() {
    renderMissionMap();
    showScreen('screen-mission');
}

function openForest() {
    state.forestMap = generateMiniMap();
    renderForest();
    showScreen('screen-forest');
}

function renderForest() {
    const cont = document.getElementById('forest-grid');
    cont.innerHTML = '';
    state.forestMap.forEach(cell => {
        const div = document.createElement('div');
        div.className = 'cell';
        if (cell.fog) { div.classList.add('fog'); div.textContent = '🌫️'; }
        else if (cell.type !== 'empty') {
            const t = CELL_TYPES[cell.type];
            div.classList.add(t.class);
            div.textContent = t.icon;
        }
        div.onclick = () => onForestCellClick(cell);
        cont.appendChild(div);
    });
}

function onForestCellClick(cell) {
    if (cell.fog) {
        if (state.resources.food < 1) { log('Недостаточно еды.'); return; }
        state.resources.food -= 1;
        cell.fog = false;
        renderResources();
        renderForest();
        log('Клетка разведана.');
        return;
    }
    if (cell.type === 'empty') {
        cell.type = 'warehouse';
        renderForest();
        log('Склад построен.');
        return;
    }
    if (cell.type === 'warehouse') {
        cell.ready = true;
        renderForest();
        log('Склад заполнен.');
    }
}

renderEra();
renderResources();
