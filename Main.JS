const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Turn-based battle prototype inspired by your requested rules
// Controls:
// - Arrows: move
// - Space: M1
// - Z: Defend
// - X: Special / hold for final attack
// - 1/2/3: select magatank / magaknight / true mage
// - Auto-starts with magatank

const partyBase = [
  {
    id: 1,
    name: "Magatank",
    x: 50,
    y: 60,
    size: 50,
    maxHp: 100,
    hp: 100,
    maxPb: 10,
    pb: 0,
    m1Gain: 2,
    m1Damage: 10,
    defendReduction: 0.5,
    defendGain: 5,
    specialCost: 10,
    specialDamage: 55,
    counterChance: 1,
    moveSpeed: 2,
    color: "red",
    alive: true,
    defending: false
  },
  {
    id: 2,
    name: "Magaknight",
    x: 50,
    y: 180,
    size: 40,
    maxHp: 75,
    hp: 75,
    maxPb: 10,
    pb: 0,
    m1Gain: 2,
    m1Damage: 10,
    defendReduction: 0.25,
    defendGain: 5,
    specialCost: 10,
    specialDamage: 55,
    counterChance: 0.5,
    moveSpeed: 3,
    color: "silver",
    alive: true,
    defending: false
  },
  {
    id: 3,
    name: "True Mage",
    x: 50,
    y: 300,
    size: 30,
    maxHp: 25,
    hp: 25,
    maxPb: 10,
    pb: 0,
    m1Gain: 1,
    m1Damage: 15,
    defendReduction: 0.15,
    defendGain: 5,
    specialCost: 10,
    specialDamage: 70,
    counterChance: 0.25,
    moveSpeed: 2,
    color: "green",
    alive: true,
    defending: false
  }
];

let party = partyBase.map((member) => ({ ...member }));
let selectedPlayerIndex = 0;
let currentTurn = "player";
let currentActorIndex = 0;
let keys = {};
let messageLog = [];
let lastEnemyTurn = 0;
let finalAttackHeld = false;
let holdTimer = 0;

const enemyData = [
  {
    name: "Light Wizard",
    hp: 100,
    maxHp: 100,
    damage: 7,
    color: "yellow",
    x: 550,
    y: 140,
    size: 60,
    alive: true
  },
  {
    name: "Dark Wizard",
    hp: 200,
    maxHp: 200,
    damage: 8,
    color: "purple",
    x: 550,
    y: 220,
    size: 60,
    alive: true
  },
  {
    name: "Blitz",
    hp: 400,
    maxHp: 400,
    damage: 10,
    color: "blue",
    x: 550,
    y: 300,
    size: 70,
    alive: true
  },
  {
    name: "Cyber Dio",
    hp: 500,
    maxHp: 500,
    damage: 5,
    color: "black",
    x: 550,
    y: 390,
    size: 45,
    alive: true
  },
  {
    name: "Bit Bunny",
    hp: 700,
    maxHp: 700,
    damage: 10,
    color: "lightblue",
    x: 550,
    y: 440,
    size: 25,
    alive: true
  }
];

let enemies = enemyData.map((enemy) => ({ ...enemy }));

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function logMessage(text) {
  messageLog.unshift(text);
  if (messageLog.length > 6) messageLog.pop();
}

function getAliveParty() {
  return party.filter((member) => member.alive);
}

function getPrimaryEnemy() {
  return enemies.find((enemy) => enemy.alive) || null;
}

function isActiveMember(member) {
  return currentTurn === "player" && selectedPlayerIndex === currentActorIndex && member.id === party[currentActorIndex].id;
}

function advanceTurn() {
  currentTurn = "enemy";
  lastEnemyTurn = performance.now();
  logMessage("Enemy turn");
}

function finishEnemyTurn() {
  let nextIndex = -1;
  for (let i = 1; i < party.length; i++) {
    const testIndex = (currentActorIndex + i) % party.length;
    if (party[testIndex].alive) {
      nextIndex = testIndex;
      break;
    }
  }
  if (nextIndex === -1) {
    currentActorIndex = 0;
    currentTurn = "player";
    return;
  }
  currentActorIndex = nextIndex;
  selectedPlayerIndex = nextIndex;
  currentTurn = "player";
  logMessage("Player turn: " + party[currentActorIndex].name);
}

