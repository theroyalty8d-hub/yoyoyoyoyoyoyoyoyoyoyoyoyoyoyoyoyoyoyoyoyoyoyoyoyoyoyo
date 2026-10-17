const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 900;
canvas.height = 560;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const partyTemplate = [
  {
    id: 1,
    name: 'Magatank',
    x: 70,
    y: 120,
    size: 52,
    color: 'red',
    maxHp: 100,
    hp: 100,
    maxPb: 10,
    pb: 0,
    speed: 3,
    alive: true,
    defending: false,
    m1Gain: 2,
    m1Damage: 10,
    defendReduction: 0.5,
    specialCost: 10,
    specialDamage: 55,
    counterChance: 1.0,
    passiveCost: 5,
    passiveDamage: 25,
    m1Cooldown: 1000,
    lastM1: 0,
    text: 'Magatank'
  },
  {
    id: 2,
    name: 'Magaknight',
    x: 70,
    y: 240,
    size: 44,
    color: 'silver',
    maxHp: 75,
    hp: 75,
    maxPb: 10,
    pb: 0,
    speed: 3.5,
    alive: true,
    defending: false,
    m1Gain: 2,
    m1Damage: 10,
    defendReduction: 0.25,
    specialCost: 10,
    specialDamage: 55,
    counterChance: 0.5,
    passiveCost: 5,
    passiveDamage: 25,
    passiveStealPercent: 0.02,
    m1Cooldown: 1000,
    lastM1: 0,
    text: 'Magaknight'
  },
  {
    id: 3,
    name: 'True Mage',
    x: 70,
    y: 360,
    size: 34,
    color: 'green',
    maxHp: 25,
    hp: 25,
    maxPb: 10,
    pb: 0,
    speed: 2.5,
    alive: true,
    defending: false,
    m1Gain: 1,
    m1Damage: 15,
    defendReduction: 0.15,
    specialCost: 10,
    specialDamage: 70,
    counterChance: 0.25,
    passiveCost: 3,
    passiveDamage: 0,
    m1Cooldown: 1000,
    lastM1: 0,
    text: 'True Mage'
  }
];

let party = partyTemplate.map((p) => ({ ...p }));
let selectedIndex = 0;
let keys = {};
let projectiles = [];
let particles = [];
let messages = [];
let enemy = null;
let currentEnemyIndex = 0;
let enemyTimer = 0;
let holdXStartedAt = null;
let tutorialActive = true;
let transferPending = null;
let finalBossMode = false;
let canUseOnlyM1 = false;
let lastFrame = performance.now();

const enemyRoster = [
  { key: 'lightwizard', name: 'Light Wizard', hp: 100, maxHp: 100, size: 72, color: '#f5d942', damage: 7 },
  { key: 'darkwizard', name: 'Dark Wizard', hp: 200, maxHp: 200, size: 70, color: '#8a2be2', damage: 8 },
  { key: 'blitz', name: 'Blitz', hp: 400, maxHp: 400, size: 82, color: '#3f78ff', damage: 10 },
  { key: 'cyberdio', name: 'Cyber Dio', hp: 500, maxHp: 500, size: 60, color: '#1a1a1a', damage: 5 },
  { key: 'bitbunny', name: 'Bit Bunny', hp: 700, maxHp: 700, size: 76, color: '#7ce7ff', damage: 10 }
];

function log(msg) {
  messages.unshift(msg);
  if (messages.length > 6) messages.pop();
}

function getSelectedActor() {
  return party[selectedIndex] || null;
}

function getAliveParty() {
  return party.filter((p) => p.alive);
}

function getAliveEnemy() {
  return enemy && enemy.alive ? enemy : null;
}

function spawnEnemy(index) {
  const base = enemyRoster[index];
  if (!base) {
    enemy = null;
    return;
  }
  enemy = {
    ...base,
    x: canvas.width - 160,
    y: canvas.height / 2 - base.size / 2,
    alive: true,
    stunnedMs: 0,
    phase: 'normal'
  };
  enemyTimer = 0;
  finalBossMode = false;
  canUseOnlyM1 = false;
}

