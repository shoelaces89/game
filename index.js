/**
 * @typedef {Object} ConstructionItem
 * @property {string} id
 * @property {string} name
 * @property {string} reqRes
 * @property {number} reqAmount
 * @property {number} currentAmount
 * @property {boolean} active
 * @property {boolean} done
 */

/**
 * @typedef {Object} BarnItem
 * @property {number} current
 * @property {number} max
 * @property {boolean} done
 */

/**
 * @typedef {Object} MapLocation
 * @property {number} index
 * @property {number} col
 * @property {number} row
 * @property {string} id
 * @property {string} name
 * @property {string} icon
 * @property {string} owner
 * @property {boolean} scouted
 * @property {Object.<string, number>} storage
 * @property {string[]} buildings
 * @property {ConstructionItem} [construction]
 * @property {BarnItem} [barn]
 */

/**
 * @typedef {Object} RouteItem
 * @property {number} id
 * @property {number} fromIdx
 * @property {number} toIdx
 * @property {string} resource
 * @property {number} amountTotal
 * @property {number} delivered
 * @property {number} stepMs
 * @property {number} progressMs
 * @property {number} inTransit
 * @property {string} status
 */

/**
 * @typedef {Object} TaskItem
 * @property {string} title
 * @property {boolean} done
 * @property {number} stage
 */

/**
 * @typedef {Object} GameState
 * @property {number} current_era
 * @property {string} current_region
 * @property {string} current_mission
 * @property {number} current_stage
 * @property {{starting_supply: number, from_barns: number}} provant
 * @property {{free: number, total: number}} workers
 * @property {Object.<string, number>} resources
 * @property {RouteItem[]} routes
 * @property {number} mission_timer
 * @property {Object.<string, TaskItem>} tasks
 * @property {number} paternalism
 * @property {number} passionarity
 * @property {Object.<string, number>} army
 * @property {MapLocation[]} locations
 */

// ============================================================================
// КОНФИГУРАЦИЯ (ТЗ v2.1 + параметры карты из старой демки)
// ============================================================================
const CONFIG = {
    map: { cols: 4, rows: 5 },
    startingResources: { wood: 10, provant: 20, peasants: 5, vityazi: 1 },
    route: { maxPerTrip: 25, secPerStep: 5 },
    stockadeCostWood: 150
};

const MISSION_STAGES = [
    { id: 1, name: "Село", timer: 600 },
    { id: 2, name: "Разведка" },
    { id: 3, name: "Присоединение города" },
    { id: 4, name: "Развитие города" },
    { id: 5, name: "Подготовка к набегу", timer: 600 },
    { id: 6, name: "Отражение набега" }
];

/**
 * @param {string} typeId
 * @returns {{name: string, icon: string, owner: string, buildings: string[]}}
 */
function LOCATION_DEF(typeId) {
    switch (typeId) {
        case "village":
            return {
                name: "Село",
                icon: "🏘️",
                owner: "none",
                buildings: [
                    "Лесопилка", "Смолокурня", "Угольная яма", "Плотницкая",
                    "Кожевня", "Мельница", "Маслобойня", "Коптильня", "Медоварня", "Пекарня"
                ]
            };
        case "city":
            return {
                name: "Город",
                icon: "🏰",
                owner: "neutral",
                buildings: [
                    "Гончарная", "Кузня", "Оружейная мастерская",
                    "Мастерская бронника", "Верфь", "Рынок", "Княжий терем"
                ]
            };
        case "bandits":
            return { name: "Лагерь бандитов", icon: "⛺", owner: "hostile", buildings: [] };
        case "forest":
            return { name: "Лес", icon: "🌲", owner: "none", buildings: [] };
        case "field":
            return { name: "Поле", icon: "🌾", owner: "none", buildings: [] };
        case "river":
            return { name: "Река", icon: "🌊", owner: "none", buildings: [] };
        case "pasture":
            return { name: "Пастбища", icon: "🐄", owner: "none", buildings: [] };
        case "mines":
            return { name: "Недра", icon: "⛰️", owner: "none", buildings: [] };
        default:
            return { name: "Пустошь", icon: "⬜", owner: "none", buildings: [] };
    }
}

// ============================================================================
// ГЕНЕРАЦИЯ СЕТОЧНОЙ КАРТЫ 4x5 (как в старой демке, под правила ТЗ v2.1)
// ============================================================================

/**
 * @returns {MapLocation[]}
 */