function doM1(actor) {
  if (!actor.alive) return;
  const enemy = getPrimaryEnemy();
  if (!enemy) {
    logMessage("No enemy remains.");
    return;
  }

  enemy.hp -= actor.m1Damage;
  actor.pb = clamp(actor.pb + actor.m1Gain, 0, actor.maxPb);
  logMessage(actor.name + " uses M1 for " + actor.m1Damage + " dmg (+" + actor.m1Gain + " PB)");

  if (enemy.hp <= 0) {
    enemy.alive = false;
    enemy.hp = 0;
    logMessage(enemy.name + " is defeated.");
  }
}

function doDefend(actor) {
  actor.defending = true;
  actor.pb = clamp(actor.pb + actor.defendGain, 0, actor.maxPb);
  logMessage(actor.name + " defends (+" + actor.defendGain + " PB)");
}

function doSpecial(actor) {
  const enemy = getPrimaryEnemy();
  if (!enemy) {
    logMessage("No enemy remains.");
    return;
  }
  if (actor.pb < actor.specialCost) {
    logMessage(actor.name + " does not have enough power.");
    return;
  }

  actor.pb -= actor.specialCost;
  enemy.hp -= actor.specialDamage;
  enemy.hp = Math.max(0, enemy.hp);
  logMessage(actor.name + " uses Special for " + actor.specialDamage + " dmg (-" + actor.specialCost + " PB)");

  if (enemy.hp <= 0) {
    enemy.alive = false;
    logMessage(enemy.name + " is defeated.");
  }
}

function doFinalAttack(actor) {
  const enemy = getPrimaryEnemy();
  if (!enemy) return;
  if (actor.pb < actor.maxPb) {
    logMessage(actor.name + " needs full power for final attack.");
    return;
  }

  const dmg = 50 + actor.maxHp;
  enemy.hp -= dmg;
  actor.pb = 0;
  logMessage(actor.name + " unleashes final attack for " + dmg + " dmg!");

  if (enemy.hp <= 0) {
    enemy.alive = false;
    logMessage(enemy.name + " is defeated by final attack.");
  }
}

function enemyAttack(enemy) {
  if (!enemy.alive) return;
  const target = party[currentActorIndex];
  if (!target || !target.alive) {
    const alive = getAliveParty();
    if (alive.length === 0) {
      logMessage("All party members are dead.");
      return;
    }
    target = alive[0];
  }

  let damage = enemy.damage;
  if (target.defending) {
    damage = Math.ceil(damage * (1 - target.defendReduction));
  }

  const counterRoll = Math.random();
  if (counterRoll < target.counterChance) {
    const reflected = Math.ceil(damage * 0.8);
    enemy.hp -= reflected;
    logMessage(target.name + " counters for " + reflected + " dmg!");
    target.defending = false;
    if (enemy.hp <= 0) {
      enemy.alive = false;
      logMessage(enemy.name + " is defeated by the counter.");
    }
    return;
  }

  target.hp -= damage;
  logMessage(enemy.name + " hits " + target.name + " for " + damage + " dmg.");
  target.defending = false;

  if (target.hp <= 0) {
    target.alive = false;
    target.hp = 0;
    logMessage(target.name + " is dead and their power bar is transferred.");

    const alive = getAliveParty();
    if (alive.length > 0) {
      const receiver = alive[0];
      receiver.pb = clamp(receiver.pb + target.pb, 0, receiver.maxPb);
      logMessage(target.name + "'s power bar was passed to " + receiver.name + ".");
    }
  }
}

function enemyPhase() {
  if (getPrimaryEnemy()) {
    const enemy = getPrimaryEnemy();
    enemyAttack(enemy);
  }
  finishEnemyTurn();
}

