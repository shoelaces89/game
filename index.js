/**
 * Хроники Державы — index.js (финальная переработка)
 * Целевой стандарт: ES2022, DOM.
 */

// ============================================================================
// КОНФИГУРАЦИЯ
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

const SVG_NS = "http://www.w3.org/2000/svg";

function LOCATION_DEF(typeId) {
    switch (typeId) {
        case "village":
            return {
                name: "Село", icon: "🏘️", owner: "none",
                buildings: [
                    "Лесопилка", "Смолокурня", "Угольная яма", "Плотницкая",
                    "Кожевня", "Мельница", "Маслобойня", "Коптильня", "Медоварня", "Пекарня"
                ]
            };
        case "city":
            return {
                name: "Город", icon: "🏰", owner: "neutral",
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
// ГЕНЕРАЦИЯ КАРТЫ 4x5
// ============================================================================
function generateMap() {
    const cols = CONFIG.map.cols;
    const rows = CONFIG.map.rows;
    const total = cols * rows;
    const locs = [];

    const startIdx = (rows - 1) * cols;
    const fieldIdx = startIdx - cols;
    const forestIdx = startIdx + 1;

    const types = new Array(total).fill(null);
    types[startIdx] = "village";
    types[fieldIdx] = "field";
    types[forestIdx] = "forest";

    types[2] = "city";
    types[3] = "bandits";
    types[9] = "river";
    types[14] = "pasture";
    types[11] = "mines";

    const pool = ["forest", "field", "river", "pasture", "mines", "empty", "empty"];
    for (let i = 0; i < total; i++) {
        if (types[i] === null) types[i] = pool[Math.floor(Math.random() * pool.length)];
    }

    for (let i = 0; i < total; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const typeId = types[i] || "empty";
        const def = LOCATION_DEF(typeId);
        const isStart = i === startIdx;

        const loc = {
            index: i, col, row,
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
                id: "palisade", name: "Частокол", reqRes: "wood",
                reqAmount: CONFIG.stockadeCostWood, currentAmount: 0,
                active: false, done: false
            };
        }
        if (typeId === "forest") loc.storage = { wood: 160 };
        if (typeId === "field") {
            loc.storage = { rye: 0 };
            loc.barn = { current: 0, max: 100, done: false };
        }
        locs.push(loc);
    }
    return locs;
}

// ============================================================================
// СОСТОЯНИЕ
// ============================================================================
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

let state = createInitialState();

// ============================================================================
// УТИЛИТЫ
// ============================================================================
function notify(text) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

function getTotalProvant() {
    return state.provant.starting_supply + state.provant.from_barns;
}

function spendProvant(amount) {
    if (getTotalProvant() < amount) return false;
    if (state.provant.starting_supply >= amount) {
        state.provant.starting_supply -= amount;
        if (state.provant.starting_supply === 0) notify("Стартовый запас провианта исчерпан");
    } else {
        const rem = amount - state.provant.starting_supply;
        if (state.provant.starting_supply > 0) {
            state.provant.starting_supply = 0;
            notify("Стартовый запас провианта исчерпан");
        }
        state.provant.from_barns = Math.max(0, state.provant.from_barns - rem);
    }
    return true;
}

function getTotalWood() {
    return state.locations.reduce((sum, loc) => sum + (loc.storage.wood || 0), 0);
}

function getRingFromStart(loc) {
    return Math.abs(loc.col) + Math.abs(loc.row - (CONFIG.map.rows - 1));
}

function getScoutCost(loc) {
    if (loc.id === "river") return 2;
    return Math.max(1, getRingFromStart(loc));
}

function isAdjacentToVisible(loc) {
    const cols = CONFIG.map.cols;
    const rows = CONFIG.map.rows;
    const neighbors = [];
    if (loc.col > 0) neighbors.push(loc.index - 1);
    if (loc.col < cols - 1) neighbors.push(loc.index + 1);
    if (loc.row > 0) neighbors.push(loc.index - cols);
    if (loc.row < rows - 1) neighbors.push(loc.index + cols);
    return neighbors.some((nIdx) => {
        const n = state.locations[nIdx];
        return !!n && (n.owner === "player" || n.scouted);
    });
}

// ============================================================================
// ИГРОВАЯ ЛОГИКА
// ============================================================================
const Game = {
    running: false,
    lastTick: 0,

    startMission() {
        state = createInitialState();
        document.getElementById("menu-screen")?.classList.remove("active");
        document.getElementById("game-screen")?.classList.add("active");
        Gestures.init();
        this.running = true;
        this.lastTick = performance.now();
        notify("Вы получили стартовый запас: 20 провианта, 10 древесины, 5 крестьян, 1 юнит витязей");
        UI.renderAll();
        requestAnimationFrame((t) => this.loop(t));
    },

    loop(now) {
        if (!this.running) return;
        const dt = (now - this.lastTick) / 1000;
        this.lastTick = now;
        this.updateTimers(dt);
        const routesChanged = this.updateRoutes(dt);
        this.checkStageProgression();
        UI.updateTopBar();
        if (routesChanged) UI.renderMap();
        requestAnimationFrame((t) => this.loop(t));
    },

    updateTimers(dt) {
        const stageObj = MISSION_STAGES.find((s) => s.id === state.current_stage);
        if (stageObj && stageObj.timer && state.mission_timer > 0) {
            state.mission_timer = Math.max(0, state.mission_timer - dt);
            if (state.mission_timer === 0) {
                if (state.current_stage === 1) notify("Время этапа 1 вышло!");
                else if (state.current_stage === 5) {
                    state.current_stage = 6;
                    notify("Начался вражеский набег!");
                }
            }
        }
    },

    updateRoutes(dt) {
        let changed = false;
        for (let i = state.routes.length - 1; i >= 0; i--) {
            const r = state.routes[i];
            const src = state.locations[r.fromIdx];
            const dst = state.locations[r.toIdx];
            if (!src || !dst || !dst.construction || dst.construction.done) {
                if (r.inTransit > 0 && src) {
                    src.storage[r.resource] = (src.storage[r.resource] || 0) + r.inTransit;
                }
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
        const city = state.locations.find((l) => l.id === "city");
        if (state.current_stage === 2 && city && city.scouted) {
            state.tasks.find_city.done = true;
            state.current_stage = 3;
            notify("Задание выполнено! Этап 3: Присоединение города");
            UI.updateTaskBanner();
        }
    },

    scoutLocation(locIdx) {
        const loc = state.locations[locIdx];
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

    claimLocation(locIdx) {
        const loc = state.locations[locIdx];
        if (!loc || !loc.scouted) return;
        if (loc.owner === "none") {
            loc.owner = "player";
            notify("Локация «" + loc.name + "» занята");
            UI.renderMap();
            UI.openLocationModal(loc);
        } else if (loc.id === "bandits" && loc.owner === "hostile") {
            if ((state.army.vityazi || 0) >= 1) {
                loc.owner = "player";
                const city = state.locations.find((l) => l.id === "city");
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

    createRoute(fromIdx, toIdx, resource) {
        const src = state.locations[fromIdx];
        const dst = state.locations[toIdx];
        if (!src || !dst || !dst.construction) return;
        const steps = Math.max(1, Math.abs(src.col - dst.col) + Math.abs(src.row - dst.row));
        const stepMs = steps * CONFIG.route.secPerStep * 1000;
        const needed = dst.construction.reqAmount - dst.construction.currentAmount;
        state.routes.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            fromIdx, toIdx, resource,
            amountTotal: needed, delivered: 0,
            stepMs, progressMs: 0, inTransit: 0, status: "active"
        });
        notify("Маршрут создан (рейс: " + (steps * CONFIG.route.secPerStep) + " сек.)");
        UI.renderMap();
    },

    cancelRoute(routeId) {
        const idx = state.routes.findIndex((r) => r.id === routeId);
        if (idx !== -1) {
            const r = state.routes[idx];
            const src = state.locations[r.fromIdx];
            if (src && r.inTransit > 0) {
                src.storage[r.resource] = (src.storage[r.resource] || 0) + r.inTransit;
            }
            state.routes.splice(idx, 1);
            notify("Маршрут отменён");
            UI.renderMap();
        }
    }
};

// ============================================================================
// UI
// ============================================================================
const UI = {
    renderAll() {
        this.updateTopBar();
        this.updateTaskBanner();
        this.renderMap();
    },

    updateTopBar() {
        const setText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setText("ui-provant", String(getTotalProvant()));
        setText("ui-wood", String(getTotalWood()));
        setText("ui-workers", state.workers.free + "/" + state.workers.total);
        setText("ui-pat-pas", state.paternalism + "% / " + state.passionarity + "%");
        const stageObj = MISSION_STAGES.find((s) => s.id === state.current_stage);
        if (stageObj && stageObj.timer) {
            const m = Math.floor(state.mission_timer / 60).toString().padStart(2, "0");
            const s = Math.floor(state.mission_timer % 60).toString().padStart(2, "0");
            setText("ui-timer", m + ":" + s);
        } else {
            setText("ui-timer", "—");
        }
    },

    updateTaskBanner() {
        const el = document.getElementById("ui-current-task");
        if (!el) return;
        for (const k of Object.keys(state.tasks)) {
            if (!state.tasks[k].done) {
                el.textContent = "📜 " + state.tasks[k].title;
                return;
            }
        }
        el.textContent = "✅ Все текущие задачи выполнены";
    },

    renderMap() {
        const grid = document.getElementById("map-grid");
        if (!grid) return;
        const frag = document.createDocumentFragment();

        state.locations.forEach((loc) => {
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
                const routeTo = state.routes.find((r) => r.toIdx === loc.index);
                const routeStr = routeTo ? " · 🚚 " + routeTo.delivered + "/" + routeTo.amountTotal : "";
                const badge = document.createElement("div");
                badge.className = "loc-construction-badge";
                badge.textContent = "🪵 " + loc.construction.currentAmount + "/" + loc.construction.reqAmount + routeStr;
                div.appendChild(badge);
            } else {
                const routeFrom = state.routes.find((r) => r.fromIdx === loc.index);
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
            if (loc.owner === "player") statusEl.textContent = "под контролем";
            else if (loc.owner === "neutral") statusEl.textContent = "нейтрально";
            else if (loc.owner === "hostile") statusEl.textContent = "враги";
            else if (loc.scouted) statusEl.textContent = "разведано";
            else if (isAdj) statusEl.textContent = getScoutCost(loc) + " пров.";
            else statusEl.textContent = "туман войны";
            div.appendChild(statusEl);

            div.addEventListener("click", () => {
                if (Gestures.wasDragging) return;
                this.openLocationModal(loc);
            });

            frag.appendChild(div);
        });

        grid.textContent = "";
        grid.appendChild(frag);
        this.renderActiveRouteLines();
    },

    renderActiveRouteLines() {
        const svg = document.getElementById("route-overlay");
        const viewport = document.getElementById("map-viewport");
        if (!svg || !viewport) return;
        svg.textContent = "";
        const vpRect = viewport.getBoundingClientRect();

        state.routes.forEach((r) => {
            const fromEl = document.querySelector(".loc[data-loc-index='" + r.fromIdx + "']");
            const toEl = document.querySelector(".loc[data-loc-index='" + r.toIdx + "']");
            if (!fromEl || !toEl) return;
            const fRect = fromEl.getBoundingClientRect();
            const tRect = toEl.getBoundingClientRect();
            const line = document.createElementNS(SVG_NS, "line");
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

    createCard(parent) {
        const card = document.createElement("div");
        card.className = "card-item";
        parent.appendChild(card);
        return card;
    },

    createButton(parent, text, onClick, className, bgColor) {
        const btn = document.createElement("button");
        if (className) btn.className = className;
        if (bgColor) btn.style.background = bgColor;
        btn.textContent = text;
        btn.addEventListener("click", () => onClick());
        parent.appendChild(btn);
        return btn;
    },

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
        const el = document.getElementById("modal-overlay");
        if (el) el.classList.remove("open");
    },

    openTasks() {
        this.openModal("Задания миссии", (body) => {
            const stageObj = MISSION_STAGES.find((s) => s.id === state.current_stage);
            const headCard = this.createCard(body);
            const b = document.createElement("b");
            b.textContent = "Текущий этап " + state.current_stage + ": ";
            headCard.appendChild(b);
            headCard.appendChild(document.createTextNode(stageObj ? stageObj.name : ""));

            Object.keys(state.tasks).forEach((key) => {
                const t = state.tasks[key];
                const card = this.createCard(body);
                const badge = document.createElement("span");
                badge.className = t.done ? "badge done" : "badge";
                badge.textContent = t.done ? "Выполнено" : "В процессе";
                card.appendChild(badge);
                const desc = document.createElement("div");
                desc.style.marginTop = "6px";
                desc.textContent = t.title;
                card.appendChild(desc);
            });
        });
    },

    openSettings() {
        this.openModal("Настройки и сводка", (body) => {
            const armyCard = this.createCard(body);
            armyCard.textContent = "Армия: Витязи — " + (state.army.vityazi || 0);
            const provCard = this.createCard(body);
            provCard.textContent =
                "Стартовый провиант: " + state.provant.starting_supply +
                " | Из амбаров: " + state.provant.from_barns;
            this.createButton(body, "Выйти в главное меню", () => location.reload());
        });
    },

    openLocationModal(loc) {
        if (!loc.scouted && loc.owner !== "player") {
            if (!isAdjacentToVisible(loc)) return;
            const cost = getScoutCost(loc);
            this.openModal("Неизвестная территория", (body) => {
                const info = this.createCard(body);
                info.textContent = "Стоимость разведки: " + cost + " провианта (круг " + getRingFromStart(loc) + ").";
                this.createButton(
                    body,
                    "🔍 Разведать (" + cost + " пров.)",
                    () => Game.scoutLocation(loc.index),
                    "primary"
                );
            });
            return;
        }

        this.openModal(loc.name, (body) => {
            const statusCard = this.createCard(body);
            statusCard.textContent = "Статус: " + loc.owner + " | Круг от села: " + getRingFromStart(loc);

            const resKeys = Object.keys(loc.storage || {});
            if (resKeys.length > 0) {
                const stCard = this.createCard(body);
                stCard.textContent = "Склад: " + resKeys.map((k) => k + ": " + loc.storage[k]).join(", ");
            }

            if (loc.owner === "none") {
                this.createButton(body, "🚩 Занять локацию", () => Game.claimLocation(loc.index), "primary");
            } else if (loc.id === "city" && loc.owner === "neutral") {
                const cCard = this.createCard(body);
                cCard.textContent = "Горожане напуганы. Захватите лагерь бандитов, чтобы присоединить город.";
            } else if (loc.id === "bandits" && loc.owner === "hostile") {
                this.createButton(
                    body,
                    "⚔️ Атаковать бандитов (Витязи: " + (state.army.vityazi || 0) + ")",
                    () => Game.claimLocation(loc.index),
                    "primary",
                    "#9e3b33"
                );
            }

            if (loc.construction) {
                const c = loc.construction;
                const cCard = this.createCard(body);
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
                    this.createButton(cCard, btnText, () => this.toggleConstruction(loc.index), "primary");
                }
            }

            if (loc.id === "field" && loc.owner === "player" && loc.barn && !loc.barn.done) {
                const bCard = this.createCard(body);
                bCard.textContent = "Амбар поля: " + loc.barn.current + "/" + loc.barn.max + " ржи";
                this.createButton(bCard, "🌾 Собрать урожай (+50 ржи)", () => this.gatherHarvestTest(loc.index), "primary");
            }

            const activeRoutes = state.routes.filter((r) => r.toIdx === loc.index || r.fromIdx === loc.index);
            if (activeRoutes.length > 0) {
                const rCard = this.createCard(body);
                const rTitle = document.createElement("b");
                rTitle.textContent = "Активные маршруты:";
                rCard.appendChild(rTitle);
                activeRoutes.forEach((r) => {
                    const src = state.locations[r.fromIdx];
                    const dst = state.locations[r.toIdx];
                    const row = document.createElement("div");
                    row.style.marginTop = "6px";
                    row.style.fontSize = "12px";
                    row.textContent =
                        (src ? src.name : "?") + " → " + (dst ? dst.name : "?") +
                        " (" + r.delivered + "/" + r.amountTotal + ", в пути: " + r.inTransit + ")";
                    const cancelBtn = this.createButton(row, "Отменить маршрут", () => {
                        Game.cancelRoute(r.id);
                        this.openLocationModal(loc);
                    }, "", "#9e3b33");
                    cancelBtn.style.marginTop = "4px";
                    rCard.appendChild(row);
                });
            }

            if (loc.buildings.length > 0 && loc.owner === "player") {
                const bList = this.createCard(body);
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

    toggleConstruction(locIdx) {
        const loc = state.locations[locIdx];
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

    gatherHarvestTest(locIdx) {
        const loc = state.locations[locIdx];
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

    openRouteCreator(fromLoc, toLoc) {
        if (!toLoc.construction) return;
        const keys = Object.keys(fromLoc.storage || {}).filter((k) => fromLoc.storage[k] > 0);
        if (keys.length === 0) {
            notify("На складе источника нет ресурсов!");
            return;
        }
        const targetName = toLoc.construction.name;
        this.openModal("Создание маршрута", (body) => {
            const info = this.createCard(body);
            info.textContent = "Откуда: " + fromLoc.name + " → Куда: " + toLoc.name + " (" + targetName + ")";
            keys.forEach((res) => {
                this.createButton(
                    body,
                    "🚚 Возить: " + res + " (на складе: " + fromLoc.storage[res] + ")",
                    () => {
                        Game.createRoute(fromLoc.index, toLoc.index, res);
                        this.closeAllModals();
                    },
                    "primary"
                );
            });
        });
    }
};

// ============================================================================
// ЖЕСТЫ
// ============================================================================
const Gestures = {
    inited: false,
    pointers: new Map(),
    dragFromLoc: null,
    tempLine: null,
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
    zoom: 1,
    lastPinchDist: 0,
    wasDragging: false,

    init() {
        if (this.inited) return;
        this.inited = true;

        const viewport = document.getElementById("map-viewport");
        const grid = document.getElementById("map-grid");
        const svg = document.getElementById("route-overlay");
        if (!viewport || !grid || !svg) return;

        const applyTransform = () => {
            grid.style.transform = "translate(" + this.panX + "px, " + this.panY + "px) scale(" + this.zoom + ")";
            UI.renderActiveRouteLines();
        };

        viewport.addEventListener("wheel", (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.08 : 0.92;
            this.zoom = Math.min(1.8, Math.max(0.75, this.zoom * factor));
            applyTransform();
        }, { passive: false });

        viewport.addEventListener("pointerdown", (e) => {
            this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            this.wasDragging = false;

            if (this.pointers.size === 1) {
                this.startX = e.clientX;
                this.startY = e.clientY;
                const targetEl = document.elementFromPoint(e.clientX, e.clientY);
                const locEl = targetEl ? targetEl.closest(".loc") : null;
                const hasActiveConstruction = state.locations.some((l) => l.construction && l.construction.active);
                if (locEl && hasActiveConstruction) {
                    const idx = Number(locEl.dataset.locIndex);
                    const loc = state.locations[idx];
                    if (loc && loc.owner === "player") {
                        this.dragFromLoc = loc;
                        const vpRect = viewport.getBoundingClientRect();
                        const lRect = locEl.getBoundingClientRect();
                        const line = document.createElementNS(SVG_NS, "line");
                        line.setAttribute("x1", String(lRect.left - vpRect.left + lRect.width / 2));
                        line.setAttribute("y1", String(lRect.top - vpRect.top + lRect.height / 2));
                        line.setAttribute("x2", String(e.clientX - vpRect.left));
                        line.setAttribute("y2", String(e.clientY - vpRect.top));
                        line.setAttribute("stroke", "#fbc531");
                        line.setAttribute("stroke-width", "4");
                        svg.appendChild(line);
                        this.tempLine = line;
                    }
                }
            } else if (this.pointers.size === 2) {
                if (this.tempLine) {
                    this.tempLine.remove();
                    this.tempLine = null;
                }
                this.dragFromLoc = null;
                const pts = Array.from(this.pointers.values());
                const p0 = pts[0];
                const p1 = pts[1];
                if (p0 && p1) this.lastPinchDist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
            }
        });

        viewport.addEventListener("pointermove", (e) => {
            if (!this.pointers.has(e.pointerId)) return;
            this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (this.pointers.size === 2) {
                const pts = Array.from(this.pointers.values());
                const p0 = pts[0];
                const p1 = pts[1];
                if (p0 && p1) {
                    const dist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
                    if (this.lastPinchDist > 0) {
                        this.zoom = Math.min(1.8, Math.max(0.75, this.zoom * (dist / this.lastPinchDist)));
                        applyTransform();
                    }
                    this.lastPinchDist = dist;
                }
                return;
            }

            if (Math.hypot(e.clientX - this.startX, e.clientY - this.startY) > 10) {
                this.wasDragging = true;
            }

            if (this.dragFromLoc && this.tempLine) {
                const vpRect = viewport.getBoundingClientRect();
                this.tempLine.setAttribute("x2", String(e.clientX - vpRect.left));
                this.tempLine.setAttribute("y2", String(e.clientY - vpRect.top));
            } else if (this.pointers.size === 1 && this.wasDragging) {
                this.panX += e.clientX - this.startX;
                this.panY += e.clientY - this.startY;
                this.startX = e.clientX;
                this.startY = e.clientY;
                applyTransform();
            }
        });

        const onEnd = (e) => {
            if (this.tempLine) {
                this.tempLine.remove();
                this.tempLine = null;
            }
            const targetEl = document.elementFromPoint(e.clientX, e.clientY);
            const locEl = targetEl ? targetEl.closest(".loc") : null;

            if (this.dragFromLoc && this.wasDragging && locEl) {
                const toIdx = Number(locEl.dataset.locIndex);
                const toLoc = state.locations[toIdx];
                if (toLoc && toLoc.index !== this.dragFromLoc.index && toLoc.construction && toLoc.construction.active) {
                    UI.openRouteCreator(this.dragFromLoc, toLoc);
                }
            }

            this.dragFromLoc = null;
            this.pointers.delete(e.pointerId);
            if (this.pointers.size < 2) this.lastPinchDist = 0;
            setTimeout(() => { this.wasDragging = false; }, 50);
        };

        viewport.addEventListener("pointerup", onEnd);
        viewport.addEventListener("pointercancel", onEnd);
    }
};

// ============================================================================
// ПОДКЛЮЧЕНИЕ КНОПОК
// ============================================================================
function bindButtons() {
    const on = (id, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", handler);
    };
    on("btn-start", () => Game.startMission());
    on("btn-map", () => UI.closeAllModals());
    on("btn-tasks", () => UI.openTasks());
    on("btn-settings", () => UI.openSettings());
    on("btn-close-modal", () => UI.closeAllModals());
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindButtons);
} else {
    bindButtons();
}

// для отладки в консоли
window.Game = Game;
window.UI = UI;
window.Gestures = Gestures;