function generateMap() {
    const cols = CONFIG.map.cols;
    const rows = CONFIG.map.rows;
    const total = cols * rows;
    /** @type {MapLocation[]} */
    const locs = [];

    const startIdx = (rows - 1) * cols; // левый нижний угол (row 4, col 0)
    const fieldIdx = startIdx - cols;   // сосед сверху (row 3, col 0)
    const forestIdx = startIdx + 1;     // сосед справа (row 4, col 1)

    /** @type {Array.<string|null>} */
    const types = new Array(total).fill(null);
    types.splice(startIdx, 1, "village");
    types.splice(fieldIdx, 1, "field");
    types.splice(forestIdx, 1, "forest");

    const cityIdx = 2;     // row 0, col 2
    const banditsIdx = 3;  // row 0, col 3
    const riverIdx = 9;    // row 2, col 1
    const pastureIdx = 14; // row 3, col 2
    const minesIdx = 11;   // row 2, col 3

    types.splice(cityIdx, 1, "city");
    types.splice(banditsIdx, 1, "bandits");
    types.splice(riverIdx, 1, "river");
    types.splice(pastureIdx, 1, "pasture");
    types.splice(minesIdx, 1, "mines");

    const pool = ["forest", "field", "river", "pasture", "mines", "empty", "empty"];
    for (let i = 0; i < total; i++) {
        if (types.at(i) !== null) continue;
        const rnd = pool.at(Math.floor(Math.random() * pool.length)) || "empty";
        types.splice(i, 1, rnd);
    }

    for (let i = 0; i < total; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const typeId = types.at(i) || "empty";
        const def = LOCATION_DEF(typeId);
        const isStart = i === startIdx;

        /** @type {MapLocation} */
        const loc = {
            index: i,
            col: col,
            row: row,
            id: typeId,
            name: isStart ? "Село Родное" : def.name,
            icon: def.icon,
            owner: isStart ? "player" : def.owner,
            scouted: isStart,
            storage: isStart ? { wood: CONFIG.startingResources.wood } : {},
            buildings: def.buildings
        };

        if (isStart) {
            loc.construction = {
                id: "palisade",
                name: "Частокол",
                reqRes: "wood",
                reqAmount: CONFIG.stockadeCostWood,
                currentAmount: 0,
                active: false,
                done: false
            };
        }

        if (typeId === "forest") {
            loc.storage = { wood: 160 };
        }

        if (typeId === "field") {
            loc.storage = { rye: 0 };
            loc.barn = { current: 0, max: 100, done: false };
        }

        locs.push(loc);
    }

    return locs;
}

// ============================================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ (Раздел 11.1)
// ============================================================================

/**
 * @returns {GameState}
 */
function createInitialState() {
    return {
        current_era: 0,
        current_region: "rus_region_1",
        current_mission: "mission_1",
        current_stage: 1,
        provant: { starting_supply: 20, from_barns: 0 },
        workers: { free: 5, total: 5 },
        resources: {},
        routes: [],
        mission_timer: 600.0,
        tasks: {
            palisade: { title: "Построить частокол (150 древесины)", done: false, stage: 1 },
            harvest: { title: "Собрать урожай (заполнить амбар в поле)", done: false, stage: 1 },
            find_city: { title: "Разведать территорию и найти город", done: false, stage: 2 },
            defeat_bandits: { title: "Победить бандитов и присоединить город", done: false, stage: 3 }
        },
        paternalism: 50,
        passionarity: 50,
        army: { vityazi: 1 },
        locations: generateMap()
    };
}

/** @type {GameState} */
let state = createInitialState();

// ============================================================================
// УТИЛИТЫ И ПРАВИЛА МИРА (Разделы 4, 5, 6, 7, 10.4)
// ============================================================================

/**
 * @param {string} text
 */
function notify(text) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    container.appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
}

/**
 * @returns {number}
 */
function getTotalProvant() {
    return state.provant.starting_supply + state.provant.from_barns;
}

/**
 * @param {number} amount
 * @returns {boolean}
 */
function spendProvant(amount) {
    if (getTotalProvant() < amount) return false;
    if (state.provant.starting_supply >= amount) {
        state.provant.starting_supply -= amount;
        if (state.provant.starting_supply === 0) {
            notify("Стартовый запас провианта исчерпан");
        }
    } else {
        const rem = amount - state.provant.starting_supply;
        if (state.provant.starting_supply > 0) {
            state.provant.starting_supply = 0;
            notify("Стартовый запас провианта исчерпан");
        }
        state.provant.from_barns -= rem;
    }
    return true;
}

/**
 * @returns {number}
 */
function getTotalWood() {
    return state.locations.reduce(function (sum, loc) {
        return sum + (loc.storage.wood || 0);
    }, 0);
}

/**
 * @param {MapLocation} loc
 * @returns {number}
 */
function getRingFromStart(loc) {
    const startCol = 0;
    const startRow = CONFIG.map.rows - 1;
    return Math.abs(loc.col - startCol) + Math.abs(loc.row - startRow);
}

/**
 * @param {MapLocation} loc
 * @returns {number}
 */
function getScoutCost(loc) {
    if (loc.id === "river") return 2;
    return Math.max(1, getRingFromStart(loc));
}

