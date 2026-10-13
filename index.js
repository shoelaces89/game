const CONFIG = {
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
    startResources: {
        food: 100,
        wood: 100,
        honey: 0,
        wax: 0,
        peasants: 100
    }
};

const state = {
    resources: {
        food: CONFIG.startResources.food,
        wood: CONFIG.startResources.wood,
        honey: CONFIG.startResources.honey,
        wax: CONFIG.startResources.wax,
        peasants: CONFIG.startResources.peasants
    },
    forestMap: [],
    forestStorage: [],
    gatherTimers: {}
};

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
        [types[i], types[j]] = [types[j], types[i]];
    }

    const startIndex = (CONFIG.forest.rows - 1) * CONFIG.forest.cols + 0;

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

function renderResources() {
    document.getElementById('r-food').textContent = state.resources.food;
    document.getElementById('r-wood').textContent = state.resources.wood;
    document.getElementById('r-honey').textContent = state.resources.honey;
    document.getElementById('r-wax').textContent = state.resources.wax;
    document.getElementById('r-peasants').textContent = state.resources.peasants;
}

function showModal(title, body) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal').classList.add('open');
}

function closeModal() {
    document.getElementById('modal').classList.remove('open');
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

        div.onclick = () => onCellClick(cell);
        cont.appendChild(div);
    });
}

function renderStorage() {
    const cont = document.getElementById('forest-storage');
    cont.innerHTML = '';
    state.forestStorage.forEach(slot => {
        const div = document.createElement('div');
        div.className = 'storage-slot';
        if (slot.built) {
            div.classList.add('built');
            const res = RESOURCE_NAMES[slot.resource] || RESOURCE_NAMES.nothing;
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

function isAdjacentOpen(cell) {
    const { cols, rows } = CONFIG.forest;
    const neighbors = [];
    if (cell.col > 0)        neighbors.push(cell.index - 1);
    if (cell.col < cols - 1) neighbors.push(cell.index + 1);
    if (cell.row > 0)        neighbors.push(cell.index - cols);
    if (cell.row < rows - 1) neighbors.push(cell.index + cols);
    return neighbors.some(idx => state.forestMap[idx].open);
}

function onCellClick(cell) {
    if (!cell.open) {
        if (!isAdjacentOpen(cell)) {
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
    const body = `
    <div style="margin-bottom:10px; font-size:13px; color:#b0a890;">
      Ресурс: ${res.icon}. Осталось: ${cell.remaining} ед.
    </div>
    <button class="btn btn-primary" id="gather-btn">👷 Добывать</button>
  `;
    showModal('Добыча', body);

    document.getElementById('gather-btn').onclick = () => {
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
    };
}

function showWorkerMenu(cell) {
    const body = `
    <div style="margin-bottom:10px; font-size:13px; color:#b0a890;">
      Крестьянин работает. Осталось: ${cell.remaining} ед.
    </div>
    <button class="btn" id="stop-btn">⏹️ Снять крестьянина</button>
  `;
    showModal('Крестьянин', body);

    document.getElementById('stop-btn').onclick = () => {
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
    state.gatherTimers[cell.index] = setInterval(() => {
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
        res.gives.forEach(resId => {
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
        const body = `
      <div style="margin-bottom:10px; font-size:13px; color:#b0a890;">
        Построить склад за ${cost} 🪵?
      </div>
      <button class="btn btn-primary" id="build-btn" ${state.resources.wood < cost ? 'disabled' : ''}>
        🏭 Построить склад
      </button>
    `;
        showModal('Пустая ячейка', body);
        document.getElementById('build-btn').onclick = () => {
            if (state.resources.wood < cost) return;
            state.resources.wood -= cost;
            slot.built = true;
            slot.resource = 'nothing';
            slot.amount = 0;
            renderResources();
            renderStorage();
            closeModal();
        };
        return;
    }

    showStorageResourceMenu(slot);
}

function showStorageResourceMenu(slot) {
    let body = '<div style="margin-bottom:10px; font-size:13px; color:#b0a890;">Выберите ресурс:</div>';
    Object.keys(RESOURCE_NAMES).forEach(resId => {
        const res = RESOURCE_NAMES[resId];
        const selected = slot.resource === resId ? ' btn-primary' : '';
        body += `<button class="btn${selected}" data-res="${resId}">${res.icon} ${res.name}</button>`;
    });
    body += '<button class="btn btn-close" onclick="closeModal()">Отмена</button>';
    showModal('Настройка склада', body);

    document.querySelectorAll('#modal-body button[data-res]').forEach(btn => {
        btn.onclick = () => {
            const resId = btn.getAttribute('data-res');
            if (slot.resource !== resId) {
                slot.amount = 0;
            }
            slot.resource = resId;
            renderStorage();
            closeModal();
        };
    });
}

state.forestMap = generateForestMap();
state.forestStorage = generateStorage();
renderResources();
renderForest();
renderStorage();