function resetPartyForRound() {
  party.forEach((p) => {
    p.x = p.id === 1 ? 70 : p.id === 2 ? 70 : 70;
    p.y = p.id === 1 ? 120 : p.id === 2 ? 240 : 360;
    p.hp = p.maxHp;
    p.alive = true;
    p.defending = false;
    p.pb = 0;
    p.lastM1 = 0;
  });
}

function moveSelectionIfNeeded() {
  const alive = getAliveParty();
  if (!alive.length) return;
  if (!alive.some((p) => p.id === party[selectedIndex].id && p.alive)) {
    selectedIndex = party.findIndex((p) => p.alive);
  }
}

function transferPower(deadMember) {
  const alive = getAliveParty().filter((p) => p.id !== deadMember.id);
  if (!alive.length) return;
  const receiver = alive[0];
  receiver.pb = clamp(receiver.pb + deadMember.pb, 0, receiver.maxPb);
  log(deadMember.name + "'s power bar was transferred to " + receiver.name + '.');
  transferPending = null;
}

function applyDamageToSelected(enemyDamage, sourceLabel = 'Enemy') {
  const actor = getSelectedActor();
  if (!actor || !actor.alive) return;
  let dmg = enemyDamage;
  if (actor.defending) {
    dmg = Math.ceil(dmg * (1 - actor.defendReduction));
  }
  actor.hp -= dmg;
  log(sourceLabel + ' hit ' + actor.name + ' for ' + dmg + ' dmg.');
  actor.defending = false;
  if (actor.hp <= 0) {
    actor.hp = 0;
    actor.alive = false;
    log(actor.name + ' has fallen. Select a receiver with 1/2/3.');
    transferPending = actor;
  }
}

function firePlayerM1(actor) {
  if (!actor || !actor.alive) return;
  const now = performance.now();
  if (now < actor.lastM1 + actor.m1Cooldown) {
    log(actor.name + ' M1 is on cooldown.');
    return;
  }
  actor.lastM1 = now;
  const e = getAliveEnemy();
  if (!e) {
    log('No enemy is active.');
    return;
  }

  const dx = (e.x + e.size / 2) - (actor.x + actor.size / 2);
  const dy = (e.y + e.size / 2) - (actor.y + actor.size / 2);
  const len = Math.hypot(dx, dy) || 1;
  const speed = 7;
  projectiles.push({
    x: actor.x + actor.size / 2,
    y: actor.y + actor.size / 2,
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    radius: 6,
    owner: 'player',
    damage: actor.m1Damage,
    kind: 'bullet'
  });
  actor.pb = clamp(actor.pb + actor.m1Gain, 0, actor.maxPb);
  log(actor.name + ' used M1 for ' + actor.m1Damage + ' dmg and gained ' + actor.m1Gain + ' PB.');
}

function doPassive(actor) {
  if (!actor || !actor.alive) return;
  const e = getAliveEnemy();
  if (!e) return;

  if (actor.id === 1) {
    if (actor.pb < 5) { log(actor.name + ' needs 5 PB for passive.'); return; }
    actor.pb -= 5;
    e.hp -= 25;
    log(actor.name + ' used Passive: Magic Punch (-25 dmg).');
  }

  if (actor.id === 2) {
    if (actor.pb < 5) { log(actor.name + ' needs 5 PB for passive.'); return; }
    actor.pb -= 5;
    e.hp -= 25;
    const stolen = Math.max(1, Math.floor(actor.maxHp * 0.02));
    actor.hp = clamp(actor.hp + stolen, 0, actor.maxHp);
    log(actor.name + ' used Passive: Teleport + steal (-25 dmg, + ' + stolen + ' HP).');
  }

  if (actor.id === 3) {
    if (actor.pb >= 10) {
      actor.pb -= 10;
      party.forEach((p) => {
        if (p.alive) p.hp = clamp(p.hp + Math.floor(p.maxHp * 0.75), 0, p.maxHp);
      });
      log(actor.name + ' used Passive: Heal All (+75% HP).');
    } else if (actor.pb >= 6) {
      actor.pb -= 6;
      const targets = party.filter((p) => p.alive).slice(0, 2);
      targets.forEach((p) => {
        p.hp = clamp(p.hp + Math.floor(p.maxHp * 0.50), 0, p.maxHp);
      });
      log(actor.name + ' used Passive: Heal Two (+50% HP).');
    } else if (actor.pb >= 3) {
      actor.pb -= 3;
      actor.hp = clamp(actor.hp + Math.floor(actor.maxHp * 0.25), 0, actor.maxHp);
      log(actor.name + ' used Passive: Heal One (+25% HP).');
    } else {
      log(actor.name + ' needs more PB for passive.');
    }
  }

  if (e.hp <= 0) {
    e.hp = 0;
    e.alive = false;
    log(e.name + ' was defeated.');
    onEnemyDefeated();
  }
}