/**
 * @param {MapLocation} loc
 * @returns {boolean}
 */
function isAdjacentToVisible(loc) {
    const cols = CONFIG.map.cols;
    const rows = CONFIG.map.rows;
    /** @type {number[]} */
    const neighbors = [];
    if (loc.col > 0) neighbors.push(loc.index - 1);
    if (loc.col < cols - 1) neighbors.push(loc.index + 1);
    if (loc.row > 0) neighbors.push(loc.index - cols);
    if (loc.row < rows - 1) neighbors.push(loc.index + cols);

    return neighbors.some(function (nIdx) {
        const n = state.locations.at(nIdx);
        return Boolean(n && (n.owner === "player" || n.scouted));
    });
}
// ============================================================================
// ЛОГИКА ИГРЫ, МАРШРУТОВ И ЭТАПОВ
// ============================================================================
const Game = {
    running: false,
    lastTick: 0,
    startMission() {
        state = createInitialState();
        const menuScreen = document.getElementById("menu-screen");
        const gameScreen = document.getElementById("game-screen");
        if (menuScreen) menuScreen.classList.remove("active");
        if (gameScreen) gameScreen.classList.add("active");
        Gestures.init();
        this.running = true;
        this.lastTick = performance.now();
        notify("Вы получили стартовый запас: 20 провианта, 10 древесины, 5 крестьян, 1 юнит витязей");
        UI.renderAll();
        const self = this;
        requestAnimationFrame(function (now) { self.loop(now); });
    },
    /**
     • @param {number} now
     */
    loop(now) {
        if (!this.running) return;
        const dt = (now - this.lastTick) / 1000;
        this.lastTick = now;
        this.updateTimers(dt);
        const routesChanged = this.updateRoutes(dt);
        this.checkStageProgression();
        UI.updateTopBar();
        if (routesChanged) {
            UI.renderMap();
        }
        const self = this;
        requestAnimationFrame(function (t) { self.loop(t); });
    },
    /**
     • @param {number} dt
     */
    updateTimers(dt) {
        const stageObj = MISSION_STAGES.find(function (s) { return s.id === state.current_stage; });
        if (stageObj && stageObj.timer && state.mission_timer > 0) {
            state.mission_timer = Math.max(0, state.mission_timer - dt);
            if (state.mission_timer === 0) {
                if (state.current_stage === 1) {
                    notify("Время этапа 1 вышло!");
                } else if (state.current_stage === 5) {
                    state.current_stage = 6;
                    notify("Начался вражеский набег!");
                }
            }
        }
    },
    /**
     • @param {number} dt
     • @returns {boolean}
     */
    updateRoutes(dt) {
        let changed = false;
        for (let i = state.routes.length - 1; i >= 0; i--) {
            const r = state.routes.at(i);
            if (!r) continue;
            const src = state.locations.at(r.fromIdx);
            const dst = state.locations.at(r.toIdx);
            if (!src || !dst || !dst.construction || dst.construction.done) {
                state.routes.splice(i, 1);
                changed = true;
                continue;
            }
            if (r.inTransit > 0) {
                r.progressMs += dt * 1000;
                if (r.progressMs >= r.stepMs) {
                    dst.construction.currentAmount += r.inTransit;
                    r.delivered += r.inTransit;
                    r.inTransit = 0;
                    r.progressMs = 0;
                    changed = true;
                    if (dst.construction.currentAmount >= dst.construction.reqAmount) {
                        dst.construction.currentAmount = dst.construction.reqAmount;
                        dst.construction.done = true;
                        dst.construction.active = false;
                        state.routes.splice(i, 1);
                        notify("Маршрут завершён");
                        if (dst.construction.id === "palisade") {
                            state.tasks.palisade.done = true;
                            notify("Задание выполнено");
                        }
                    }
                }
            } else {
                const needed = dst.construction.reqAmount - dst.construction.currentAmount;
                const available = src.storage[r.resource] || 0;
                if (available > 0 && needed > 0) {
                    const batch = Math.min(CONFIG.route.maxPerTrip, available, needed);
                    src.storage[r.resource] -= batch;
                    r.inTransit = batch;
                    r.progressMs = 0;
                    r.status = "active";
                    changed = true;
                } else if (needed > 0 && r.status !== "paused") {
                    r.status = "paused";
                    changed = true;
                }
            }
        }
        return changed;
    },
    checkStageProgression() {
        if (state.current_stage === 1 && state.tasks.palisade.done && state.tasks.harvest.done) {
            state.current_stage = 2;
            state.mission_timer = 0;
            notify("Этап 2: Разведка и поиск города");
            UI.updateTaskBanner();
        }
        const city = state.locations.find(function (l) { return l.id === "city"; });
        if (state.current_stage === 2 && city && city.scouted) {
            state.tasks.find_city.done = true;
            state.current_stage = 3;
            notify("Задание выполнено! Этап 3: Присоединение города");
            UI.updateTaskBanner();
        }
    },
    /**
     • @param {number} locIdx
     */
    scoutLocation(locIdx) {
        const loc = state.locations.at(locIdx);
        if (!loc || loc.scouted) return;
        const cost = getScoutCost(loc);
        if (!spendProvant(cost)) {
            notify("Недостаточно провианта (нужно " + cost + ")");
            return;
        }
        loc.scouted = true;
        notify("Разведано: " + loc.name);
        UI.renderMap();
        UI.openLocationModal(loc);
    },
    /**
     • @param {number} locIdx
     */
    claimLocation(locIdx) {
        const loc = state.locations.at(locIdx);
        if (!loc || !loc.scouted) return;
        if (loc.owner === "none") {
            loc.owner = "player";
            notify("Локация «" + loc.name + "» занята");
            UI.renderMap();
            UI.openLocationModal(loc);
        } else if (loc.id === "bandits" && loc.owner === "hostile") {
            if ((state.army.vityazi || 0) >= 1) {
                loc.owner = "player";
                const city = state.locations.find(function (l) { return l.id === "city"; });
                if (city) city.owner = "player";
                state.workers.free += 15;
                state.workers.total += 15;
                state.tasks.defeat_bandits.done = true;
                state.current_stage = 4;
                notify("Задание выполнено! Бандиты разбиты, город присоединился (+15 крестьян)");
                UI.renderAll();
                UI.openLocationModal(loc);
            } else {
                notify("Нет войск для атаки!");
            }
        }
    },
    /**
     • @param {number} fromIdx
     • @param {number} toIdx
     • @param {string} resource
     */
    createRoute(fromIdx, toIdx, resource) {
        const src = state.locations.at(fromIdx);
        const dst = state.locations.at(toIdx);
        if (!src || !dst || !dst.construction) return;
        const steps = Math.max(1, Math.abs(src.col - dst.col) + Math.abs(src.row - dst.row));
        const stepMs = steps * CONFIG.route.secPerStep * 1000;
        const needed = dst.construction.reqAmount - dst.construction.currentAmount;
        state.routes.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            fromIdx: fromIdx,
            toIdx: toIdx,
            resource: resource,
            amountTotal: needed,
            delivered: 0,
            stepMs: stepMs,
            progressMs: 0,
            inTransit: 0,
            status: "active"
        });
        notify("Маршрут создан (рейс: " + (steps * CONFIG.route.secPerStep) + " сек.)");
        UI.renderMap();
    },
    /**
     • @param {number} routeId
     */
    cancelRoute(routeId) {
        const idx = state.routes.findIndex(function (r) { return r.id === routeId; });
        if (idx !== -1) {
            state.routes.splice(idx, 1);
            notify("Маршрут отменён (ресурс в пути пропал)");
            UI.renderMap();
        }
    }
};
// ============================================================================
// ИНТЕРФЕЙС И ОТРИСОВКА КАРТЫ (Разделы 1.3, 10)
// ============================================================================
const UI = {
    renderAll() {
        this.updateTopBar();
        this.updateTaskBanner();
        this.renderMap();
    },
    updateTopBar() {
        const elProvant = document.getElementById("ui-provant");
        const elWood = document.getElementById("ui-wood");
        const elWorkers = document.getElementById("ui-workers");
        const elPatPas = document.getElementById("ui-pat-pas");
        const elTimer = document.getElementById("ui-timer");
        if (elProvant) elProvant.textContent = String(getTotalProvant());
        if (elWood) elWood.textContent = String(getTotalWood());
        if (elWorkers) elWorkers.textContent = state.workers.free + "/" + state.workers.total;
        if (elPatPas) elPatPas.textContent = state.paternalism + "% / " + state.passionarity + "%";
        const stageObj = MISSION_STAGES.find(function (s) { return s.id === state.current_stage; });
        if (elTimer) {
            if (stageObj && stageObj.timer) {
                const m = Math.floor(state.mission_timer / 60).toString().padStart(2, "0");
                const s = Math.floor(state.mission_timer % 60).toString().padStart(2, "0");
                elTimer.textContent = m + ":" + s;
            } else {
                elTimer.textContent = "—";
            }
        }
    },
    updateTaskBanner() {
        const el = document.getElementById("ui-current-task");
        if (!el) return;
        const keys = Object.keys(state.tasks);
        for (const k of keys) {
            const t = state.tasks[k];
            if (!t.done) {
                el.textContent = "📜 " + t.title;
                return;
            }
        }
        el.textContent = "✅ Все текущие задачи выполнены";
    },
    renderMap() {
        const grid = document.getElementById("map-grid");
        if (!grid) return;
        grid.textContent = "";
        const self = this;
        state.locations.forEach(function (loc) {
            const div = document.createElement("div");
            div.className = "loc";
            div.dataset.locIndex = String(loc.index);
            const isAdj = isAdjacentToVisible(loc);
            const showInfo = loc.scouted || loc.owner === "player";
            if (!showInfo) div.classList.add("fog");
            if (loc.owner === "player") div.classList.add("player");
            if (loc.owner === "hostile") div.classList.add("hostile");
            if (loc.owner === "neutral") div.classList.add("neutral");
            if (!showInfo && !isAdj) div.classList.add("locked");
            if (loc.construction && loc.construction.active) div.classList.add("construction-target");
            if (loc.construction && (loc.construction.active || loc.construction.done)) {
                const badge = document.createElement("div");
                badge.className = "loc-construction-badge";
                const routeTo = state.routes.find(function (r) { return r.toIdx === loc.index; });
                const routeStr = routeTo ? " · 🚚 " + routeTo.delivered + "/" + routeTo.amountTotal : "";
                badge.textContent = "🪵 " + loc.construction.currentAmount + "/" + loc.construction.reqAmount + routeStr;
                div.appendChild(badge);
            } else {
                const routeFrom = state.routes.find(function (r) { return r.fromIdx === loc.index; });
                if (routeFrom) {
                    const badge = document.createElement("div");
                    badge.className = "loc-construction-badge";
                    badge.textContent = "🚚 " + routeFrom.delivered + "/" + routeFrom.amountTotal;
                    div.appendChild(badge);
                }
            }
            const iconEl = document.createElement("div");
            iconEl.className = "loc-icon";
            iconEl.textContent = showInfo ? loc.icon : "❓";
            div.appendChild(iconEl);
            const nameEl = document.createElement("div");
            nameEl.className = "loc-name";
            nameEl.textContent = showInfo ? loc.name : "???";
            div.appendChild(nameEl);
            const statusEl = document.createElement("div");
            statusEl.className = "loc-status";
            if (loc.owner === "player") {
                statusEl.textContent = "под контролем";
            } else if (loc.owner === "neutral") {
                statusEl.textContent = "нейтрально";
            } else if (loc.owner === "hostile") {
                statusEl.textContent = "враги";
            } else if (loc.scouted) {
                statusEl.textContent = "разведано";
            } else if (isAdj) {
                statusEl.textContent = getScoutCost(loc) + " пров.";
            } else {
                statusEl.textContent = "туман войны";
            }
            div.appendChild(statusEl);
            div.addEventListener("click", function () {
                if (Gestures.wasDragging) return;
                self.openLocationModal(loc);
            });
            grid.appendChild(div);
        });
        this.renderActiveRouteLines();
    },
    renderActiveRouteLines() {
        const svg = document.getElementById("route-overlay");
        const viewport = document.getElementById("map-viewport");
        if (!svg || !viewport) return;
        svg.textContent = "";
        const vpRect = viewport.getBoundingClientRect();
        state.routes.forEach(function (r) {
            const fromEl = document.querySelector(".loc[data-loc-index='" + r.fromIdx + "']");
            const toEl = document.querySelector(".loc[data-loc-index='" + r.toIdx + "']");
            if (!fromEl || !toEl) return;
            const fRect = fromEl.getBoundingClientRect();
            const tRect = toEl.getBoundingClientRect();
            const line = document.createElementNS("w3.org", "line");
            line.setAttribute("x1", String(fRect.left - vpRect.left + fRect.width / 2));
            line.setAttribute("y1", String(fRect.top - vpRect.top + fRect.height / 2));
            line.setAttribute("x2", String(tRect.left - vpRect.left + tRect.width / 2));
            line.setAttribute("y2", String(tRect.top - vpRect.top + tRect.height / 2));
            line.setAttribute("stroke", "#4cd137");
            line.setAttribute("stroke-width", "3");
            line.setAttribute("stroke-dasharray", "6,4");
            svg.appendChild(line);
        });
    },
    /**
     • @param {HTMLElement} parent
     • @returns {HTMLDivElement}
     */
    createCard(parent) {
        const card = document.createElement("div");
        card.className = "card-item";
        parent.appendChild(card);
        return card;
    },
    /**
     • @param {HTMLElement} parent
     • @param {string} text
     • @param {Function} onClick
     • @param {string} [className]
     • @param {string} [bgColor]
     • @returns {HTMLButtonElement}
     */
    createButton(parent, text, onClick, className, bgColor) {
        const btn = document.createElement("button");
        if (className) btn.className = className;
        if (bgColor) btn.style.background = bgColor;
        btn.textContent = text;
        btn.addEventListener("click", function () { onClick(); });
        parent.appendChild(btn);
        return btn;
    },
    /**
     • @param {string} title
     • @param {function(HTMLElement): void} renderContent
     */
    openModal(title, renderContent) {
        const elTitle = document.getElementById("modal-title");
        const elBody = document.getElementById("modal-body");
        const elOverlay = document.getElementById("modal-overlay");
        if (!elTitle || !elBody || !elOverlay) return;
        elTitle.textContent = title;
        elBody.textContent = "";
        renderContent(elBody);
        elOverlay.classList.add("open");
    },
    closeAllModals() {
        const elOverlay = document.getElementById("modal-overlay");
        if (elOverlay) elOverlay.classList.remove("open");
    },
    openTasks() {
        const self = this;
        this.openModal("Задания миссии", function (body) {
            const stageObj = MISSION_STAGES.find(function (s) { return s.id === state.current_stage; });
            const stageName = stageObj ? stageObj.name : "";
            const headCard = self.createCard(body);
            const b = document.createElement("b");
            b.textContent = "Текущий этап " + state.current_stage + ": ";
            headCard.appendChild(b);
            headCard.appendChild(document.createTextNode(stageName));
            const keys = Object.keys(state.tasks);
            for (const key of keys) {
                const t = state.tasks[key];
                const card = self.createCard(body);
                const badge = document.createElement("span");
                badge.className = t.done ? "badge done" : "badge";
                badge.textContent = t.done ? "Выполнено" : "В процессе";
                card.appendChild(badge);
                const desc = document.createElement("div");
                desc.style.marginTop = "6px";
                desc.textContent = t.title;
                card.appendChild(desc);
            }
        });
    },
    openSettings() {
        const self = this;
        this.openModal("Настройки и сводка", function (body) {
            const vityazi = state.army.vityazi || 0;
            const armyCard = self.createCard(body);
            armyCard.textContent = "Армия: Витязи — " + vityazi;
            const provCard = self.createCard(body);
            provCard.textContent =
                "Стартовый провиант: " + state.provant.starting_supply +
                " | Из амбаров: " + state.provant.from_barns;
            self.createButton(body, "Выйти в главное меню", function () {
                location.reload();
            });
        });
    },
    /**
     • @param {MapLocation} loc
     */
    openLocationModal(loc) {
        const self = this;
        if (!loc.scouted && loc.owner !== "player") {
            if (!isAdjacentToVisible(loc)) return;
            const cost = getScoutCost(loc);
            this.openModal("Неизвестная территория", function (body) {
                const info = self.createCard(body);
                info.textContent = "Стоимость разведки: " + cost + " провианта (круг " + getRingFromStart(loc) + ").";
                self.createButton(
                    body,
                    "🔍 Разведать (" + cost + " пров.)",
                    function () { Game.scoutLocation(loc.index); },
                    "primary"
                );
            });
            return;
        }
        this.openModal(loc.name, function (body) {
            const statusCard = self.createCard(body);
            statusCard.textContent = "Статус: " + loc.owner + " | Круг от села: " + getRingFromStart(loc);
            const resKeys = Object.keys(loc.storage || {});
            if (resKeys.length > 0) {
                const resText = resKeys.map(function (k) { return k + ": " + loc.storage[k]; }).join(", ");
                const stCard = self.createCard(body);
                stCard.textContent = "Склад: " + resText;
            }
            if (loc.owner === "none") {
                self.createButton(
                    body,
                    "🚩 Занять локацию",
                    function () { Game.claimLocation(loc.index); },
                    "primary"
                );
            } else if (loc.id === "city" && loc.owner === "neutral") {
                const cCard = self.createCard(body);
                cCard.textContent = "Горожане напуганы. Захватите лагерь бандитов, чтобы присоединить город.";
            } else if (loc.id === "bandits" && loc.owner === "hostile") {
                self.createButton(
                    body,
                    "⚔️ Атаковать бандитов (Витязи: " + (state.army.vityazi || 0) + ")",
                    function () { Game.claimLocation(loc.index); },
                    "primary",
                    "#9e3b33"
                );
            }
            if (loc.construction) {
                const c = loc.construction;
                const cCard = self.createCard(body);
                const title = document.createElement("b");
                title.textContent = "Стройка: " + c.name;
                cCard.appendChild(title);
                cCard.appendChild(document.createTextNode(
                    " (" + c.currentAmount + "/" + c.reqAmount + " " + c.reqRes + ")"
                ));
                cCard.appendChild(document.createElement("br"));
                if (c.done) {
                    const badge = document.createElement("span");
                    badge.className = "badge done";
                    badge.textContent = "Построено";
                    cCard.appendChild(badge);
                } else {
                    const btnText = c.active
                        ? "Стройка активна (проведите пальцем от источника к селу)"
                        : "Активировать стройку";
                    self.createButton(
                        cCard,
                        btnText,
                        function () { self.toggleConstruction(loc.index); },
                        "primary"
                    );
                }
            }
            if (loc.id === "field" && loc.owner === "player" && loc.barn && !loc.barn.done) {
                const bCard = self.createCard(body);
                bCard.textContent = "Амбар поля: " + loc.barn.current + "/" + loc.barn.max + " ржи";
                self.createButton(
                    bCard,
                    "🌾 Собрать урожай (+50 ржи)",
                    function () { self.gatherHarvestTest(loc.index); },
                    "primary"
                );
            }
            const activeRoutes = state.routes.filter(function (r) {
                return r.toIdx === loc.index || r.fromIdx === loc.index;
            });
            if (activeRoutes.length > 0) {
                const rCard = self.createCard(body);
                const rTitle = document.createElement("b");
                rTitle.textContent = "Активные маршруты:";
                rCard.appendChild(rTitle);
                activeRoutes.forEach(function (r) {
                    const src = state.locations.at(r.fromIdx);
                    const dst = state.locations.at(r.toIdx);
                    const row = document.createElement("div");
                    row.style.marginTop = "6px";
                    row.style.fontSize = "12px";
                    row.textContent =
                        (src ? src.name : "?") + " → " + (dst ? dst.name : "?") +
                        " (" + r.delivered + "/" + r.amountTotal + ", в пути: " + r.inTransit + ")";
                    const cancelBtn = self.createButton(
                        row,
                        "Отменить маршрут",
                        function () {
                            Game.cancelRoute(r.id);
                            self.openLocationModal(loc);
                        },
                        "",
                        "#9e3b33"
                    );
                    cancelBtn.style.marginTop = "4px";
                    rCard.appendChild(row);
                });
            }
            if (loc.buildings.length > 0 && loc.owner === "player") {
                const bList = self.createCard(body);
                const bh = document.createElement("b");
                bh.textContent = "Постройки локации:";
                bList.appendChild(bh);
                bList.appendChild(document.createElement("br"));
                const span = document.createElement("span");
                span.style.fontSize = "12px";
                span.style.color = "#a89b84";
                span.textContent = loc.buildings.join(", ");
                bList.appendChild(span);
            }
        });
    },
    /**
     • @param {number} locIdx
     */
    toggleConstruction(locIdx) {
        const loc = state.locations.at(locIdx);
        if (!loc || !loc.construction) return;
        loc.construction.active = !loc.construction.active;
        this.renderMap();
        if (loc.construction.active) {
            notify("Проведите пальцем от локации-источника к «" + loc.name + "»");
            this.closeAllModals();
        } else {
            this.openLocationModal(loc);
        }
    },
    /**
     • @param {number} locIdx
     */
    gatherHarvestTest(locIdx) {
        const loc = state.locations.at(locIdx);
        if (!loc || !loc.barn) return;
        loc.barn.current = Math.min(100, loc.barn.current + 50);
        state.provant.from_barns += 50;
        if (loc.barn.current >= 100) {
            loc.barn.done = true;
            state.tasks.harvest.done = true;
            notify("Склад заполнен (100/100)");
            notify("Задание выполнено");
            this.updateTaskBanner();
        }
        this.openLocationModal(loc);
    },
    /**
     • @param {MapLocation} fromLoc
     • @param {MapLocation} toLoc
     */
    openRouteCreator(fromLoc, toLoc) {
        if (!toLoc.construction) return;
        const keys = Object.keys(fromLoc.storage || {}).filter(function (k) {
            return fromLoc.storage[k] > 0;
        });
        if (keys.length === 0) {
            notify("На складе источника нет ресурсов!");
            return;
        }
        const self = this;
        const targetName = toLoc.construction.name;
        this.openModal("Создание маршрута", function (body) {
            const info = self.createCard(body);
            info.textContent = "Откуда: " + fromLoc.name + " → Куда: " + toLoc.name + " (" + targetName + ")";
            keys.forEach(function (res) {
                self.createButton(
                    body,
                    "🚚 Возить: " + res + " (на складе: " + fromLoc.storage[res] + ")",
                    function () {
                        Game.createRoute(fromLoc.index, toLoc.index, res);
                        self.closeAllModals();
                    },
                    "primary"
                );
            });
        });
    }
};
// ============================================================================
// ЖЕСТЫ НА КАРТЕ (Проведение маршрута пальцем, зум и сдвиг — 10.3)
// ============================================================================
const Gestures = {
    /** @type {Map<number, {x: number, y: number}>} /
     pointers: new Map(),
     /* @type {MapLocation|null} /
     dragFromLoc: null,
     /* @type {SVGLineElement|null} */
    tempLine: null,
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
    zoom: 1,
    lastPinchDist: 0,
    wasDragging: false,
    init() {
        const viewport = document.getElementById("map-viewport");
        const grid = document.getElementById("map-grid");
        const svg = document.getElementById("route-overlay");
        if (!viewport || !grid || !svg) return;
        const self = this;
        const applyTransform = function () {
            grid.style.transform = "translate(" + self.panX + "px, " + self.panY + "px) scale(" + self.zoom + ")";
            UI.renderActiveRouteLines();
        };
        viewport.addEventListener("wheel", function (e) {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.08 : 0.92;
            self.zoom = Math.min(1.8, Math.max(0.75, self.zoom * factor));
            applyTransform();
        }, { passive: false });
        viewport.addEventListener("pointerdown", function (e) {
            self.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            self.wasDragging = false;
            if (self.pointers.size === 1) {
                self.startX = e.clientX;
                self.startY = e.clientY;
                const targetEl = document.elementFromPoint(e.clientX, e.clientY);
                const locEl = targetEl ? targetEl.closest(".loc") : null;
                const hasActiveConstruction = state.locations.some(function (l) {
                    return Boolean(l.construction && l.construction.active);
                });
                if (locEl && locEl instanceof HTMLElement && hasActiveConstruction) {
                    const idx = Number(locEl.dataset.locIndex);
                    const loc = state.locations.at(idx);
                    if (loc && loc.owner === "player") {
                        self.dragFromLoc = loc;
                        const vpRect = viewport.getBoundingClientRect();
                        const lRect = locEl.getBoundingClientRect();
                        const line = document.createElementNS("w3.org", "line");
                        line.setAttribute("x1", String(lRect.left - vpRect.left + lRect.width / 2));
                        line.setAttribute("y1", String(lRect.top - vpRect.top + lRect.height / 2));
                        line.setAttribute("x2", String(e.clientX - vpRect.left));
                        line.setAttribute("y2", String(e.clientY - vpRect.top));
                        line.setAttribute("stroke", "#fbc531");
                        line.setAttribute("stroke-width", "4");
                        svg.appendChild(line);
                        self.tempLine = line;
                    }
                }
            } else if (self.pointers.size === 2) {
                if (self.tempLine) {
                    self.tempLine.remove();
                    self.tempLine = null;
                }
                self.dragFromLoc = null;
                const pts = Array.from(self.pointers.values());
                const p0 = pts.at(0);
                const p1 = pts.at(1);
                if (p0 && p1) {
                    self.lastPinchDist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
                }
            }
        });
        viewport.addEventListener("pointermove", function (e) {
            if (!self.pointers.has(e.pointerId)) return;
            self.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (self.pointers.size === 2) {
                const pts = Array.from(self.pointers.values());
                const p0 = pts.at(0);
                const p1 = pts.at(1);
                if (p0 && p1) {
                    const dist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
                    if (self.lastPinchDist > 0) {
                        self.zoom = Math.min(1.8, Math.max(0.75, self.zoom * (dist / self.lastPinchDist)));
                        applyTransform();
                    }
                    self.lastPinchDist = dist;
                }
                return;
            }
            if (Math.hypot(e.clientX - self.startX, e.clientY - self.startY) > 10) {
                self.wasDragging = true;
            }
            if (self.dragFromLoc && self.tempLine) {
                const vpRect = viewport.getBoundingClientRect();
                self.tempLine.setAttribute("x2", String(e.clientX - vpRect.left));
                self.tempLine.setAttribute("y2", String(e.clientY - vpRect.top));
            } else if (self.pointers.size === 1 && self.wasDragging) {
                self.panX += e.clientX - self.startX;
                self.panY += e.clientY - self.startY;
                self.startX = e.clientX;
                self.startY = e.clientY;
                applyTransform();
            }
        });
        /**
         * @param {PointerEvent} e
         */
        const onEnd = function (e) {
            if (self.tempLine) {
                self.tempLine.remove();
                self.tempLine = null;
            }
            const targetEl = document.elementFromPoint(e.clientX, e.clientY);
            const locEl = targetEl ? targetEl.closest(".loc") : null;
            if (self.dragFromLoc && self.wasDragging && locEl && locEl instanceof HTMLElement) {
                const toIdx = Number(locEl.dataset.locIndex);
                const toLoc = state.locations.at(toIdx);
                if (toLoc && toLoc.index !== self.dragFromLoc.index && toLoc.construction && toLoc.construction.active) {
                    UI.openRouteCreator(self.dragFromLoc, toLoc);
                }
            }
            self.dragFromLoc = null;
            self.pointers.delete(e.pointerId);
            if (self.pointers.size < 2) self.lastPinchDist = 0;
            setTimeout(function () { self.wasDragging = false; }, 50);
        };
        viewport.addEventListener("pointerup", onEnd);
        viewport.addEventListener("pointercancel", onEnd);
    }
};
window.Game = Game;
window.UI = UI;
