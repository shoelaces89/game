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
 * @typedef {Object} GameNode
 * @property {string} id
 * @property {string} name
 * @property {string} type
 * @property {string} status
 * @property {number} circle
 * @property {number} x
 * @property {number} y
 * @property {boolean} visible
 * @property {Object.<string, number>} storage
 * @property {string[]} buildings
 * @property {ConstructionItem} [construction]
 * @property {BarnItem} [barn]
 */

/**
 * @typedef {Object} RouteItem
 * @property {number} id
 * @property {string} from
 * @property {string} to
 * @property {string} resource
 * @property {number} duration
 * @property {number} progress
 * @property {number} inTransit
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
 * @property {GameNode[]} nodes
 * @property {Array.<[string, string]>} edges
 */

// ============================================================================
// КОНФИГУРАЦИЯ И ЭТАПЫ (Разделы 2, 3, 11)
// ============================================================================
const MISSION_STAGES = [
    { id: 1, name: "Село", timer: 600 },
    { id: 2, name: "Разведка" },
    { id: 3, name: "Присоединение города" },
    { id: 4, name: "Развитие города" },
    { id: 5, name: "Подготовка к набегу", timer: 600 },
    { id: 6, name: "Отражение набега" }
];

/** @type {GameNode[]} */
const INITIAL_NODES = [
    {
        id: "village_1",
        name: "Село Родное",
        type: "village",
        status: "owned",
        circle: 0,
        x: 0,
        y: 0,
        visible: true,
        storage: { wood: 10, rye: 0 },
        buildings: [
            "Лесопилка", "Смолокурня", "Угольная яма", "Плотницкая",
            "Кожевня", "Мельница", "Маслобойня", "Коптильня", "Медоварня", "Пекарня"
        ],
        construction: {
            id: "palisade",
            name: "Частокол",
            reqRes: "wood",
            reqAmount: 150,
            currentAmount: 0,
            active: false,
            done: false
        }
    },
    {
        id: "forest_1",
        name: "Бор",
        type: "res_forest",
        status: "free",
        circle: 1,
        x: -130,
        y: -80,
        visible: false,
        storage: { wood: 80 },
        buildings: []
    },
    {
        id: "field_1",
        name: "Нива",
        type: "res_field",
        status: "free",
        circle: 1,
        x: 130,
        y: -70,
        visible: false,
        storage: { rye: 0 },
        barn: { current: 0, max: 100, done: false },
        buildings: []
    },
    {
        id: "river_1",
        name: "Река Стугна",
        type: "res_river",
        status: "free",
        circle: 2,
        x: 0,
        y: -170,
        visible: false,
        storage: {},
        buildings: []
    },
    {
        id: "pasture_1",
        name: "Заливные луга",
        type: "res_pasture",
        status: "free",
        circle: 2,
        x: -170,
        y: 70,
        visible: false,
        storage: {},
        buildings: []
    },
    {
        id: "mines_1",
        name: "Рудные недра",
        type: "res_mines",
        status: "free",
        circle: 2,
        x: 170,
        y: 80,
        visible: false,
        storage: {},
        buildings: []
    },
    {
        id: "city_1",
        name: "Град Чернигов",
        type: "city",
        status: "neutral",
        circle: 3,
        x: 0,
        y: 180,
        visible: false,
        storage: {},
        buildings: [
            "Гончарная", "Кузня", "Оружейная мастерская",
            "Мастерская бронника", "Верфь", "Рынок", "Княжий терем"
        ]
    },
    {
        id: "bandits_1",
        name: "Лагерь разбойников",
        type: "bandits",
        status: "hostile",
        circle: 3,
        x: 150,
        y: 210,
        visible: false,
        storage: {},
        buildings: []
    }
];

/** @type {Array.<[string, string]>} */
const INITIAL_EDGES = [
    ["village_1", "forest_1"],
    ["village_1", "field_1"],
    ["village_1", "pasture_1"],
    ["forest_1", "river_1"],
    ["field_1", "river_1"],
    ["field_1", "mines_1"],
    ["pasture_1", "city_1"],
    ["mines_1", "city_1"],
    ["city_1", "bandits_1"]
];

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
            palisade: { title: "Построить частокол в селе (150 древесины)", done: false, stage: 1 },
            harvest: { title: "Собрать урожай (заполнить амбар в поле)", done: false, stage: 1 },
            find_city: { title: "Разведать земли и найти город", done: false, stage: 2 },
            defeat_bandits: { title: "Победить бандитов и присоединить город", done: false, stage: 3 }
        },
        paternalism: 50,
        passionarity: 50,
        army: { vityazi: 1 },
        nodes: JSON.parse(JSON.stringify(INITIAL_NODES)),
        edges: JSON.parse(JSON.stringify(INITIAL_EDGES))
    };
}