function doSpecial(actor) {
  if (!actor || !actor.alive) return;
  if (canUseOnlyM1) {
    log('Only M1 is allowed during the final phase.');
    return;
  }
  if (actor.pb < actor.specialCost) {
    log(actor.name + ' does not have enough power for Special.');
    return;
  }

  const e = getAliveEnemy();
  if (!e) return;

  actor.pb -= actor.specialCost;
  for (let i = 0; i < 7; i++) {
    const dx = (e.x + e.size / 2) - (actor.x + actor.size / 2) + randInt(-50, 50);
    const dy = (e.y + e.size / 2) - (actor.y + actor.size / 2) + randInt(-50, 50);
    const len = Math.hypot(dx, dy) || 1;
    projectiles.push({
      x: actor.x + actor.size / 2,
      y: actor.y + actor.size / 2,
      vx: (dx / len) * (5 + Math.random() * 2),
      vy: (dy / len) * (5 + Math.random() * 2),
      radius: 8,
      owner: 'player',
      damage: actor.specialDamage / 7,
      kind: 'magic'
    });
  }
  e.stunnedMs = 600;
  log(actor.name + ' used Special: barrage! (-' + actor.specialCost + ' PB, ' + actor.specialDamage + ' dmg)');
}

function doFinalAttack(actor) {
  if (!actor || !actor.alive) return;
  if (actor.pb < actor.maxPb) {
    log(actor.name + ' needs full PB for the final attack.');
    return;
  }
  const e = getAliveEnemy();
  if (!e) return;
  actor.pb = 0;
  for (let i = 0; i < 8; i++) {
    projectiles.push({
      x: randInt(550, 820),
      y: -30 - i * 50,
      vx: randInt(-2, 2),
      vy: 4 + i * 0.4,
      radius: 16,
      owner: 'player',
      damage: Math.floor(actor.maxHp * 0.5),
      kind: 'meteor'
    });
  }
  log(actor.name + ' unleashed Final Attack!');
}

function onEnemyDefeated() {
  if (!enemy) return;
  log(enemy.name + ' was defeated!');
  currentEnemyIndex += 1;
  if (currentEnemyIndex >= enemyRoster.length) {
    enemy = null;
    log('All enemies have been cleared.');
    return;
  }

  resetPartyForRound();
  spawnEnemy(currentEnemyIndex);
  log('New enemy: ' + enemy.name + '. Party restored to full HP.');
}

function attackEnemyFromProjectile(p) {
  const e = getAliveEnemy();
  if (!e) return false;
  const rectX = e.x;
  const rectY = e.y;
  const closestX = clamp(p.x, rectX, rectX + e.size);
  const closestY = clamp(p.y, rectY, rectY + e.size);
  const dx = p.x - closestX;
  const dy = p.y - closestY;
  const hit = dx * dx + dy * dy <= p.radius * p.radius;
  if (hit) {
    e.hp -= p.damage;
    particles.push({ x: p.x, y: p.y, ttl: 250, color: p.owner === 'player' ? '#4fe9ff' : '#ff4353' });
    if (e.hp <= 0) {
      e.hp = 0;
      e.alive = false;
      onEnemyDefeated();
    }
    return true;
  }
  return false;
}

function attackSelectedPlayerFromProjectile(p) {
  const actor = getSelectedActor();
  if (!actor || !actor.alive) return false;
  const closestX = clamp(p.x, actor.x, actor.x + actor.size);
  const closestY = clamp(p.y, actor.y, actor.y + actor.size);
  const dx = p.x - closestX;
  const dy = p.y - closestY;
  const hit = dx * dx + dy * dy <= p.radius * p.radius;
  if (hit) {
    let dmg = p.damage;
    if (actor.defending) dmg = Math.ceil(dmg * (1 - actor.defendReduction));
    actor.hp -= dmg;
    particles.push({ x: p.x, y: p.y, ttl: 250, color: '#ff5f5f' });
    log(enemy.name + ' hit ' + actor.name + ' for ' + dmg + ' dmg.');
    if (actor.hp <= 0) {
      actor.hp = 0;
      actor.alive = false;
      log(actor.name + ' has fallen. Press 1/2/3 to transfer PB.');
      transferPending = actor;
    }
    return true;
  }
  return false;
}

