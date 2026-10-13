// ============================================================
// ЛЕС — по ТЗ
// ============================================================

const CONFIG = {
    cols: 6,
    rows: 5,
    totalSquares: 30,
    amountPerSquare: 75,
    storageCapacity: 100,
    storageSlots: 7,
    unlockCost: 1,
    extractionTimeMs: 5000,
    storageCost: [10, 12, 14, 16, 18, 20, 22],
    startResources: {
        food: 100,
        wood: 100,
        honey: 0,
        wax: 0,
        peasants: 100
    }
};

const RESOURCES = {
    wood:    { icon: '🌲', name: 'Древесина', gives: ['wood'] },
    beehive: { icon: '🐝', name: 'Улей',      gives: ['honey', 'wax'] },
    animals: { icon: '🐗', name: 'Звери',     gives: ['food'] }
};

const STORAGE_RES = {
    wood:    { icon: '🪵', name: 'Древесина' },
    honey:   { icon: '🍯', name: 'Мёд' },
    wax:     { icon: '🕯️', name: 'Воск' },
    food:    { icon: '🍞', name: 'Еда' },
    nothing: { icon: '⛔', name: 'Ничего' }
};

// ============================================================
// СОСТОЯНИЕ
// ============================================================
const state = {
    food: CONFIG.startResources.food,
    wood: CONFIG.startResources.wood,
    honey: CONFIG.startResources.honey,
    wax: CONFIG.startResources.wax,
    peasants: CONFIG.startResources.peasants,
    cells: [],
    slots: [],
    timers: {}
};

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
function init() {
    // Карта леса
    const types = [];
    for (let i = 0; i < 7; i++) types.push('wood');
    for (let i = 0; i < 7; i++) types.push('beehive');
    for (let i = 0; i < 7; i++) types.push('animals');
    while (types.length < CONFIG.totalSquares) types.push('empty');

    for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = types[i]; types[i] = types[j]; types[j] = t;
    }

    const startIndex = (CONFIG.rows - 1) * CONFIG.cols + 0;

    state.cells = [];
    for (let i = 0; i < CONFIG.totalSquares; i++) {
        const col = i % CONFIG.cols;
        const row = Math.floor(i / CONFIG.cols);
        const type = types[i];
        const isStart = (i === startIndex);
        state.cells.push({
            index: i,
            col: col,
            row: row,
            open: isStart,
            type: type,
            remaining: type !== 'empty' ? CONFIG.amountPerSquare : 0,
            worker: false
        });
    }

    // Склады
    state.slots = [];
    for (let i = 0; i < CONFIG.storageSlots; i++) {
        state.slots.push({
            index: i,
            built: false,
            resource: null,
            amount: 0,
            capacity: CONFIG.storageCapacity
        });
    }

    renderAll();
}

// ============================================================
// РЕНДЕР
// ============================================================
function renderAll() {
    renderHud();
    renderForest();
    renderStorage();
}

function renderHud() {
    document.getElementById('r-food').textContent = state.food;
    document.getElementById('r-wood').textContent = state.wood;
    document.getElementById('r-honey').textContent = state.honey;
    document.getElementById('r-wax').textContent = state.wax;
    document.getElementById('r-peasants').textContent = state.peasants;
}

function renderForest() {
    const grid = document.getElementById('forest-grid');
    grid.innerHTML = '';

    for (let i = 0; i < state.cells.length; i++) {
        const cell = state.cells[i];
        const div = document.createElement('div');
        div.className = 'cell';

        if (!cell.open) {
            div.classList.add('fog');
            div.textContent = '🌫️';
        } else if (cell.type !== 'empty' && cell.remaining > 0) {
            const res = RESOURCES[cell.type];
            div.textContent = res.icon;
            if (cell.worker) div.classList.add('worker');

            const amount = document.createElement('div');
            amount.className = 'cell-amount';
            amount.textContent = cell.remaining;
            div.appendChild(amount);
        }

        div.onclick = createCellHandler(cell);
        grid.appendChild(div);
    }
}

function createCellHandler(cell) {
    return function() {
        onCellClick(cell);
    };
}

function renderStorage() {
    const cont = document.getElementById('forest-storage');
    cont.innerHTML = '';

    for (let i = 0; i < state.slots.length; i++) {
        const slot = state.slots[i];
        const div = document.createElement('div');
        div.className = 'storage-slot';

        if (slot.built) {
            div.classList.add('built');
            const res = STORAGE_RES[slot.resource] || STORAGE_RES.nothing;
            div.innerHTML =
                '<div class="st-icon">' + res.icon + '</div>' +
                '<div class="st-amount">' + slot.amount + '/' + slot.capacity + '</div>' +
                '<div class="st-label">' + res.name + '</div>';
        } else {
            const cost = CONFIG.storageCost[slot.index];
            div.innerHTML = '<div class="st-amount">' + cost + '🪵</div>';
        }

        div.onclick = createSlotHandler(slot);
        cont.appendChild(div);
    }
}

function createSlotHandler(slot) {
    return function() {
        onSlotClick(slot);
    };
}

// ============================================================
// МОДАЛКА
// ============================================================
function showModal(title, html) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal').classList.add('open');
}

function closeModal() {
    document.getElementById('modal').classList.remove('open');
}

