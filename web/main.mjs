const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const hud = {
  score: document.getElementById("score"),
  lives: document.getElementById("lives"),
  level: document.getElementById("level"),
  enemies: document.getElementById("enemies"),
  shield: document.getElementById("shield"),
  levelName: document.getElementById("level-name"),
};
const evoLog = document.getElementById("evo-log");
const evolveBtn = document.getElementById("evolve");
const wishBtn = document.getElementById("wish");
const restartBtn = document.getElementById("restart");
const parentBtn = document.getElementById("parent");
const devPanel = document.getElementById("dev-panel");
const buddyName = document.getElementById("buddy-name");
const buddyToast = document.getElementById("buddy-toast");

const TILE = 60;
const N = 13;
const DIRS = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
const DIR_KEYS = {
  arrowup: "up", w: "up",
  arrowdown: "down", s: "down",
  arrowleft: "left", a: "left",
  arrowright: "right", d: "right",
};

let state = null;
let prevState = null;
let running = false;
let loopToken = 0;
let busy = false;
let paused = true;
let lastDir = "up";
let tickMs = 150;
let effects = [];
let shake = 0;
let lastFrame = 0;
let themes = [];
let buddy = { name: "小光", level: 1 };

const keys = new Set();
const arr = (v) => (Array.isArray(v) ? v : []);
const key = (t) => `${t.x},${t.y}`;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

async function post(path, body = {}) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const css = canvas.getBoundingClientRect().width || 780;
  const px = Math.round(css * dpr);
  if (canvas.width !== px) {
    canvas.width = px;
    canvas.height = px;
  }
  canvas._dpr = dpr;
  canvas._css = css;
}

function cellPx() {
  const dpr = canvas._dpr || 1;
  return (canvas.width / dpr) / N;
}

function cellCenter(x, y) {
  const t = cellPx();
  return { x: (x + 0.5) * t, y: (y + 0.5) * t };
}

function burst(x, y, color, count = 12, power = 1) {
  const c = cellCenter(x, y);
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = (40 + Math.random() * 160) * power;
    effects.push({
      x: c.x, y: c.y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.35 + Math.random() * 0.45,
      max: 0.8,
      color,
      size: 1.5 + Math.random() * 2.5,
    });
  }
}

function setBuddy(next) {
  if (!next) return;
  buddy = { name: next.name || "小光", level: Number(next.level) || 1 };
  buddyName.textContent = `${buddy.name} Lv.${buddy.level}`;
}

let toastTimer = 0;
function buddySay(text) {
  buddyToast.textContent = text;
  buddyToast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => buddyToast.classList.remove("show"), 2600);
}

function absorb(next, meta) {
  if (meta) {
    if (meta.buddy) setBuddy(meta.buddy);
    if (Array.isArray(meta.themes) && meta.themes.length) themes = meta.themes;
  }
  if (prevState) {
    const nb = new Set(arr(next.bricks).map(key));
    for (const t of arr(prevState.bricks)) if (!nb.has(key(t))) burst(t.x, t.y, "#f59e0b", 8, 0.7);
    const ne = new Set(arr(next.enemies).map(key));
    for (const e of arr(prevState.enemies)) if (!ne.has(key(e))) burst(e.x, e.y, "#fb7185", 18, 1.1);
    if (next.status === "lost" && prevState.status !== "lost") {
      const b = next.base || { x: 6, y: 12 };
      burst(b.x, b.y, "#f97316", 40, 1.8);
      burst(b.x, b.y, "#fb7185", 22, 1.2);
      shake = 18;
    }
    if ((next.lives ?? 3) < (prevState.lives ?? 3)) {
      const p = next.player || { x: 4, y: 12 };
      burst(p.x, p.y, "#38bdf8", 18, 0.9);
      shake = 9;
    }
    if (next.status === "won" && prevState.status !== "won") {
      burst(6, 6, "#34d399", 50, 1.6);
    }
  }
  prevState = state;
  state = next;
  updateHud();
}