function handleActionInput() {
  if (currentTurn !== "player") return;
  const actor = party[currentActorIndex];
  if (!actor || !actor.alive) return;

  if (keys["1"]) selectedPlayerIndex = 0;
  if (keys["2"]) selectedPlayerIndex = 1;
  if (keys["3"]) selectedPlayerIndex = 2;

  if (selectedPlayerIndex !== currentActorIndex) {
    return;
  }

  if (keys["ArrowRight"]) actor.x += actor.moveSpeed;
  if (keys["ArrowLeft"]) actor.x -= actor.moveSpeed;
  if (keys["ArrowUp"]) actor.y -= actor.moveSpeed;
  if (keys["ArrowDown"]) actor.y += actor.moveSpeed;

  actor.x = clamp(actor.x, 0, canvas.width - actor.size);
  actor.y = clamp(actor.y, 0, canvas.height - actor.size);

  if (keys[" "]) {
    keys[" "] = false;
    doM1(actor);
    advanceTurn();
  }

  if (keys["z"] || keys["Z"]) {
    keys["z"] = false;
    keys["Z"] = false;
    doDefend(actor);
    advanceTurn();
  }

  if (keys["x"] || keys["X"]) {
    finalAttackHeld = true;
    holdTimer += 1;
    if (holdTimer > 30 && actor.pb >= actor.maxPb) {
      doFinalAttack(actor);
      advanceTurn();
      holdTimer = 0;
      finalAttackHeld = false;
    }
  } else {
    if (finalAttackHeld) {
      if (actor.pb >= actor.specialCost) {
        doSpecial(actor);
      } else {
        logMessage(actor.name + " lacks enough power for Special.");
      }
      advanceTurn();
      finalAttackHeld = false;
      holdTimer = 0;
    }
  }
}

window.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  if (e.key === "1" || e.key === "2" || e.key === "3") {
    selectedPlayerIndex = Number(e.key) - 1;
    currentActorIndex = selectedPlayerIndex;
    currentTurn = "player";
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // background
  ctx.fillStyle = "#e6e6e6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // draw enemies
  enemies.forEach((enemy) => {
    if (!enemy.alive) return;
    ctx.fillStyle = enemy.color;
    ctx.fillRect(enemy.x, enemy.y, enemy.size, enemy.size);
    ctx.fillStyle = "black";
    ctx.fillText(enemy.name, enemy.x, enemy.y - 12);
    ctx.fillRect(enemy.x, enemy.y - 8, enemy.size, 6);
    ctx.fillStyle = "red";
    ctx.fillRect(enemy.x, enemy.y - 8, enemy.size * (enemy.hp / enemy.maxHp), 6);
  });

  // draw party members
  party.forEach((member, index) => {
    ctx.fillStyle = member.alive ? member.color : "gray";
    ctx.fillRect(member.x, member.y, member.size, member.size);

    ctx.fillStyle = "black";
    ctx.fillText(member.name, member.x, member.y - 8);
    ctx.fillRect(member.x, member.y - 20, member.size, 6);
    ctx.fillStyle = "green";
    ctx.fillRect(member.x, member.y - 20, member.size * (member.hp / member.maxHp), 6);

    ctx.fillStyle = "black";
    ctx.fillRect(member.x, member.y - 12, member.size, 4);
    ctx.fillStyle = "yellow";
    ctx.fillRect(member.x, member.y - 12, member.size * (member.pb / member.maxPb), 4);

    if (selectedPlayerIndex === index) {
      ctx.strokeStyle = "blue";
      ctx.strokeRect(member.x - 2, member.y - 2, member.size + 4, member.size + 4);
    }
  });

  // HUD text
  ctx.fillStyle = "black";
  ctx.font = "16px sans-serif";
  ctx.fillText("Turn: " + currentTurn, 10, 20);
  ctx.fillText("Selected: " + party[selectedPlayerIndex].name, 10, 42);
  ctx.fillText("Active: " + party[currentActorIndex].name, 10, 64);

  // message log
  messageLog.forEach((msg, index) => {
    ctx.fillText(msg, 10, canvas.height - 24 - index * 18);
  });
}

function update() {
  handleActionInput();

  if (currentTurn === "enemy" && performance.now() - lastEnemyTurn > 500) {
    enemyPhase();
  }
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

logMessage("Battle starts. Magatank auto-selected.");
logMessage("Controls: Arrows move, Space = M1, Z = Defend, X = Special/Final Attack");

currentActorIndex = 0;
selectedPlayerIndex = 0;
currentTurn = "player";

gameLoop();