function enemyAI(dt) {
  const e = getAliveEnemy();
  if (!e) return;
  enemyTimer += dt;
  const target = getSelectedActor();
  if (!target || !target.alive) return;

  // if boss final phase, do a meteor shower while hidden underground
  if (e.key === 'bitbunny' && e.hp <= 10) {
    canUseOnlyM1 = true;
    if (enemyTimer > 400) {
      enemyTimer = 0;
      projectiles.push({
        x: randInt(200, canvas.width - 200),
        y: randInt(60, canvas.height - 60),
        vx: 0,
        vy: 2.5,
        radius: 16,
        owner: 'enemy',
        damage: Math.floor(target.maxHp * 0.5),
        kind: 'meteor'
      });
      log('Techno Meteor rain!');
    }
    return;
  }

  if (e.stunnedMs > 0) {
    e.stunnedMs -= dt;
    return;
  }

  if (e.key === 'lightwizard') {
    if (enemyTimer > 900) {
      enemyTimer = 0;
      const dx = (target.x + target.size / 2) - (e.x + e.size / 2);
      const dy = (target.y + target.size / 2) - (e.y + e.size / 2);
      const len = Math.hypot(dx, dy) || 1;
      projectiles.push({
        x: e.x + e.size / 2,
        y: e.y + e.size / 2,
        vx: (dx / len) * 3,
        vy: (dy / len) * 3,
        radius: 7,
        owner: 'enemy',
        damage: 7,
        kind: 'crystal'
      });
      log('Light Wizard throws crystal at the selected member.');
    }
  }

  if (e.key === 'darkwizard') {
    if (enemyTimer > 800) {
      enemyTimer = 0;
      const dx = (target.x + target.size / 2) - (e.x + e.size / 2) + randInt(-30, 30);
      const dy = (target.y + target.size / 2) - (e.y + e.size / 2) + randInt(-30, 30);
      const len = Math.hypot(dx, dy) || 1;
      projectiles.push({
        x: e.x + e.size / 2,
        y: e.y + e.size / 2,
        vx: (dx / len) * 4,
        vy: (dy / len) * 4,
        radius: 8,
        owner: 'enemy',
        damage: 8,
        kind: 'crystal'
      });
      log('Dark Wizard fires a crystal burst.');
    }
  }

  if (e.key === 'blitz') {
    if (enemyTimer > 420) {
      enemyTimer = 0;
      for (let i = 0; i < 4; i++) {
        const dx = (target.x + target.size / 2) - (e.x + e.size / 2) + randInt(-40, 40);
        const dy = (target.y + target.size / 2) - (e.y + e.size / 2) + randInt(-40, 40);
        const len = Math.hypot(dx, dy) || 1;
        projectiles.push({
          x: e.x + e.size / 2,
          y: e.y + e.size / 2,
          vx: (dx / len) * (6 + Math.random() * 3),
          vy: (dy / len) * (6 + Math.random() * 3),
          radius: 7,
          owner: 'enemy',
          damage: 10,
          kind: 'bullet'
        });
      }
      log('Blitz launches rapid blasts.');
    }
  }

  if (e.key === 'cyberdio') {
    if (enemyTimer > 700) {
      enemyTimer = 0;
      const dx = (target.x + target.size / 2) - (e.x + e.size / 2);
      const dy = (target.y + target.size / 2) - (e.y + e.size / 2);
      const len = Math.hypot(dx, dy) || 1;
      projectiles.push({
        x: e.x + e.size / 2,
        y: e.y + e.size / 2,
        vx: (dx / len) * 5,
        vy: (dy / len) * 5,
        radius: 5,
        owner: 'enemy',
        damage: 2,
        kind: 'knife'
      });
      log('Cyber Dio throws a knife.');
    }
  }

  if (e.key === 'bitbunny') {
    if (enemyTimer > 350) {
      enemyTimer = 0;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      for (let a = 0; a < 8; a++) {
        const ang = (Math.PI * 2 / 8) * a;
        projectiles.push({
          x: cx + Math.cos(ang) * 120,
          y: cy + Math.sin(ang) * 120,
          vx: Math.cos(ang) * -2.5,
          vy: Math.sin(ang) * -2.5,
          radius: 5,
          owner: 'enemy',
          damage: 5,
          kind: 'bullet'
        });
      }
      log('Bit Bunny spins and fires.');
    }
  }
}

