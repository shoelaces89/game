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
    resourceMin: 20,
    resourceMax: 70,
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

function randResource() {
    return Math.floor(Math.random() * (CONFIG.resourceMax - CONFIG.resourceMin + 1)) + CONFIG.resourceMin;
}

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

        if (rand < 0.55) {
            type = 'wood'; resource = 'wood';
        } else if (rand < 0.7) {
            type = 'beehive'; resource = 'beehive';
        }

        const isStart = (col === 0 && row === rows - 1);
        cells.push({
            index: i, col, row,
            open: isStart,
            type: type,
            resource: resource,
            remaining: type !== 'empty' ? randResource() : 0,
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
        cells.push({ index: i, type: 'empty', fog: isFog, ready: false });
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
    state.fieldMap = generateFieldMap();
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
        if (state.resources.food < CONFIG.costs.openCell) { log('Недостаточно еды.'); return; }
        state.resources.food -= CONFIG.costs.openCell;
        cell.fog = false;
        renderResources();
        renderField();
        return;
    }
    if (cell.type === 'empty') {
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
        showModal('Клетка', '');
        return;
    }
    if (cell.type === 'field' && !cell.ready) {
        cell.ready = true;
        renderField();
        log('Грядка созрела.');
    }
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
        } else if (cell.type === 'wood' && cell.remaining > 0) {
            div.classList.add(cell.worker ? 'worker' : 'building');
            div.textContent = '🌲';
            const amount = document.createElement('div');
            amount.className = 'cell-amount';
            amount.textContent = cell.remaining;
            div.appendChild(amount);
        } else if (cell.type === 'beehive' && cell.remaining > 0) {
            div.classList.add(cell.worker ? 'worker' : 'building');
            div.textContent = '🐝';
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
            const res = RESOURCE_LIST.find(r => r.id === slot.resource) || RESOURCE_LIST[3];
            div.innerHTML = `
        <div class="st-icon">${res.icon}</div>
        <div class="st-amount">${slot.amount}/${slot.capacity}</div>
        <div class="st-label">${res.name}</div>
      `;
        }
        div.onclick = () => onStorageClick(slot);
        cont.appendChild(div);
    });
}

function onForestCellClick(cell) {
    if (!cell.open) {
        if (!isAdjacentOpenForest(cell)) { log('Можно открывать только соседние клетки.'); return; }
        if (state.resources.food < CONFIG.costs.openCell) { log('Недостаточно еды.'); return; }
        state.resources.food -= CONFIG.costs.openCell;
        cell.open = true;
        renderResources();
        renderForest();
        return;
    }

    if (cell.type === 'empty' || cell.remaining <= 0) {
        log('Пустая клетка.');
        return;
    }

    if (!cell.worker) {
        const body = document.getElementById('modal-body');
        body.innerHTML = '';
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.textContent = '👷 Назначить крестьянина';
        btn.onclick = () => {
            cell.worker = true;
            renderForest();
            closeModal();
            startGathering(cell);
            log('Крестьянин назначен. Добыча началась.');
        };
        body.appendChild(btn);
        showModal('Крестьянин', '');
        return;
    }

    const body = document.getElementById('modal-body');
    body.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = '⏹️ Снять крестьянина';
    btn.onclick = () => {
        cell.worker = false;
        stopGathering(cell);
        renderForest();
        closeModal();
        log('Крестьянин снят.');
    };
    body.appendChild(btn);
    showModal('Крестьянин работает', `Осталось: ${cell.remaining}`);
}

function startGathering(cell) {
    if (state.gatherTimers[cell.index]) return;
    state.gatherTimers[cell.index] = setInterval(() => {
        if (cell.remaining <= 0) {
            stopGathering(cell);
            cell.worker = false;
            renderForest();
            log('Ресурс закончился. Крестьянин ушёл.');
            return;
        }

        const resources = cell.type === 'wood' ? ['wood'] : ['honey', 'wax'];
        let gathered = false;

        resources.forEach(resId => {
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
            log('Нет свободного места в складах.');
        }
    }, CONFIG.gatherIntervalMs);
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
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.textContent = `🏭 Построить склад (${CONFIG.costs.buildStorage} 🪵)`;
        btn.disabled = state.resources.wood < CONFIG.costs.buildStorage;
        btn.onclick = () => {
            state.resources.wood -= CONFIG.costs.buildStorage;
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