/** @type {GameState} */
let state = createInitialState();

// ============================================================================
// УТИЛИТЫ И УВЕДОМЛЕНИЯ (Разделы 5, 6, 10.4)
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
    return state.nodes.reduce(function (sum, n) {
        return sum + (n.storage.wood || 0);
    }, 0);
}

/**
 * @param {string} idA
 * @param {string} idB
 * @returns {number}
 */
function getGraphDistance(idA, idB) {
    if (idA === idB) return 0;
    /** @type {Array.<[string, number]>} */
    const queue = [[idA, 0]];
    const visited = new Set([idA]);

    while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        const [curr, dist] = item;

        for (const [u, v] of state.edges) {
            const next = u === curr ? v : (v === curr ? u : null);
            if (next && !visited.has(next)) {
                if (next === idB) return dist + 1;
                visited.add(next);
                queue.push([next, dist + 1]);
            }
        }
    }
    return 1;
}

// ============================================================================
// ЛОГИКА ИГРЫ И ЭТАПОВ
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

        MapEngine.init();
        this.running = true;
        this.lastTick = performance.now();
        notify("Вы получили стартовый запас: 20 провианта, 10 древесины, 5 крестьян, 1 юнит витязей");
        UI.updateTopBar();
        const self = this;
        requestAnimationFrame(function (now) { self.loop(now); });
    },

    /**
     * @param {number} now
     */
    loop(now) {
        if (!this.running) return;
        const dt = (now - this.lastTick) / 1000;
        this.lastTick = now;

        this.updateTimers(dt);
        this.updateRoutes(dt);
        this.checkStageProgression();

        UI.updateTopBar();
        MapEngine.render();
        const self = this;
        requestAnimationFrame(function (t) { self.loop(t); });
    },

    /**
     * @param {number} dt
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
     * @param {number} dt
     */
    updateRoutes(dt) {
        for (let i = state.routes.length - 1; i >= 0; i--) {
            const r = state.routes.at(i);
            if (!r) continue;
            const src = state.nodes.find(function (n) { return n.id === r.from; });
            const dst = state.nodes.find(function (n) { return n.id === r.to; });
            if (!src || !dst || !dst.construction || dst.construction.done) {
                state.routes.splice(i, 1);
                continue;
            }
            if (r.inTransit > 0) {
                r.progress += dt;
                if (r.progress >= r.duration) {
                    dst.construction.currentAmount += r.inTransit;
                    r.inTransit = 0;
                    r.progress = 0;
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
                    const batch = Math.min(25, available, needed);
                    src.storage[r.resource] -= batch;
                    r.inTransit = batch;
                    r.progress = 0;
                }
            }
        }
    },
    checkStageProgression() {
        if (state.current_stage === 1 && state.tasks.palisade.done && state.tasks.harvest.done) {
            state.current_stage = 2;
            state.mission_timer = 0;
            notify("Этап 2: Разведка и поиск города");
        }
        const city = state.nodes.find(function (n) { return n.id === "city_1"; });
        if (state.current_stage === 2 && city && city.visible) {
            state.tasks.find_city.done = true;
            state.current_stage = 3;
            notify("Задание выполнено! Этап 3: Присоединение города");
        }
    },
    /**
     • @param {string} nodeId
     */
    scoutNode(nodeId) {
        const node = state.nodes.find(function (n) { return n.id === nodeId; });
        if (!node || node.visible) return;
        const cost = node.type === "res_river" ? 2 : node.circle;
        if (!spendProvant(cost)) {
            notify("Недостаточно провианта (нужно " + cost + ")");
            return;
        }
        node.visible = true;
        notify("Открыта локация: " + node.name);
        UI.openNodeModal(node);
    },
    /**
     • @param {string} nodeId
     */
    claimNode(nodeId) {
        const node = state.nodes.find(function (n) { return n.id === nodeId; });
        if (!node || !node.visible) return;
        if (node.status === "free") {
            node.status = "owned";
            notify("Локация «" + node.name + "» занята");
            UI.openNodeModal(node);
        } else if (node.type === "bandits" && node.status === "hostile") {
            if ((state.army.vityazi || 0) >= 1) {
                node.status = "owned";
                const city = state.nodes.find(function (n) { return n.id === "city_1"; });
                if (city) city.status = "owned";
                state.workers.free += 15;
                state.workers.total += 15;
                state.tasks.defeat_bandits.done = true;
                state.current_stage = 4;
                notify("Задание выполнено! Бандиты разбиты, город присоединился (+15 крестьян)");
                UI.openNodeModal(node);
            } else {
                notify("Нет войск для атаки!");
            }
        }
    },
    /**
     • @param {string} fromId
     • @param {string} toId
     • @param {string} resource
     */
    createRoute(fromId, toId, resource) {
        const dist = getGraphDistance(fromId, toId);
        const duration = 5 * dist;
        state.routes.push({
            id: Date.now(),
            from: fromId,
            to: toId,
            resource: resource,
            duration: duration,
            progress: 0,
            inTransit: 0
        });
        notify("Маршрут создан (время рейса: " + duration + " сек.)");
    },
    /**
     • @param {number} routeId
     */
    cancelRoute(routeId) {
        const idx = state.routes.findIndex(function (r) { return r.id === routeId; });
        if (idx !== -1) {
            state.routes.splice(idx, 1);
            notify("Маршрут отменён (груз в пути утерян)");
        }
    }
};
// ============================================================================
// ИНТЕРФЕЙС И МОДАЛЬНЫЕ ОКНА (Раздел 10 — чистый DOM без HTML-строк)
// ============================================================================
const UI = {
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
     • @param {GameNode} node
     */
    openNodeModal(node) {
        const self = this;
        if (!node.visible) {
            const canScout = MapEngine.isAdjacentToVisible(node.id);
            const cost = node.type === "res_river" ? 2 : node.circle;
            this.openModal("Неизведанные земли", function (body) {
                const infoCard = self.createCard(body);
                infoCard.textContent = "Локация скрыта туманом войны.";
                if (canScout) {
                    self.createButton(
                        body,
                        "Разведать (" + cost + " провианта)",
                        function () { Game.scoutNode(node.id); },
                        "primary"
                    );
                } else {
                    const warnCard = self.createCard(body);
                    warnCard.style.color = "#a89b84";
                    warnCard.textContent = "Сначала разведайте соседнюю локацию.";
                }
            });
            return;
        }
        this.openModal(node.name, function (body) {
            const statusCard = self.createCard(body);
            statusCard.appendChild(document.createTextNode("Статус: "));
            const bStatus = document.createElement("b");
            bStatus.textContent = node.status;
            statusCard.appendChild(bStatus);
            const resKeys = Object.keys(node.storage || {});
            if (resKeys.length > 0) {
                const resText = resKeys.map(function (k) { return k + ": " + node.storage[k]; }).join(", ");
                const storageCard = self.createCard(body);
                storageCard.textContent = "Склад: " + resText;
            }
            if (node.status === "free") {
                self.createButton(
                    body,
                    "Занять локацию",
                    function () { Game.claimNode(node.id); },
                    "primary"
                );
            } else if (node.type === "city" && node.status === "neutral") {
                const cityCard = self.createCard(body);
                cityCard.textContent = "Горожане напуганы. Захватите лагерь бандитов, чтобы присоединить город.";
            } else if (node.type === "bandits" && node.status === "hostile") {
                self.createButton(
                    body,
                    "Атаковать бандитов (Витязи: " + (state.army.vityazi || 0) + ")",
                    function () { Game.claimNode(node.id); },
                    "primary",
                    "#9e3b33"
                );
            }
            if (node.construction) {
                const c = node.construction;
                const cCard = self.createCard(body);
                const cTitle = document.createElement("b");
                cTitle.textContent = "Стройка: " + c.name;
                cCard.appendChild(cTitle);
                cCard.appendChild(document.createTextNode(
                    " (" + c.currentAmount + "/" + c.reqAmount + " " + c.reqRes + ")"
                ));
                cCard.appendChild(document.createElement("br"));
                if (c.done) {
                    const doneBadge = document.createElement("span");
                    doneBadge.className = "badge done";
                    doneBadge.textContent = "Построено";
                    cCard.appendChild(doneBadge);
                } else {
                    const btnText = c.active
                        ? "Стройка активна (проведите маршрут на карте)"
                        : "Активировать стройку";
                    self.createButton(
                        cCard,
                        btnText,
                        function () { self.toggleConstruction(node.id); },
                        "primary"
                    );
                }
            }
            if (node.id === "field_1" && node.status === "owned" && node.barn && !node.barn.done) {
                const barnCard = self.createCard(body);
                const bTitle = document.createElement("b");
                bTitle.textContent = "Амбар поля: ";
                barnCard.appendChild(bTitle);
                barnCard.appendChild(document.createTextNode(
                    node.barn.current + "/" + node.barn.max + " ржи"
                ));
                self.createButton(
                    barnCard,
                    "Собрать урожай (+50 ржи)",
                    function () { self.gatherHarvestTest(); },
                    "primary"
                );
            }
            const activeRoutes = state.routes.filter(function (r) {
                return r.to === node.id || r.from === node.id;
            });
            if (activeRoutes.length > 0) {
                const rCard = self.createCard(body);
                const rTitle = document.createElement("b");
                rTitle.textContent = "Логистические маршруты:";
                rCard.appendChild(rTitle);
                activeRoutes.forEach(function (r) {
                    const row = document.createElement("div");
                    row.style.marginTop = "6px";
                    row.style.fontSize = "12px";
                    row.textContent = r.from + " → " + r.to + " (" + r.resource + ") | В пути: " + r.inTransit;
                    const cancelBtn = self.createButton(
                        row,
                        "Отменить маршрут",
                        function () { self.handleCancelRoute(r.id, node.id); },
                        "",
                        "#9e3b33"
                    );
                    cancelBtn.style.marginTop = "4px";
                    rCard.appendChild(row);
                });
            }
            if (node.buildings && node.buildings.length > 0 && node.status === "owned") {
                const bCard = self.createCard(body);
                const bHeader = document.createElement("b");
                bHeader.textContent = "Доступные постройки:";
                bCard.appendChild(bHeader);
                bCard.appendChild(document.createElement("br"));
                const listSpan = document.createElement("span");
                listSpan.style.fontSize = "12px";
                listSpan.style.color = "#a89b84";
                listSpan.textContent = node.buildings.join(", ");
                bCard.appendChild(listSpan);
            }
        });
    },
    /**
     • @param {number} routeId
     • @param {string} nodeId
     */
    handleCancelRoute(routeId, nodeId) {
        Game.cancelRoute(routeId);
        const node = state.nodes.find(function (n) { return n.id === nodeId; });
        if (node) this.openNodeModal(node);
    },
    /**
     • @param {string} nodeId
     */
    toggleConstruction(nodeId) {
        const node = state.nodes.find(function (n) { return n.id === nodeId; });
        if (node && node.construction) {
            node.construction.active = !node.construction.active;
            if (node.construction.active) {
                notify("Проведите пальцем от локации-источника к этой локации на карте");
                this.closeAllModals();
            } else {
                this.openNodeModal(node);
            }
        }
    },
    gatherHarvestTest() {
        const field = state.nodes.find(function (n) { return n.id === "field_1"; });
        if (!field || !field.barn) return;
        field.barn.current = Math.min(100, field.barn.current + 50);
        state.provant.from_barns += 50;
        if (field.barn.current >= 100) {
            field.barn.done = true;
            state.tasks.harvest.done = true;
            notify("Склад заполнен (100/100)");
            notify("Задание выполнено");
        }
        this.openNodeModal(field);
    },
    /**
     • @param {GameNode} fromNode
     • @param {GameNode} toNode
     */
    openRouteCreator(fromNode, toNode) {
        if (!toNode.construction) return;
        const keys = Object.keys(fromNode.storage || {}).filter(function (k) {
            return fromNode.storage[k] > 0;
        });
        if (keys.length === 0) {
            notify("На складе источника нет ресурсов!");
            return;
        }
        const self = this;
        const targetName = toNode.construction.name;
        this.openModal("Создание маршрута", function (body) {
            const infoCard = self.createCard(body);
            infoCard.appendChild(document.createTextNode("Откуда: "));
            const bFrom = document.createElement("b");
            bFrom.textContent = fromNode.name;
            infoCard.appendChild(bFrom);
            infoCard.appendChild(document.createElement("br"));
            infoCard.appendChild(document.createTextNode("Куда: "));
            const bTo = document.createElement("b");
            bTo.textContent = toNode.name;
            infoCard.appendChild(bTo);
            infoCard.appendChild(document.createTextNode(" (" + targetName + ")"));
            keys.forEach(function (res) {
                self.createButton(
                    body,
                    "Возить: " + res + " (доступно " + fromNode.storage[res] + ")",
                    function () {
                        Game.createRoute(fromNode.id, toNode.id, res);
                        self.closeAllModals();
                    },
                    "primary"
                );
            });
        });
    }
};
// ============================================================================
// ДВИЖОК КАРТЫ И ЖЕСТОВ (Разделы 1.3, 10.3)
// ============================================================================
const MapEngine = {
    /** @type {HTMLCanvasElement|null} /
     canvas: null,
     /* @type {CanvasRenderingContext2D|null} /
     ctx: null,
     camX: 0,
     camY: 0,
     zoom: 1,
     /* @type {Map<number, {x: number, y: number}>} /
     pointers: new Map(),
     isDragging: false,
     dragStart: { x: 0, y: 0, rawX: 0, rawY: 0 },
     /* @type {GameNode|null} /
     routeDragFrom: null,
     /* @type {{x: number, y: number}|null} /
     routeDragPos: null,
     /* @type {number|null} */
    lastPinchDist: null,
    init() {
        const el = document.getElementById("map-canvas");
        if (!(el instanceof HTMLCanvasElement)) return;
        this.canvas = el;
        this.ctx = el.getContext("2d");
        this.resize();
        const self = this;
        window.addEventListener("resize", function () { self.resize(); });
        this.bindEvents();
    },
    resize() {
        if (!this.canvas || !this.canvas.parentElement) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    },
    /**
     • @param {number} sx
     • @param {number} sy
     • @returns {{x: number, y: number}}
     */
    screenToWorld(sx, sy) {
        const w = this.canvas ? this.canvas.width : 0;
        const h = this.canvas ? this.canvas.height : 0;
        return {
            x: (sx - w / 2 - this.camX) / this.zoom,
            y: (sy - h / 2 - this.camY) / this.zoom
        };
    },
    /**
     • @param {number} wx
     • @param {number} wy
     • @returns {GameNode|undefined}
     */
    getNodeAt(wx, wy) {
        return state.nodes.find(function (n) { return Math.hypot(n.x - wx, n.y - wy) <= 28; });
    },
    /**
     • @param {string} nodeId
     • @returns {boolean}
     */
    isAdjacentToVisible(nodeId) {
        return state.edges.some(function (edge) {
            const [u, v] = edge;
            if (u === nodeId) {
                const neighbor = state.nodes.find(function (n) { return n.id === v; });
                return Boolean(neighbor && neighbor.visible);
            }
            if (v === nodeId) {
                const neighbor = state.nodes.find(function (n) { return n.id === u; });
                return Boolean(neighbor && neighbor.visible);
            }
            return false;
        });
    },
    bindEvents() {
        const c = this.canvas;
        if (!c) return;
        const self = this;
        c.addEventListener("wheel", function (e) {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            self.zoom = Math.min(2.2, Math.max(0.5, self.zoom * factor));
        }, { passive: false });
        c.addEventListener("pointerdown", function (e) {
            self.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const rect = c.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            if (self.pointers.size === 1) {
                const w = self.screenToWorld(sx, sy);
                const hit = self.getNodeAt(w.x, w.y);
                const hasActiveConstruction = state.nodes.some(function (n) {
                    return Boolean(n.construction && n.construction.active);
                });
                if (hit && hit.visible && hit.status === "owned" && hasActiveConstruction) {
                    self.routeDragFrom = hit;
                    self.routeDragPos = w;
                } else {
                    self.isDragging = true;
                    self.dragStart = { x: sx - self.camX, y: sy - self.camY, rawX: sx, rawY: sy };
                }
            } else if (self.pointers.size === 2) {
                self.isDragging = false;
                self.routeDragFrom = null;
                self.lastPinchDist = self.getPinchDistance();
            }
        });
        c.addEventListener("pointermove", function (e) {
            if (!self.pointers.has(e.pointerId)) return;
            self.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const rect = c.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            if (self.pointers.size === 2) {
                const dist = self.getPinchDistance();
                if (self.lastPinchDist) {
                    const scale = dist / self.lastPinchDist;
                    self.zoom = Math.min(2.2, Math.max(0.5, self.zoom * scale));
                }
                self.lastPinchDist = dist;
            } else if (self.routeDragFrom) {
                self.routeDragPos = self.screenToWorld(sx, sy);
            } else if (self.isDragging) {
                self.camX = sx - self.dragStart.x;
                self.camY = sy - self.dragStart.y;
            }
        });
        /**
         * @param {PointerEvent} e
         */
        const endPointer = function (e) {
            const rect = c.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            if (self.routeDragFrom) {
                const w = self.screenToWorld(sx, sy);
                const target = self.getNodeAt(w.x, w.y);
                if (target && target.id !== self.routeDragFrom.id && target.construction && target.construction.active) {
                    UI.openRouteCreator(self.routeDragFrom, target);
                } else if (target && target.id === self.routeDragFrom.id) {
                    UI.openNodeModal(target);
                }
                self.routeDragFrom = null;
                self.routeDragPos = null;
            } else if (self.isDragging && self.pointers.size === 1) {
                if (Math.hypot(sx - self.dragStart.rawX, sy - self.dragStart.rawY) < 10) {
                    const w = self.screenToWorld(sx, sy);
                    const hit = self.getNodeAt(w.x, w.y);
                    if (hit && (hit.visible || self.isAdjacentToVisible(hit.id))) {
                        UI.openNodeModal(hit);
                    }
                }
            }
            self.pointers.delete(e.pointerId);
            if (self.pointers.size < 2) self.lastPinchDist = null;
            if (self.pointers.size === 0) self.isDragging = false;
        };
        c.addEventListener("pointerup", endPointer);
        c.addEventListener("pointercancel", endPointer);
    },
    /**
     • @returns {number}
     */
    getPinchDistance() {
        const pts = Array.from(this.pointers.values());
        const p0 = pts.at(0);
        const p1 = pts.at(1);
        if (!p0 || !p1) return 0;
        return Math.hypot(p0.x - p1.x, p0.y - p1.y);
    },
    render() {
        const ctx = this.ctx;
        const canvas = this.canvas;
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(canvas.width / 2 + this.camX, canvas.height / 2 + this.camY);
        ctx.scale(this.zoom, this.zoom);
        state.edges.forEach(function (edge) {
            const [idA, idB] = edge;
            const a = state.nodes.find(function (n) { return n.id === idA; });
            const b = state.nodes.find(function (n) { return n.id === idB; });
            if (!a || !b) return;
            if (!a.visible && !b.visible) return;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = (a.visible && b.visible) ? "#8c6d3f" : "rgba(140, 109, 63, 0.35)";
            ctx.lineWidth = 3;
            ctx.stroke();
        });
        state.routes.forEach(function (r) {
            const a = state.nodes.find(function (n) { return n.id === r.from; });
            const b = state.nodes.find(function (n) { return n.id === r.to; });
            if (!a || !b) return;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = "#4cd137";
            ctx.lineWidth = 2;
            ctx.setLineDash(Array.of(6, 4));
            ctx.stroke();
            ctx.setLineDash(Array.of());
        });
        if (this.routeDragFrom && this.routeDragPos) {
            ctx.beginPath();
            ctx.moveTo(this.routeDragFrom.x, this.routeDragFrom.y);
            ctx.lineTo(this.routeDragPos.x, this.routeDragPos.y);
            ctx.strokeStyle = "#fbc531";
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        const self = this;
        state.nodes.forEach(function (node) {
            const adj = self.isAdjacentToVisible(node.id);
            if (!node.visible && !adj) return;
            ctx.beginPath();
            ctx.arc(node.x, node.y, 24, 0, Math.PI * 2);
            if (!node.visible) {
                ctx.fillStyle = "#353b48";
                ctx.strokeStyle = "#718093";
            } else if (node.status === "owned") {
                ctx.fillStyle = "#4a7c59";
                ctx.strokeStyle = "#e6c27a";
            } else if (node.status === "hostile") {
                ctx.fillStyle = "#9e3b33";
                ctx.strokeStyle = "#ff7675";
            } else {
                ctx.fillStyle = "#3b6998";
                ctx.strokeStyle = "#dcdde1";
            }
            ctx.lineWidth = (node.construction && node.construction.active) ? 4 : 2;
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#f0e6d2";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            const cost = node.type === "res_river" ? 2 : node.circle;
            const label = node.visible ? node.name : "? (" + cost + " пров.)";
            ctx.fillText(label, node.x, node.y + 38);
        });
        ctx.restore();
    }
};
window.Game = Game;
window.UI = UI;