function update() {
  const delta = performance.now() - lastFrame;
  lastFrame = performance.now();

  const actor = getSelectedActor();
  if (actor && actor.alive && !transferPending) {
    if (keys['ArrowRight']) actor.x += actor.speed;
    if (keys['ArrowLeft']) actor.x -= actor.speed;
    if (keys['ArrowUp']) actor.y -= actor.speed;
    if (keys['ArrowDown']) actor.y += actor.speed;

    actor.x = clamp(actor.x, 0, canvas.width - actor.size);
    actor.y = clamp(actor.y, 0, canvas.height - actor.size);

    if (keys['z'] || keys['Z']) {
      actor.defending = true;
      actor.pb = clamp(actor.pb + 5, 0, actor.maxPb);
    } else {
      actor.defending = false;
    }

    if (keys[' ']) {
      keys[' '] = false;
      if (!canUseOnlyM1) {
        firePlayerM1(actor);
      } else {
        log('Only M1 is allowed in the final phase.');
      }
    }

    if (keys['c'] || keys['C']) {
      keys['c'] = false;
      keys['C'] = false;
      if (canUseOnlyM1) {
        log('No passive in the final phase.');
      } else {
        doPassive(actor);
      }
    }
  }

  if (holdXStartedAt && !(keys['x'] || keys['X'])) {
    const held = performance.now() - holdXStartedAt;
    holdXStartedAt = null;
    const current = getSelectedActor();
    if (current && current.alive) {
      if (held >= 600 && current.pb >= current.maxPb) {
        doFinalAttack(current);
      } else if (!canUseOnlyM1) {
        doSpecial(current);
      }
    }
  }

  if ((keys['x'] || keys['X']) && !holdXStartedAt) {
    holdXStartedAt = performance.now();
  }

  // move projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx * (delta / 16);
    p.y += p.vy * (delta / 16);

    if (p.owner === 'player') {
      if (attackEnemyFromProjectile(p)) {
        projectiles.splice(i, 1);
        continue;
      }
    } else {
      if (attackSelectedPlayerFromProjectile(p)) {
        projectiles.splice(i, 1);
        continue;
      }
    }

    if (p.x < -100 || p.x > canvas.width + 100 || p.y < -100 || p.y > canvas.height + 100) {
      projectiles.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].ttl -= delta;
    if (particles[i].ttl <= 0) particles.splice(i, 1);
  }

  if (transferPending) {
    const alive = getAliveParty();
    if (alive.length > 0) {
      // 1/2/3 chooses receiver
      if (keys['1']) { transferPending = null; selectedIndex = 0; party[0].pb = clamp(party[0].pb + transferPending.pb, 0, party[0].maxPb); }
      if (keys['2']) { transferPending = null; selectedIndex = 1; party[1].pb = clamp(party[1].pb + transferPending.pb, 0, party[1].maxPb); }
      if (keys['3']) { transferPending = null; selectedIndex = 2; party[2].pb = clamp(party[2].pb + transferPending.pb, 0, party[2].maxPb); }
      // cleanup if chosen
      if (transferPending === null) {
        log('Power transfer complete.');
      }
    }
  }

  if (enemy && enemy.alive) {
    enemyAI(delta);
    if (enemy.hp <= 10 && enemy.key === 'bitbunny' && !finalBossMode) {
      finalBossMode = true;
      log('Bit Bunny has reached 10 HP. Final Techno Meteor phase!');
      canUseOnlyM1 = true;
      enemy.phase = 'final';
    }
  }

  moveSelectionIfNeeded();
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.key] = true;
  if (e.key === '1') selectedIndex = 0;
  if (e.key === '2') selectedIndex = 1;
  if (e.key === '3') selectedIndex = 2;
});

