const CONFIG = {
    resources: {
        food: { name: 'Еда', icon: '🍞', start: 500 },
        wood: { name: 'Древесина', icon: '🪵', start: 500 },
        gold: { name: 'Золото', icon: '🪙', start: 500 }
    },
    costs: {
        buildBase: { food: 3, wood: 2 },
        scout: { food: 1 },
        annex: { food: 2, wood: 1 }
    },
    patriot: {
        start: 100,
        max: 100,
        decayPerTick: 1,
        tickMs: 10000,
        revoltThreshold: 0
    },
    map: {
        cols: 4,
        rows: 5,
        cellSize: 100
    },
    tasks: [
        { id: 'base', text: 'Построить базу' },
        { id: 'scout', text: 'Провести разведку местности' },
        { id: 'food5', text: 'Произвести еду ×5' },
        { id: 'wood5', text: 'Добыть древесину ×5' },
        { id: 'buildVillage', text: 'Построить здание в селе' },
        { id: 'buildCity', text: 'Построить здание в городе' },
        { id: 'semiProduct', text: 'Произвести полуфабрикат в селе' },
        { id: 'product', text: 'Произвести товар в городе' }
    ]
};

const state = {
    resources: {
        food: CONFIG.resources.food.start,
        wood: CONFIG.resources.wood.start,
        gold: CONFIG.resources.gold.start
    },
    patriot: CONFIG.patriot.start,
    tasks: {},
    locations: [],
    selectedLoc: null,
    gameOver: false,
    patriotTimer: null
};

const LOCATION_TYPES = [
    { id: 'field', name: 'Поле', icon: '🌾' },
    { id: 'forest', name: 'Лес', icon: '🌲' },
    { id: 'village', name: 'Село', icon: '🏘️' },
    { id: 'empty', name: 'Пустошь', icon: '⬜' }
];

function generateMap() {
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
            index: i,
            col, row,
            id, name, icon,
            owner: i === baseIndex ? 'player' : 'none',
            scouted: i === baseIndex,
            baseBuilt: false,
            buildingBuilt: false
        });
    }
    return locs;
}

function isAdjacentToPlayer(loc) {
    const { cols, rows } = CONFIG.map;
    const neighbors = [];
    if (loc.col > 0)        neighbors.push(loc.index - 1);
    if (loc.col < cols - 1) neighbors.push(loc.index + 1);
    if (loc.row > 0)        neighbors.push(loc.index - cols);
    if (loc.row < rows - 1) neighbors.push(loc.index + cols);

    return neighbors.some(idx => state.locations[idx].owner === 'player');
}

function initState() {
    state.resources = {
        food: CONFIG.resources.food.start,
        wood: CONFIG.resources.wood.start,
        gold: CONFIG.resources.gold.start
    };
    state.patriot = CONFIG.patriot.start;
    state.tasks = {};
    CONFIG.tasks.forEach(t => state.tasks[t.id] = false);
    state.locations = generateMap();
    state.selectedLoc = null;
    state.gameOver = false;
    renderResources();
    renderMap();
    renderCurrentTask();
}

function renderResources() {
    document.getElementById('r-food').textContent = state.resources.food;
    document.getElementById('r-wood').textContent = state.resources.wood;
    document.getElementById('r-gold').textContent = state.resources.gold;
    document.getElementById('r-patriot').textContent = state.patriot;
    const pct = (state.patriot / CONFIG.patriot.max) * 100;
    document.getElementById('patriot-fill').style.width = pct + '%';
}

function renderCurrentTask() {
    const current = CONFIG.tasks.find(t => !state.tasks[t.id]);
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
    const sorted = [...state.locations].sort((a, b) => {
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
        div.onclick = () => onLocationClick(loc);
        grid.appendChild(div);
    });
}

function getLocStatus(loc) {
    if (loc.owner === 'player') {
        if (loc.id === 'base' && !loc.baseBuilt) return 'нужно построить базу';
        return 'под контролем';
    }
    if (loc.scouted) return 'разведано';
    if (!isAdjacentToPlayer(loc)) return 'далеко';
    return 'туман войны';
}

function log(msg) {
    const el = document.getElementById('log');
    const div = document.createElement('div');
    div.textContent = '▸ ' + msg;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
}