// ============================================================
// ЛЕС — ОБРАБОТКА
// ============================================================
function isAdjacentOpen(cell) {
    const neighbors = [];
    if (cell.col > 0)              neighbors.push(cell.index - 1);
    if (cell.col < CONFIG.cols - 1) neighbors.push(cell.index + 1);
    if (cell.row > 0)              neighbors.push(cell.index - CONFIG.cols);
    if (cell.row < CONFIG.rows - 1) neighbors.push(cell.index + CONFIG.cols);

    for (let i = 0; i < neighbors.length; i++) {
        if (state.cells[neighbors[i]].open) return true;
    }
    return false;
}

function onCellClick(cell) {
    // 1. Закрытая клетка — открыть
    if (!cell.open) {
        if (!isAdjacentOpen(cell)) {
            showModal('Нельзя открыть', 'Можно открывать только соседние клетки.');
            return;
        }
        if (state.food < CONFIG.unlockCost) {
            showModal('Нет еды', 'Недостаточно еды для разведки.');
            return;
        }
        state.food -= CONFIG.unlockCost;
        cell.open = true;
        renderHud();
        renderForest();
        return;
    }

    // 2. Пустая клетка
    if (cell.type === 'empty' || cell.remaining <= 0) {
        showModal('Пустая клетка', 'Здесь нечего добывать.');
        return;
    }

    // 3. Клетка с ресурсом
    if (cell.worker) {
        // Уже работает — предложить снять
        const html =
            '<div style="margin-bottom:10px; font-size:13px; color:#b0a890;">' +
            'Крестьянин работает. Осталось: ' + cell.remaining + ' ед.' +
            '</div>' +
            '<button class="btn" id="stop-btn">⏹️ Снять крестьянина</button>';
        showModal('Крестьянин', html);

        document.getElementById('stop-btn').onclick = function() {
            cell.worker = false;
            state.peasants += 1;
            stopTimer(cell);
            renderHud();
            renderForest();
            closeModal();
        };
    } else {
        // Свободна — предложить назначить
        const res = RESOURCES[cell.type];
        const html =
            '<div style="margin-bottom:10px; font-size:13px; color:#b0a890;">' +
            'Ресурс: ' + res.icon + '. Осталось: ' + cell.remaining + ' ед.' +
            '</div>' +
            '<button class="btn btn-primary" id="gather-btn">👷 Добывать</button>';
        showModal('Добыча', html);

        document.getElementById('gather-btn').onclick = function() {
            if (state.peasants <= 0) {
                closeModal();
                showModal('Нет крестьян', 'Все крестьяне заняты.');
                return;
            }
            cell.worker = true;
            state.peasants -= 1;
            renderHud();
            renderForest();
            closeModal();
            startTimer(cell);
        };
    }
}

// ============================================================
// ДОБЫЧА
// ============================================================
function startTimer(cell) {
    if (state.timers[cell.index]) return;

    state.timers[cell.index] = setInterval(function() {
        if (cell.remaining <= 0) {
            stopTimer(cell);
            cell.worker = false;
            state.peasants += 1;
            cell.open = false;
            renderHud();
            renderForest();
            return;
        }

        const res = RESOURCES[cell.type];
        if (!res) return;

        let gathered = false;
        for (let i = 0; i < res.gives.length; i++) {
            const resId = res.gives[i];
            let targetSlot = null;
            for (let j = 0; j < state.slots.length; j++) {
                const s = state.slots[j];
                if (s.built && s.resource === resId && s.amount < s.capacity) {
                    targetSlot = s;
                    break;
                }
            }
            if (targetSlot) {
                targetSlot.amount += 1;
                gathered = true;
            }
        }

        if (gathered) {
            cell.remaining -= 1;
            renderStorage();
            renderForest();
        }
    }, CONFIG.extractionTimeMs);
}

function stopTimer(cell) {
    if (state.timers[cell.index]) {
        clearInterval(state.timers[cell.index]);
        delete state.timers[cell.index];
    }
}

// ============================================================
// СКЛАДЫ — ОБРАБОТКА
// ============================================================
function onSlotClick(slot) {
    if (!slot.built) {
        const cost = CONFIG.storageCost[slot.index];
        const disabled = state.wood < cost ? 'disabled' : '';
        const html =
            '<div style="margin-bottom:10px; font-size:13px; color:#b0a890;">' +
            'Построить склад за ' + cost + ' 🪵?' +
            '</div>' +
            '<button class="btn btn-primary" id="build-btn" ' + disabled + '>🏭 Построить склад</button>';
        showModal('Пустая ячейка', html);

        document.getElementById('build-btn').onclick = function() {
            if (state.wood < cost) return;
            state.wood -= cost;
            slot.built = true;
            slot.resource = 'nothing';
            slot.amount = 0;
            renderHud();
            renderStorage();
            closeModal();
        };
        return;
    }

    // Склад построен — выбор ресурса
    let html = '<div style="margin-bottom:10px; font-size:13px; color:#b0a890;">Выберите ресурс:</div>';
    const keys = Object.keys(STORAGE_RES);
    for (let i = 0; i < keys.length; i++) {
        const resId = keys[i];
        const res = STORAGE_RES[resId];
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
init();