window.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#dfe7ed';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // draw enemy
  if (enemy && enemy.alive) {
    const eX = enemy.x;
    const eY = enemy.y;
    ctx.fillStyle = enemy.color;
    ctx.fillRect(eX, eY, enemy.size, enemy.size);

    ctx.fillStyle = '#000';
    ctx.fillRect(eX, eY - 18, enemy.size, 8);
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(eX, eY - 18, enemy.size * (enemy.hp / enemy.maxHp), 8);
    ctx.fillStyle = '#000';
    ctx.font = '14px sans-serif';
    ctx.fillText(enemy.name + ' ' + Math.floor(enemy.hp) + '/' + enemy.maxHp, eX, eY - 25);
  }

  // draw projectiles as simple shapes
  for (const p of projectiles) {
    if (p.kind === 'meteor') {
      ctx.fillStyle = '#ff8c00';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 12, p.y + 18);
      ctx.lineTo(p.x + 12, p.y + 18);
      ctx.closePath();
      ctx.fill();
    } else if (p.kind === 'knife') {
      ctx.fillStyle = '#290000';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 8, p.y + 12);
      ctx.lineTo(p.x + 8, p.y + 12);
      ctx.closePath();
      ctx.fill();
    } else if (p.kind === 'crystal') {
      ctx.fillStyle = '#b9f5ff';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - p.radius);
      ctx.lineTo(p.x + p.radius, p.y + p.radius);
      ctx.lineTo(p.x - p.radius, p.y + p.radius);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = p.owner === 'player' ? '#00eaff' : '#cc0033';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // draw particles
  for (const p of particles) {
    ctx.fillStyle = p.color || '#fff';
    ctx.fillRect(p.x, p.y, 4, 4);
  }

  // draw party
  party.forEach((member, idx) => {
    if (!member.alive) {
      ctx.fillStyle = '#7d7d7d';
      ctx.fillRect(member.x, member.y, member.size, member.size);
      ctx.fillStyle = '#000';
      ctx.fillText(member.name + ' (Dead)', member.x, member.y - 12);
      return;
    }
    ctx.fillStyle = member.color;
    ctx.fillRect(member.x, member.y, member.size, member.size);

    ctx.fillStyle = '#111';
    ctx.fillRect(member.x, member.y - 18, member.size, 6);
    ctx.fillStyle = '#26d14b';
    ctx.fillRect(member.x, member.y - 18, member.size * (member.hp / member.maxHp), 6);

    ctx.fillStyle = '#111';
    ctx.fillRect(member.x, member.y - 10, member.size, 5);
    ctx.fillStyle = '#f4dc42';
    ctx.fillRect(member.x, member.y - 10, member.size * (member.pb / member.maxPb), 5);

    ctx.fillStyle = '#000';
    ctx.font = '12px sans-serif';
    ctx.fillText(member.name, member.x, member.y - 25);

    if (idx === selectedIndex) {
      ctx.strokeStyle = '#1e5bff';
      ctx.lineWidth = 2;
      ctx.strokeRect(member.x - 3, member.y - 3, member.size + 6, member.size + 6);
    }
  });

  // HUD
  ctx.fillStyle = '#000';
  ctx.font = '16px sans-serif';
  ctx.fillText('Selected: ' + party[selectedIndex].name, 20, 28);
  ctx.fillText('Controls: Arrows move, Space = M1, Z = defend, C = passive, X = special/final', 20, 48);
  ctx.fillText('Final phase: only M1 is allowed if Bit Bunny is at 10 HP', 20, 70);

  if (tutorialActive && enemy && enemy.key === 'lightwizard') {
    ctx.fillText('Tutorial: Light Wizard uses crystal shots. Avoid them and use Space / C / X.', 250, 26);
  }

  for (let i = 0; i < messages.length; i++) {
    ctx.fillText(messages[i], 20, canvas.height - 24 - i * 18);
  }
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

function initGame() {
  resetPartyForRound();
  spawnEnemy(0);
  tutorialActive = true;
  log('Tutorial: Light Wizard is active.');
  log('Selected: Magatank auto-starts.');
}

initGame();
gameLoop();