function updateHud() {
  if (!state) return;
  hud.score.textContent = String(state.score ?? 0);
  hud.lives.textContent = String(state.lives ?? 0);
  hud.level.textContent = `${state.level ?? 1} / ${state.levels ?? 2}`;
  hud.enemies.textContent = String(arr(state.enemies).length);
  hud.shield.textContent = String(state.shield ?? 0);
  const theme = themeList().find((t) => t.id === state.level_name);
  hud.levelName.textContent = theme
    ? `${theme.emoji || ""} ${theme.label || theme.id}`.trim()
    : (state.level_name || "小世界");
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawGrid(t) {
  ctx.fillStyle = "#070c15";
  ctx.fillRect(0, 0, N * t, N * t);
  ctx.strokeStyle = "rgba(56,189,248,0.055)";
  ctx.lineWidth = 1;
  for (let i = 1; i < N; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * t, 0); ctx.lineTo(i * t, N * t);
    ctx.moveTo(0, i * t); ctx.lineTo(N * t, i * t);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(6.5 * t, 6.5 * t, 0, 6.5 * t, 6.5 * t, 7.2 * t);
  g.addColorStop(0, "rgba(56,189,248,0.055)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, N * t, N * t);
}

function drawBrick(x, y, t) {
  const px = x * t + 2, py = y * t + 2, s = t - 4;
  roundRect(px, py, s, s, 5);
  ctx.fillStyle = "#7c2d12";
  ctx.fill();
  ctx.fillStyle = "#b45309";
  for (let row = 0; row < 3; row += 1) {
    const offset = row % 2 ? s * 0.22 : 0;
    for (let col = 0; col < 2; col += 1) {
      ctx.fillRect(px + 2 + col * s * 0.48 + (row % 2 ? s * 0.24 : 0), py + 3 + row * s * 0.31, s * 0.4, s * 0.24);
    }
  }
  ctx.strokeStyle = "rgba(255,190,120,0.18)";
  ctx.stroke();
}

function drawSteel(x, y, t) {
  const px = x * t + 2, py = y * t + 2, s = t - 4;
  const g = ctx.createLinearGradient(px, py, px + s, py + s);
  g.addColorStop(0, "#94a3b8");
  g.addColorStop(0.45, "#475569");
  g.addColorStop(1, "#1e293b");
  roundRect(px, py, s, s, 7);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  roundRect(px + 4, py + 4, s - 8, s - 8, 5);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(px + s * 0.28, py + s * 0.28, s * 0.12, s * 0.12);
  ctx.fillRect(px + s * 0.6, py + s * 0.6, s * 0.12, s * 0.12);
}

function drawWater(x, y, t, now) {
  const px = x * t + 1, py = y * t + 1, s = t - 2;
  roundRect(px, py, s, s, 8);
  const g = ctx.createLinearGradient(px, py, px + s, py + s);
  g.addColorStop(0, "#075985");
  g.addColorStop(1, "#0c4a6e");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(125,211,252,0.45)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i += 1) {
    const yy = py + s * (0.3 + i * 0.2) + Math.sin(now * 0.002 + x + y + i) * 2.5;
    ctx.beginPath();
    ctx.moveTo(px + s * 0.16, yy);
    ctx.bezierCurveTo(px + s * 0.38, yy - 4, px + s * 0.62, yy + 4, px + s * 0.84, yy);
    ctx.stroke();
  }
}

function drawBase(t) {
  if (!state || !state.base) return;
  const { x, y } = state.base;
  const px = x * t + 3, py = y * t + 3, s = t - 6;
  const lost = state.status === "lost";
  ctx.save();
  ctx.shadowColor = lost ? "rgba(251,113,133,0.8)" : "rgba(56,189,248,0.9)";
  ctx.shadowBlur = 18;
  roundRect(px, py, s, s, 10);
  ctx.fillStyle = lost ? "#7f1d1d" : "#075985";
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = lost ? "#fb7185" : "#7dd3fc";
  ctx.lineWidth = 2;
  roundRect(px + 5, py + 5, s - 10, s - 10, 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px + s / 2, py + s / 2, s * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = lost ? "#fb7185" : "#bae6fd";
  ctx.fill();
  ctx.fillStyle = lost ? "#fecdd3" : "#e0f2fe";
  ctx.font = `700 ${Math.max(12, s * 0.32)}px ui-sans-serif, system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("B", px + s / 2, py + s / 2 + 1);
  ctx.restore();
}

function drawTank(x, y, dir, player, t, shield = 0) {
  const c = cellCenter(x, y);
  const s = t * 0.72;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(DIRS[dir] ?? 0);
  const body = player ? "#38bdf8" : "#fb7185";
  const dark = player ? "#0369a1" : "#9f1239";
  ctx.shadowColor = player ? "rgba(56,189,248,0.55)" : "rgba(251,113,133,0.5)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = dark;
  roundRect(-s / 2, -s * 0.44, s, s * 0.88, 9);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#0b1220";
  roundRect(-s / 2, -s * 0.5, s, s * 0.18, 5); ctx.fill();
  roundRect(-s / 2, s * 0.32, s, s * 0.18, 5); ctx.fill();
  const g = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
  g.addColorStop(0, body);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  roundRect(-s * 0.32, -s * 0.32, s * 0.64, s * 0.64, 7);
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e2e8f0";
  roundRect(-s * 0.07, -s * 0.62, s * 0.14, s * 0.46, 3);
  ctx.fill();
  ctx.restore();

  if (shield > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(125,211,252,0.85)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, t * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawBullet(x, y, t) {
  const c = cellCenter(x, y);
  ctx.save();
  ctx.shadowColor = "rgba(253,224,71,0.95)";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#fde047";
  ctx.beginPath();
  ctx.arc(c.x, c.y, t * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBuddy() {
  if (!state || !state.player) return;
  const t = cellPx();
  const p = cellCenter(state.player.x, state.player.y);
  const bx = clamp(p.x + t * 0.52, t * 0.3, N * t - t * 0.3);
  const by = clamp(p.y - t * 0.44, t * 0.3, N * t - t * 0.3);
  const r = t * 0.17;
  const colors = ["#a7f3d0", "#fde68a", "#fbcfe8", "#bfdbfe", "#ddd6fe"];
  const color = colors[(buddy.level - 1) % colors.length];
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  const g = ctx.createRadialGradient(bx - r * 0.4, by - r * 0.4, r * 0.1, bx, by, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.45, color);
  g.addColorStop(1, "#6366f1");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#0b1220";
  ctx.beginPath();
  ctx.arc(bx - r * 0.32, by - r * 0.08, r * 0.12, 0, Math.PI * 2);
  ctx.arc(bx + r * 0.32, by - r * 0.08, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#0b1220";
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath();
  ctx.arc(bx, by + r * 0.18, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function draw(now) {
  const t = cellPx();
  const size = N * t;
  ctx.setTransform(canvas._dpr || 1, 0, 0, canvas._dpr || 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  ctx.save();
  ctx.translate(sx, sy);
  drawGrid(t);
  if (!state) {
    ctx.restore();
    return;
  }
  for (const b of arr(state.bricks)) drawBrick(b.x, b.y, t);
  for (const s of arr(state.steel)) drawSteel(s.x, s.y, t);
  for (const w of arr(state.water)) drawWater(w.x, w.y, t, now);
  drawBase(t);
  for (const e of arr(state.enemies)) drawTank(e.x, e.y, "down", false, t);
  if (state.player) drawTank(state.player.x, state.player.y, state.player.dir, true, t, state.shield || 0);
  drawBuddy();
  for (const b of arr(state.bullets)) drawBullet(b.x, b.y, t);
  for (const p of effects) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (shake > 0) shake *= 0.86;
  if (shake < 0.4) shake = 0;
}

function frame(now) {
  const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  for (const p of effects) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
  }
  effects = effects.filter((p) => p.life > 0);
  draw(now);
  requestAnimationFrame(frame);
}

function inputFromKeys() {
  const active = ["up", "right", "down", "left"].filter((d) => keys.has(d));
  const dir = keys.has(lastDir) ? lastDir : (active[active.length - 1] || lastDir);
  const fire = keys.has("fire");
  const moving = active.length > 0;
  if (moving && fire) return { move: dir, fire: true };
  if (moving) return { move: dir };
  if (fire) return { face: dir, fire: true };
  return {};
}

async function tickOnce() {
  if (busy) return;
  busy = true;
  try {
    const res = await post("/api/tick", { input: inputFromKeys() });
    absorb(res.state, res);
    if (res.state.status !== "playing") {
      stopLoop();
      paused = true;
      showEnd(res.state.status === "won");
    }
  } catch (err) {
    console.error(err);
    stopLoop();
    paused = true;
    showError("The arena stopped responding. Restart the bridge.");
  } finally {
    busy = false;
  }
}

async function loop(token) {
  if (!running || token !== loopToken) return;
  if (!paused) await tickOnce();
  if (running && token === loopToken) window.setTimeout(() => loop(token), tickMs);
}

function startLoop() {
  running = true;
  loopToken += 1;
  loop(loopToken);
}

function stopLoop() {
  running = false;
  loopToken += 1;
}

async function newGame() {
  try {
    const res = await post("/api/new", { seed: 42, levels: 2 });
    absorb(res.state, res);
    effects = [];
    shake = 0;
    overlay.classList.remove("open");
    stopLoop();
    paused = false;
    startLoop();
  } catch (err) {
    showError("小光找不到游戏服务器了，看看 ./play.sh 是不是还在跑。");
  }
}

function sheet(title, text, build) {
  overlay.innerHTML = "";
  const box = document.createElement("div");
  box.className = "sheet";
  const h = document.createElement("h2");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = text;
  box.append(h, p);
  build(box);
  overlay.append(box);
  overlay.classList.add("open");
}

function button(label, primary, onClick) {
  const b = document.createElement("button");
  b.textContent = label;
  if (primary) b.className = "primary";
  else b.className = "ghost";
  b.addEventListener("click", onClick);
  return b;
}

function showStart() {
  sheet("坦克小世界", "和小光一起守护水晶。收集星星，把捣蛋机器人变成朋友。", (box) => {
    const hero = document.createElement("div");
    hero.className = "buddy-hero";
    hero.textContent = "🌟";
    box.append(hero);
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(button("开始冒险", true, () => newGame()));
    actions.append(button("先许个愿", false, () => openWish()));
    box.append(actions);
  });
}

function showEnd(won) {
  const s = state || {};
  const title = won ? "守住啦！" : "水晶裂了……";
  const text = won
    ? `你收集了 ${s.score ?? 0} 颗星星，小光开心得转圈圈。`
    : `没关系，小光把碎片捡回来了。你收集了 ${s.score ?? 0} 颗星星，再来一次？`;
  sheet(title, text, (box) => {
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(button("再来一次", true, () => newGame()));
    actions.append(button("换个世界", false, () => openWish()));
    box.append(actions);
  });
}

function showError(msg) {
  sheet("连接断开了", msg, (box) => {
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(button("再试一次", true, () => boot()));
    box.append(actions);
  });
}

const FALLBACK_THEMES = [
  { id: "candy", label: "糖果世界", emoji: "🍭" },
  { id: "dino", label: "恐龙乐园", emoji: "🦕" },
  { id: "space", label: "太空基地", emoji: "🚀" },
  { id: "ocean", label: "海底泡泡", emoji: "🐠" },
  { id: "rainbow", label: "彩虹云朵", emoji: "🌈" },
];

function themeList() {
  return themes.length ? themes : FALLBACK_THEMES;
}

function resumeGame() {
  overlay.classList.remove("open");
  if (state && state.status === "playing") {
    paused = false;
    startLoop();
  } else if (state) {
    showEnd(state.status === "won");
  }
}

function openWish() {
  if (busy) return;
  stopLoop();
  paused = true;
  sheet("想要什么世界？", "选一个贴纸，Aura 会搭三个小世界，先自己试玩，再让你挑。", (box) => {
    const grid = document.createElement("div");
    grid.className = "theme-grid";
    for (const t of themeList()) {
      const b = document.createElement("button");
      b.className = "theme-chip";
      const emoji = document.createElement("span");
      emoji.className = "emoji";
      emoji.textContent = t.emoji || "✨";
      const label = document.createElement("span");
      label.textContent = t.label || t.id;
      b.append(emoji, label);
      b.addEventListener("click", () => proposeWish(t));
      grid.append(b);
    }
    box.append(grid);
    const actions = document.createElement("div");
    actions.className = "actions wish-actions";
    actions.append(button("先不换", false, () => resumeGame()));
    box.append(actions);
  });
}

async function proposeWish(theme) {
  busy = true;
  sheet(`${theme.emoji || "✨"} ${theme.label || theme.id}`, "Aura 正在搭世界，还会先自己试玩一下……", () => {});
  try {
    const seed = (Date.now() % 100000) + 1;
    const res = await post("/api/wish", { theme: theme.id, seed });
    if (res.type === "error") throw new Error(res.error || "wish failed");
    showWishCards(theme, res);
  } catch (err) {
    showError("Aura 打了个盹，再试一次吧。");
  } finally {
    busy = false;
  }
}

function drawPreview(cv, p) {
  const size = 150;
  cv.width = size;
  cv.height = size;
  const c = cv.getContext("2d");
  const cell = size / 13;
  c.fillStyle = "#070c15";
  c.fillRect(0, 0, size, size);
  c.strokeStyle = "rgba(56,189,248,0.07)";
  for (let i = 1; i < 13; i += 1) {
    c.beginPath();
    c.moveTo(i * cell, 0); c.lineTo(i * cell, size);
    c.moveTo(0, i * cell); c.lineTo(size, i * cell);
    c.stroke();
  }
  const tile = (x, y, color, radius = 4) => {
    c.fillStyle = color;
    c.beginPath();
    c.roundRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2, radius);
    c.fill();
  };
  for (const b of arr(p.bricks)) tile(b.x, b.y, "#b45309");
  for (const s of arr(p.steel)) tile(s.x, s.y, "#64748b");
  for (const w of arr(p.water)) tile(w.x, w.y, "#0ea5e9");
  tile(6, 12, "#38bdf8", 6);
  tile(4, 12, "#a7f3d0", 9);
}

function showWishCards(theme, res) {
  const keepCount = (res.candidates || []).filter((c) => c.verdict === "KEEP").length;
  const title = keepCount ? `${theme.emoji || "✨"} 挑一个世界` : "魔法还不够稳";
  const text = keepCount
    ? "绿色星星的是 Aura 试玩通过的世界，点一下就出发。"
    : "这次的世界都还不够公平，再让 Aura 想一次？";
  sheet(title, text, (box) => {
    const grid = document.createElement("div");
    grid.className = "wish-grid";
    for (const c of res.candidates || []) {
      const card = document.createElement("button");
      const ok = c.verdict === "KEEP";
      card.className = "wish-card" + (ok ? "" : " off");
      card.disabled = !ok;
      const cv = document.createElement("canvas");
      drawPreview(cv, c.preview || {});
      const name = document.createElement("div");
      name.className = "wish-name";
      name.textContent = `${theme.label || theme.id} · ${Number(c.slot) + 1}`;
      const badge = document.createElement("div");
      badge.className = "wish-badge";
      badge.textContent = ok ? "✨ 可以玩" : "💨 再试试";
      card.append(cv, name, badge);
      if (ok) card.addEventListener("click", () => keepWish(c.slot));
      grid.append(card);
    }
    box.append(grid);
    const actions = document.createElement("div");
    actions.className = "actions wish-actions";
    actions.append(button(keepCount ? "重新许愿" : "再想一次", false, () => openWish()));
    actions.append(button("先不换", false, () => resumeGame()));
    box.append(actions);
  });
}

async function keepWish(slot) {
  if (busy) return;
  busy = true;
  try {
    const res = await post("/api/keep", { slot });
    if (res.type === "error") throw new Error(res.error || "keep failed");
    absorb(res.state, res);
    effects = [];
    shake = 0;
    overlay.classList.remove("open");
    paused = false;
    startLoop();
    buddySay(`${buddy.name} 学会了新颜色！`);
  } catch (err) {
    showError("这个世界暂时进不来，再试一次吧。");
  } finally {
    busy = false;
  }
}

function openParent() {
  if (busy) return;
  stopLoop();
  paused = true;
  sheet("家长 / 开发者角落", "孩子默认只看到贴纸和星星；EDSL、fitness、KEEP/ROLLBACK 都在这里。", (box) => {
    const label = document.createElement("label");
    label.className = "parent-toggle";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = document.body.classList.contains("dev");
    cb.addEventListener("change", () => {
      document.body.classList.toggle("dev", cb.checked);
      if (cb.checked) devPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    const text = document.createElement("span");
    text.textContent = "显示开发者面板（EDSL / 进化记录）";
    label.append(cb, text);
    box.append(label);
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(button("继续玩", true, () => resumeGame()));
    box.append(actions);
  });
}

function renderEvolution(res) {
  const log = document.createElement("div");
  log.className = "evo-log";
  const base = document.createElement("div");
  base.className = "row";
  base.innerHTML = `<div class="slot">base</div><div>deterministic autopilot</div><div class="fit">fitness ${res.baseline ?? 0}</div>`;
  log.append(base);
  for (const c of res.candidates || []) {
    const row = document.createElement("div");
    row.className = "row";
    const keep = c.verdict === "KEEP";
    row.innerHTML = `<div class="slot">c${c.slot}</div><div class="verdict ${keep ? "keep" : "roll"}">${keep ? "KEEP" : "ROLLBACK"}</div><div class="fit">fitness ${c.fitness ?? 0}</div>`;
    log.append(row);
  }
  const pre = document.createElement("pre");
  pre.className = "form";
  pre.textContent = res.form || "";
  return { log, pre };
}

async function evolve() {
  if (busy) return;
  busy = true;
  paused = true;
  stopLoop();
  sheet("Evolving layout", "Replaying three EDSL mutations through evo:trial…", () => {});
  try {
    const res = await post("/api/evolve", { seed: 42 });
    absorb(res.state, res);
    const { log, pre } = renderEvolution(res);
    sheet(res.verdict === "KEEP" ? "Layout kept" : "Proposal rolled back",
      res.verdict === "KEEP" ? "A fair form beat or matched the baseline. Deploy the new arena." : "The gate refused the proposal. The current arena is unchanged.",
      (box) => {
        box.append(log, pre);
        const actions = document.createElement("div");
        actions.className = "actions";
        actions.append(button(res.verdict === "KEEP" ? "Deploy evolved layout" : "Resume",
          true,
          () => {
            overlay.classList.remove("open");
            paused = false;
            startLoop();
          }));
        box.append(actions);
        evoLog.innerHTML = "";
        evoLog.append(log.cloneNode(true));
        const p = document.createElement("pre");
        p.className = "form";
        p.textContent = res.form || "";
        evoLog.append(p);
      });
  } catch (err) {
    showError("Evolution could not run.");
  } finally {
    busy = false;
  }
}

async function boot() {
  try {
    const res = await post("/api/new", { seed: 42, levels: 2 });
    absorb(res.state, res);
    showStart();
  } catch (err) {
    showError("先运行 ./play.sh，再点一次。");
  }
}

for (const el of document.querySelectorAll("[data-dir]")) {
  const dir = el.dataset.dir;
  const on = (e) => { e.preventDefault(); lastDir = dir; keys.add(dir); el.classList.add("on"); };
  const off = (e) => { e.preventDefault(); keys.delete(dir); el.classList.remove("on"); };
  el.addEventListener("pointerdown", on);
  el.addEventListener("pointerup", off);
  el.addEventListener("pointercancel", off);
  el.addEventListener("pointerleave", off);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

const fireButton = document.querySelector("[data-fire]");
if (fireButton) {
  const on = (e) => { e.preventDefault(); keys.add("fire"); fireButton.classList.add("on"); };
  const off = (e) => { e.preventDefault(); keys.delete("fire"); fireButton.classList.remove("on"); };
  fireButton.addEventListener("pointerdown", on);
  fireButton.addEventListener("pointerup", off);
  fireButton.addEventListener("pointercancel", off);
  fireButton.addEventListener("pointerleave", off);
  fireButton.addEventListener("contextmenu", (e) => e.preventDefault());
}

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (DIR_KEYS[k]) {
    lastDir = DIR_KEYS[k];
    keys.add(lastDir);
    e.preventDefault();
    return;
  }
  if (k === " ") {
    keys.add("fire");
    e.preventDefault();
    return;
  }
  if (k === "e") {
    e.preventDefault();
    openWish();
  } else if (k === "r") {
    e.preventDefault();
    newGame();
  }
});

window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (DIR_KEYS[k]) keys.delete(DIR_KEYS[k]);
  if (k === " ") keys.delete("fire");
});

window.addEventListener("blur", () => keys.clear());
window.addEventListener("resize", resizeCanvas);

evolveBtn.addEventListener("click", evolve);
wishBtn.addEventListener("click", openWish);
restartBtn.addEventListener("click", newGame);
parentBtn.addEventListener("click", openParent);

resizeCanvas();
requestAnimationFrame(frame);
boot();