function onLocationClick(loc) {
    if (state.gameOver) return;

    if (loc.owner !== 'player' && !loc.scouted && !isAdjacentToPlayer(loc)) {
        log('Слишком далеко. Сначала разведайте соседние земли.');
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
        addBtn(btns, `Разведка (${costStr(CONFIG.costs.scout)})`, () => scoutLocation(loc), canAfford(CONFIG.costs.scout));
    } else if (loc.owner !== 'player') {
        desc.textContent = `Локация «${loc.name}» разведана. Присоедините её к своим землям.`;
        addBtn(btns, `Присоединить (${costStr(CONFIG.costs.annex)})`, () => annexLocation(loc), canAfford(CONFIG.costs.annex));
    } else {
        if (loc.id === 'base' && !loc.baseBuilt) {
            desc.textContent = 'Здесь будет ваша главная база. Постройте её, чтобы начать.';
            addBtn(btns, `Построить базу (${costStr(CONFIG.costs.buildBase)})`, () => buildBase(loc), canAfford(CONFIG.costs.buildBase));
        } else if (loc.id === 'village' && !loc.buildingBuilt) {
            desc.textContent = 'В селе можно построить производственное здание.';
            addBtn(btns, 'Построить здание (2 🪵)', () => buildInVillage(loc), state.resources.wood >= 2);
        } else if (loc.id === 'field') {
            desc.textContent = 'Поле готово к производству еды. (Заглушка: поле — в следующих правках.)';
        } else if (loc.id === 'forest') {
            desc.textContent = 'Лес готов к добыче древесины. (Заглушка: лес — в следующих правках.)';
        } else if (loc.id === 'empty') {
            desc.textContent = 'Пустошь. Здесь пока нечего делать.';
        } else {
            desc.textContent = 'Локация под вашим контролем.';
        }
    }

    panel.classList.add('open');
}

function addBtn(container, label, onClick, enabled) {
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

function scoutLocation(loc) {
    if (!spend(CONFIG.costs.scout)) return;
    loc.scouted = true;
    loc.owner = 'player';
    log(`Разведана и присоединена локация «${loc.name}».`);
    checkTask('scout', true);
    closeActionPanel();
    renderMap();
    renderResources();
    renderCurrentTask();
    checkVictory();
}

function annexLocation(loc) {
    if (!spend(CONFIG.costs.annex)) return;
    loc.owner = 'player';
    log(`Локация «${loc.name}» присоединена.`);
    closeActionPanel();
    renderMap();
    renderResources();
}

function buildBase(loc) {
    if (!spend(CONFIG.costs.buildBase)) return;
    loc.baseBuilt = true;
    log('База построена!');
    checkTask('base', true);
    closeActionPanel();
    renderMap();
    renderResources();
    renderCurrentTask();
    checkVictory();
}

function buildInVillage(loc) {
    if (state.resources.wood < 2) return;
    state.resources.wood -= 2;
    loc.buildingBuilt = true;
    log('Здание в селе построено.');
    checkTask('buildVillage', true);
    closeActionPanel();
    renderResources();
    renderCurrentTask();
    checkVictory();
}

function canAfford(cost) {
    for (const key in cost) {
        if (state.resources[key] < cost[key]) return false;
    }
    return true;
}

function spend(cost) {
    if (!canAfford(cost)) {
        log('Недостаточно ресурсов.');
        return false;
    }
    for (const key in cost) state.resources[key] -= cost[key];
    renderResources();
    return true;
}

function costStr(cost) {
    return Object.entries(cost)
        .map(([k, v]) => `${v}${CONFIG.resources[k].icon}`)
        .join(' ');
}

function checkTask(id, value) {
    if (state.tasks[id] !== value) {
        state.tasks[id] = value;
        renderCurrentTask();
    }
}

function startPatriotTimer() {
    if (state.patriotTimer) clearInterval(state.patriotTimer);
    state.patriotTimer = setInterval(() => {
        if (state.gameOver) return;
        state.patriot = Math.max(0, state.patriot - CONFIG.patriot.decayPerTick);
        renderResources();
        if (state.patriot <= CONFIG.patriot.revoltThreshold) {
            triggerRevolt();
        }
    }, CONFIG.patriot.tickMs);
}

function triggerRevolt() {
    if (state.gameOver) return;
    state.gameOver = true;
    clearInterval(state.patriotTimer);
    showModal('💀 Мятеж!', 'Патриотизм упал до нуля. Народ восстал, и у вас нет армии, чтобы подавить бунт. Поражение.', 'Заново', () => location.reload());
}

function checkVictory() {
    const baseOk = state.tasks.base;
    const allTasks = CONFIG.tasks.every(t => state.tasks[t.id]);
    if (baseOk && allTasks) {
        state.gameOver = true;
        clearInterval(state.patriotTimer);
        showModal('🏆 Победа!', 'Все задачи выполнены, база под контролем. Миссия 1 пройдена!', 'В меню', () => location.reload());
    }
}

function showModal(title, text, btnText, onClick) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-text').textContent = text;
    const btn = document.getElementById('modal-btn');
    btn.textContent = btnText;
    btn.onclick = onClick;
    document.getElementById('modal').classList.add('open');
}

function startMission() {
    document.getElementById('briefing').classList.remove('active');
    document.getElementById('map-screen').classList.add('active');
    initState();
    log('Миссия началась. База открыта — постройте её.');
    startPatriotTimer();
}

initState();
