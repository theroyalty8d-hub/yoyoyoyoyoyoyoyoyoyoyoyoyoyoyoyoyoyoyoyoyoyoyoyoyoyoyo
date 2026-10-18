const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 900;
canvas.height = 560;

const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

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
    passiveBlockedUntil: 0,
    stunnedUntil: 0,
    hitFlash: 0,
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
    passiveBlockedUntil: 0,
    stunnedUntil: 0,
    hitFlash: 0,
    m1Cooldown: 1000,
    lastM1: 0
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
    passiveBlockedUntil: 0,
    stunnedUntil: 0,
    hitFlash: 0,
    m1Cooldown: 1000,
    lastM1: 0
  }
];

let party = partyTemplate.map((p) => ({ ...p }));
let selectedIndex = 0;
let keys = {};
let projectiles = [];
let telegraphs = [];
let particles = [];
let robots = [];
let messages = [];
let enemy = null;
let currentEnemyIndex = 0;
let lastFrame = performance.now();
let transferPending = null;
let onlyM1Phase = false;
let holdXStartedAt = null;
let tutorialMode = true;
let enemyTimer = 0;
let attackIndex = 0;
let pauseLabel = '';
let lastShotTime = 0;

const enemyRoster = [
  { key: 'lightwizard', name: 'Light Wizard', hp: 100, maxHp: 100, size: 72, color: '#f5d942', damage: 7 },
  { key: 'darkwizard', name: 'Dark Wizard', hp: 200, maxHp: 200, size: 70, color: '#8a2be2', damage: 8 },
  { key: 'blitz', name: 'Blitz', hp: 400, maxHp: 400, size: 82, color: '#3f78ff', damage: 10 },
  { key: 'cyberdio', name: 'Cyber Dio', hp: 500, maxHp: 500, size: 60, color: '#1a1a1a', damage: 5 },
  { key: 'bitbunny', name: 'Bit Bunny', hp: 700, maxHp: 700, size: 76, color: '#7ce7ff', damage: 10 }
];

function log(msg) {
  messages.unshift(msg);
  if (messages.length > 8) messages.pop();
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

function resetPartyForRound() {
  party.forEach((p) => {
    p.hp = p.maxHp;
    p.pb = 0;
    p.alive = true;
    p.defending = false;
    p.lastM1 = 0;
    p.passiveBlockedUntil = 0;
    p.stunnedUntil = 0;
    p.hitFlash = 0;
  });
}

function spawnEnemy(index) {
  const base = enemyRoster[index];
  if (!base) { enemy = null; return; }
  enemy = {
    ...base,
    x: canvas.width - 170,
    y: canvas.height / 2 - base.size / 2,
    alive: true,
    stunnedMs: 0,
    attackClock: 0,
    phase: 'normal',
    telegraph: null,
    robotCooldown: 0,
    lastActionAt: 0,
    lockTarget: false,
    specialMode: false,
    glitchTimer: 0,
    timeStopTimer: 0,
    turretLockTimer: 0,
    canMove: true,
    createdRobots: 0,
    debug: 'spawned'
  };
  attackIndex = 0;
  enemyTimer = 0;
  telegraphs = [];
  robots = [];
  onlyM1Phase = false;
}

function onEnemyDefeated() {
  if (!enemy) return;
  log(enemy.name + ' was defeated!');
  currentEnemyIndex += 1;
  if (currentEnemyIndex >= enemyRoster.length) {
    enemy = null;
    log('All enemies were cleared.');
    return;
  }
  resetPartyForRound();
  spawnEnemy(currentEnemyIndex);
  log('New enemy: ' + enemy.name + '. Party restored to full HP.');
}

function transferPower(deadMember, receiverIndex) {
  const receiver = party[receiverIndex];
  if (!receiver || !receiver.alive) return;
  receiver.pb = clamp(receiver.pb + deadMember.pb, 0, receiver.maxPb);
  log(deadMember.name + "'s power bar has been passed to " + receiver.name + '.');
  transferPending = null;
  pauseLabel = '';
}

// helper that applies damage to a specific actor with optional "prevent one-shot" behavior
function applyDamageToActor(actor, amount, sourceText, preventOneShot = false) {
  if (!actor || !actor.alive) return;
  let dmg = amount;
  if (actor.defending) dmg = Math.ceil(dmg * (1 - actor.defendReduction));
  if (preventOneShot && dmg >= actor.hp) {
    // cap damage so actor is left with at least 1 HP where possible;
    // if actor.hp is 1 this makes dmg = 0 (no instant-kill).
    dmg = Math.max(0, actor.hp - 1);
  }
  actor.hp -= dmg;
  actor.hitFlash = 200;
  log(sourceText + ' hit ' + actor.name + ' for ' + dmg + ' HP.');
  if (actor.hp <= 0) {
    actor.hp = 0;
    actor.alive = false;
    log(actor.name + ' has fallen. Press 1/2/3 to transfer power.');
    transferPending = actor;
    pauseLabel = 'Select the receiver (1/2/3)';
  }
}

function damageSelected(amount, sourceText) {
  const actor = getSelectedActor();
  if (!actor || !actor.alive) return;
  let dmg = amount;
  if (actor.defending) dmg = Math.ceil(dmg * (1 - actor.defendReduction));
  actor.hp -= dmg;
  actor.hitFlash = 200;
  log(sourceText + ' hit ' + actor.name + ' for ' + dmg + ' HP.');
  if (actor.hp <= 0) {
    actor.hp = 0;
    actor.alive = false;
    log(actor.name + ' has fallen. Press 1/2/3 to transfer power.');
    transferPending = actor;
    pauseLabel = 'Select the receiver (1/2/3)';
  }
}

function pushParticle(x, y, color = '#fff') {
  particles.push({ x, y, ttl: 250, color });
}

function addTelegraph(x, y, w, h, color, ttl) {
  telegraphs.push({ x, y, w, h, color, ttl });
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
  if (!e) { log('There is no enemy to attack.'); return; }

  const dx = (e.x + e.size / 2) - (actor.x + actor.size / 2);
  const dy = (e.y + e.size / 2) - (actor.y + actor.size / 2);
  const len = Math.hypot(dx, dy) || 1;
  projectiles.push({
    x: actor.x + actor.size / 2,
    y: actor.y + actor.size / 2,
    vx: (dx / len) * 7,
    vy: (dy / len) * 7,
    radius: 6,
    owner: 'player',
    damage: actor.m1Damage,
    kind: 'bullet',
    ttl: 5000
  });
  actor.pb = clamp(actor.pb + actor.m1Gain, 0, actor.maxPb);
  log(actor.name + ' used M1 for ' + actor.m1Damage + ' damage. PB +' + actor.m1Gain + '.');
}

function doPassive(actor) {
  if (!actor || !actor.alive) return;
  const e = getAliveEnemy();
  if (!e) return;
  const now = performance.now();
  if (actor.passiveBlockedUntil > now) {
    log(actor.name + " can't use passive because it was tampered with.");
    return;
  }

  if (actor.id === 1) {
    if (actor.pb < 5) { log(actor.name + ' needs 5 PB for passive.'); return; }
    actor.pb -= 5;
    e.hp -= 25;
    log(actor.name + ' used Passive: Magic Punch (-25 dmg).');
  } else if (actor.id === 2) {
    if (actor.pb < 5) { log(actor.name + ' needs 5 PB for passive.'); return; }
    actor.pb -= 5;
    e.hp -= 25;
    const steal = Math.max(1, Math.floor(e.maxHp * 0.02));
    actor.hp = clamp(actor.hp + steal, 0, actor.maxHp);
    log(actor.name + ' used Passive: Teleport + steal (-25 dmg, +' + steal + ' HP).');
  } else if (actor.id === 3) {
    if (actor.pb >= 10) {
      actor.pb -= 10;
      party.forEach((p) => {
        if (p.alive) p.hp = clamp(p.hp + Math.floor(p.maxHp * 0.75), 0, p.maxHp);
      });
      log(actor.name + ' used Passive: Heal All (+75% HP).');
    } else if (actor.pb >= 6) {
      actor.pb -= 6;
      party.filter((p) => p.alive).slice(0, 2).forEach((p) => {
        p.hp = clamp(p.hp + Math.floor(p.maxHp * 0.5), 0, p.maxHp);
      });
      log(actor.name + ' used Passive: Heal Two (+50% HP).');
    } else if (actor.pb >= 3) {
      actor.pb -= 3;
      actor.hp = clamp(actor.hp + Math.floor(actor.maxHp * 0.25), 0, actor.maxHp);
      log(actor.name + ' used Passive: Heal One (+25% HP).');
    } else {
      log(actor.name + ' does not have enough PB for passive.');
    }
  }

  if (e.hp <= 0) {
    e.hp = 0;
    e.alive = false;
    onEnemyDefeated();
  }
}

function doSpecial(actor) {
  if (!actor || !actor.alive) return;
  if (onlyM1Phase) {
    log('Only M1 is allowed during the Bit Bunny final phase.');
    return;
  }
  const e = getAliveEnemy();
  if (!e) return;
  if (actor.pb < actor.specialCost) {
    log(actor.name + ' does not have enough PB for Special.');
    return;
  }
  actor.pb -= actor.specialCost;
  for (let i = 0; i < 7; i++) {
    const dx = (e.x + e.size / 2) - (actor.x + actor.size / 2) + randInt(-50, 50);
    const dy = (e.y + e.size / 2) - (actor.y + actor.size / 2) + randInt(-50, 50);
    const len = Math.hypot(dx, dy) || 1;
    projectiles.push({
      x: actor.x + actor.size / 2,
      y: actor.y + actor.size / 2,
      vx: (dx / len) * 5.5,
      vy: (dy / len) * 5.5,
      radius: 8,
      owner: 'player',
      damage: actor.specialDamage / 7,
      kind: 'magic',
      ttl: 5000
    });
  }
  e.stunnedMs = 600;
  log(actor.name + ' used Special: barrage! (-' + actor.specialCost + ' PB).');
}

function doFinalAttack(actor) {
  if (!actor || !actor.alive) return;
  if (actor.pb < actor.maxPb) {
    log(actor.name + ' needs full PB for the Final Attack.');
    return;
  }
  actor.pb = 0;
  for (let i = 0; i < 8; i++) {
    projectiles.push({
      x: randInt(500, 820),
      y: -50 - i * 40,
      vx: randInt(-2, 2),
      vy: 3.2 + i * 0.35,
      radius: 16,
      owner: 'player',
      damage: Math.ceil(actor.maxHp * 0.5),
      kind: 'meteor',
      ttl: 10000
    });
  }
  log(actor.name + ' used the Final Attack!');
}

function spawnRobot(x, y) {
  robots.push({
    x, y,
    size: 24,
    hp: 6,
    alive: true,
    attackTimer: 0,
    color: '#ababab'
  });
}

function updateRobots(dt) {
  for (let i = robots.length - 1; i >= 0; i--) {
    const r = robots[i];
    const target = getSelectedActor();
    if (!target || !target.alive) continue;
    const dx = (target.x + target.size / 2) - r.x;
    const dy = (target.y + target.size / 2) - r.y;
    const len = Math.hypot(dx, dy) || 1;
    r.x += (dx / len) * 0.7 * (dt / 16);
    r.y += (dy / len) * 0.7 * (dt / 16);
    r.attackTimer += dt;
    if (r.attackTimer > 1000) {
      r.attackTimer = 0;
      if (dist({ x: r.x + r.size / 2, y: r.y + r.size / 2 }, { x: target.x + target.size / 2, y: target.y + target.size / 2 }) < 40) {
        damageSelected(1, 'Robot');
      }
    }
  }
}

function updateTelegraphs(dt) {
  for (let i = telegraphs.length - 1; i >= 0; i--) {
    const t = telegraphs[i];
    t.ttl -= dt;
    if (t.ttl <= 0) telegraphs.splice(i, 1);
  }
}

function attackEnemyFromProjectile(p) {
  const e = getAliveEnemy();
  if (!e) return false;
  const hitX = p.x >= e.x && p.x <= e.x + e.size;
  const hitY = p.y >= e.y && p.y <= e.y + e.size;
  if (hitX && hitY) {
    e.hp -= p.damage;
    pushParticle(p.x, p.y, '#4fe9ff');
    if (e.hp <= 0) {
      e.hp = 0;
      e.alive = false;
      onEnemyDefeated();
    }
    return true;
  }
  return false;
}

function attackRobotFromProjectile(p) {
  // robots are drawn centered at r.x, r.y, so their box is r.x - size/2 .. r.x + size/2
  for (let i = robots.length - 1; i >= 0; i--) {
    const r = robots[i];
    const left = r.x - r.size / 2;
    const right = r.x + r.size / 2;
    const top = r.y - r.size / 2;
    const bottom = r.y + r.size / 2;
    const hitX = p.x >= left && p.x <= right;
    const hitY = p.y >= top && p.y <= bottom;
    if (hitX && hitY) {
      r.hp -= p.damage;
      pushParticle(p.x, p.y, '#ffd700');
      if (r.hp <= 0) {
        robots.splice(i, 1);
        log('A robot was destroyed!');
      }
      return true;
    }
  }
  return false;
}

function attackSelectedPlayerFromProjectile(p) {
  const actor = getSelectedActor();
  if (!actor || !actor.alive) return false;
  const hitX = p.x >= actor.x && p.x <= actor.x + actor.size;
  const hitY = p.y >= actor.y && p.y <= actor.y + actor.size;
  if (hitX && hitY) {
    let dmg = p.damage;
    if (actor.defending) dmg = Math.ceil(dmg * (1 - actor.defendReduction));
    actor.hp -= dmg;
    actor.hitFlash = 200;
    if (p.tamper) {
      // tamper knives temporarily block passives
      actor.passiveBlockedUntil = performance.now() + 4000;
      log(actor.name + "'s passive was tampered with!");
    }
    if (actor.hp <= 0) {
      actor.hp = 0;
      actor.alive = false;
      log(actor.name + ' has fallen. Press 1/2/3 to transfer power.');
      transferPending = actor;
      pauseLabel = 'Select the receiver (1/2/3)';
    }
    return true;
  }
  return false;
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx * (dt / 16);
    p.y += p.vy * (dt / 16);
    if (p.ttl !== undefined) {
      p.ttl -= dt;
      if (p.ttl <= 0) {
        projectiles.splice(i, 1);
        continue;
      }
    }

    if (p.owner === 'player') {
      // first allow player shots to hit robots
      if (attackRobotFromProjectile(p)) {
        projectiles.splice(i, 1);
        continue;
      }
      if (attackEnemyFromProjectile(p)) {
        projectiles.splice(i, 1);
        continue;
      }
    } else if (p.owner === 'enemy') {
      if (attackSelectedPlayerFromProjectile(p)) {
        projectiles.splice(i, 1);
        continue;
      }
    }

    if (p.x < -200 || p.x > canvas.width + 200 || p.y < -200 || p.y > canvas.height + 200) {
      projectiles.splice(i, 1);
    }
  }
}

function spawnSpellbookWarning(x, y, ttl = 1200) {
  addTelegraph(x - 25, y - 25, 50, 50, 'rgba(140, 0, 255, 0.42)', ttl);
}

function updateEnemyAI(dt) {
  if (!enemy || !enemy.alive) return;
  const actor = getSelectedActor();
  if (!actor || !actor.alive) return;
  enemy.attackClock += dt;
  enemyTimer += dt;

  if (enemy.key === 'lightwizard') {
    if (enemy.attackClock > 1200) {
      enemy.attackClock = 0;
      const dx = (actor.x + actor.size / 2) - (enemy.x + enemy.size / 2);
      const dy = (actor.y + actor.size / 2) - (enemy.y + enemy.size / 2);
      const len = Math.hypot(dx, dy) || 1;
      projectiles.push({
        x: enemy.x + enemy.size / 2,
        y: enemy.y + enemy.size / 2,
        vx: (dx / len) * 3,
        vy: (dy / len) * 3,
        radius: 7,
        owner: 'enemy',
        damage: 7,
        kind: 'crystal',
        ttl: 5000
      });
      log('Light Wizard throws crystals at the selected member.');
    }
  }

  if (enemy.key === 'darkwizard') {
    if (enemy.attackClock > 1400) {
      enemy.attackClock = 0;
      const wx = randInt(150, canvas.width - 250);
      const wy = randInt(80, canvas.height - 80);
      spawnSpellbookWarning(wx, wy, 1200);
      log('Dark Wizard marks a random spellbook zone.');
      const triggerTimer = setTimeout(() => {
        const current = getSelectedActor();
        if (!current || !current.alive) return;
        const centerX = current.x + current.size / 2;
        const centerY = current.y + current.size / 2;
        const inside = centerX > wx - 25 && centerX < wx + 25 && centerY > wy - 25 && centerY < wy + 25;
        if (inside) damageSelected(10, 'Dark Wizard Spellbook');
      }, 1200);
      if (triggerTimer) {
        // keep it simple; game loop is still active and this is a one-time event
      }
    }

    if (enemy.attackClock > 700 && enemy.attackClock < 1200) {
      const dx = (actor.x + actor.size / 2) - (enemy.x + enemy.size / 2);
      const dy = (actor.y + actor.size / 2) - (enemy.y + enemy.size / 2);
      const len = Math.hypot(dx, dy) || 1;
      projectiles.push({
        x: enemy.x + enemy.size / 2,
        y: enemy.y + enemy.size / 2,
        vx: (dx / len) * 4,
        vy: (dy / len) * 4,
        radius: 8,
        owner: 'enemy',
        damage: 8,
        kind: 'crystal',
        ttl: 5000
      });
    }
  }

  if (enemy.key === 'blitz') {
    if (enemy.hp > 300) {
      if (enemy.attackClock > 1400) {
        enemy.attackClock = 0;
        const dx = (actor.x + actor.size / 2) - (enemy.x + enemy.size / 2);
        const dy = (actor.y + actor.size / 2) - (enemy.y + enemy.size / 2);
        const len = Math.hypot(dx, dy) || 1;
        projectiles.push({
          x: enemy.x + enemy.size / 2,
          y: enemy.y + enemy.size / 2,
          vx: (dx / len) * 6,
          vy: (dy / len) * 6,
          radius: 10,
          owner: 'enemy',
          damage: 10,
          kind: 'blast',
          ttl: 4000
        });
        spawnRobot(enemy.x - 50 + randInt(-14, 14), enemy.y + randInt(-40, 40));
        log('Blitz fires a single heavy blast and spawns a robot.');
      }
    } else if (enemy.hp > 200) {
      if (enemy.attackClock > 1800) {
        enemy.attackClock = 0;
        spawnRobot(enemy.x - 40 + randInt(-25, 25), enemy.y + randInt(-40, 40));
        log('Creator Blitz spawns a robot.');
      }
    } else if (enemy.hp > 100) {
      if (enemy.attackClock > 260) {
        enemy.attackClock = 0;
        const ang = Math.random() * Math.PI * 2;
        const speed = 8 + Math.random() * 3;
        projectiles.push({
          x: enemy.x + enemy.size / 2,
          y: enemy.y + enemy.size / 2,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          radius: 7,
          owner: 'enemy',
          damage: 6,
          kind: 'fast',
          ttl: 4000
        });
        log('Hyper Blitz fires fast random shots.');
      }
    } else {
      onlyM1Phase = true;
      if (enemy.attackClock > 900) {
        enemy.attackClock = 0;
        const dx = (actor.x + actor.size / 2) - (enemy.x + enemy.size / 2);
        const dy = (actor.y + actor.size / 2) - (enemy.y + enemy.size / 2);
        const len = Math.hypot(dx, dy) || 1;
        projectiles.push({
          x: enemy.x + enemy.size / 2,
          y: enemy.y + enemy.size / 2,
          vx: (dx / len) * 7,
          vy: (dy / len) * 7,
          radius: 11,
          owner: 'enemy',
          damage: 10,
          kind: 'heavy',
          ttl: 4000
        });
        log('Special Blitz fires a heavy single blast.');
      }
    }
  }

  if (enemy.key === 'cyberdio') {
    if (enemy.attackClock > 8000) {
      enemy.attackClock = 0;
      // avoid scheduling again while a time-hit is pending
      if (!enemy.timeHitScheduled) {
        enemy.timeHitScheduled = true;
        addTelegraph(0, 0, canvas.width, canvas.height, 'rgba(255,255,255,0.18)', 700);
        log('Cyber Dio hacks time and prepares to attack the selected member for 5 HP.');
        // delay the actual damage so the telegraph is a real warning
        setTimeout(() => {
          const current = getSelectedActor();
          if (current && current.alive) {
            // apply damage but prevent it from being an instant one-shot
            applyDamageToActor(current, 5, 'Cyber Dio Time Hit', true);
          }
          // clear flag so another time-hit can be scheduled later
          enemy.timeHitScheduled = false;
        }, 700);
      }
    }

    if (enemy.attackClock > 1600 && enemy.attackClock < 2200) {
      const dx = (actor.x + actor.size / 2) - (enemy.x + enemy.size / 2);
      const dy = (actor.y + actor.size / 2) - (enemy.y + enemy.size / 2);
      const len = Math.hypot(dx, dy) || 1;
      for (let i = 0; i < 3; i++) {
        projectiles.push({
          x: enemy.x + enemy.size / 2,
          y: enemy.y + enemy.size / 2,
          vx: (dx / len) * (5 + i * 0.15),
          vy: (dy / len) * (5 + i * 0.15),
          radius: 5,
          owner: 'enemy',
          damage: 2,
          kind: 'knife',
          ttl: 6000,
          tamper: true,
          passivesBlocked: true
        });
      }
      log('Cyber Dio throws knives. Each knife can tamper with passives.');
    }

    if (enemy.attackClock > 5200 && enemy.attackClock < 5600) {
      // show a full-screen-ish telegraph and delay the hit so the player sees the warning
      addTelegraph(0, 0, canvas.width, canvas.height, 'rgba(255,255,255,0.12)', 700);
      log('Cyber Dio prepares to whack the selected member with a Stop Sign.');
      setTimeout(() => {
        const current = getSelectedActor();
        if (current && current.alive) {
          // use the safe helper so this telegraphed attack can't insta-kill a defended member
          applyDamageToActor(current, 7, 'Stop Sign', true);
        }
      }, 700);
    }

    if (enemy.attackClock > 6400 && enemy.attackClock < 7000) {
      const rollerX = canvas.width - 120;
      // telegraph the road roller across the selected member's lane
      addTelegraph(rollerX, actor.y - 20, 90, actor.size + 40, 'rgba(255, 0, 0, 0.2)', 900);
      log('Cyber Dio is rolling the Road Roller through the selected member.');
      setTimeout(() => {
        const current = getSelectedActor();
        if (current && current.alive) {
          const collides = current.x + current.size > rollerX && current.x < rollerX + 90;
          if (collides) {
            // use the safe helper as well
            applyDamageToActor(current, 5, 'Road Roller', true);
          }
        }
      }, 900);
    }
  }

  if (enemy.key === 'bitbunny') {
    if (enemy.hp <= 10) {
      onlyM1Phase = true;
      if (enemy.attackClock > 500) {
        enemy.attackClock = 0;
        projectiles.push({
          x: randInt(200, canvas.width - 200),
          y: -20,
          vx: 0,
          vy: 2.8,
          radius: 18,
          owner: 'enemy',
          damage: Math.floor(actor.maxHp * 0.5),
          kind: 'meteor',
          ttl: 99999
        });
        log('Bit Bunny begins the Techno Meteor final phase.');
      }
      return;
    }

    if (enemy.attackClock > 2000) {
      enemy.attackClock = 0;
      for (let i = 0; i < 8; i++) {
        const ang = (Math.PI * 2 / 8) * i;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        projectiles.push({
          x: cx + Math.cos(ang) * 120,
          y: cy + Math.sin(ang) * 120,
          vx: Math.cos(ang) * -2.5,
          vy: Math.sin(ang) * -2.5,
          radius: 5,
          owner: 'enemy',
          damage: 5,
          kind: 'bullet',
          ttl: 5000
        });
      }
      log('Bit Bunny: Guns of Glory.');
    }
  }
}

function update(dt) {
  if (transferPending) {
    if (keys['1']) { transferPower(transferPending, 0); keys['1'] = false; }
    if (keys['2']) { transferPower(transferPending, 1); keys['2'] = false; }
    if (keys['3']) { transferPower(transferPending, 2); keys['3'] = false; }
    return;
  }

  const actor = getSelectedActor();
  if (actor && actor.alive) {
    if (keys['ArrowRight']) actor.x += actor.speed * (dt / 16);
    if (keys['ArrowLeft']) actor.x -= actor.speed * (dt / 16);
    if (keys['ArrowUp']) actor.y -= actor.speed * (dt / 16);
    if (keys['ArrowDown']) actor.y += actor.speed * (dt / 16);
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
      // Always allow M1 to fire (this fixes M1 being blocked during Hyper/Final phases)
      firePlayerM1(actor);
      if (onlyM1Phase) log('Final Phase: passive/special are disabled.');
    }

    if (keys['c'] || keys['C']) {
      keys['c'] = false; keys['C'] = false;
      if (onlyM1Phase) log('Passive is disabled during the final phase.');
      else doPassive(actor);
    }
  }

  if (holdXStartedAt && !(keys['x'] || keys['X'])) {
    const held = performance.now() - holdXStartedAt;
    holdXStartedAt = null;
    const current = getSelectedActor();
    if (current && current.alive) {
      if (held >= 600 && current.pb >= current.maxPb) doFinalAttack(current);
      else if (!onlyM1Phase) doSpecial(current);
    }
  }
  if ((keys['x'] || keys['X']) && !holdXStartedAt) holdXStartedAt = performance.now();

  updateProjectiles(dt);
  updateTelegraphs(dt);
  updateRobots(dt);
  updateEnemyAI(dt);

  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].ttl -= dt;
    if (particles[i].ttl <= 0) particles.splice(i, 1);
  }

  if (enemy && enemy.alive && enemy.hp <= 0) {
    enemy.hp = 0;
    enemy.alive = false;
    onEnemyDefeated();
  }

  // Only change selectedIndex automatically if the currently selected actor is missing or dead
  const currentActor = getSelectedActor();
  if (!currentActor || !currentActor.alive) {
    const firstAlive = party.findIndex((p) => p.alive);
    if (firstAlive !== -1) selectedIndex = firstAlive;
  }
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

  for (const t of telegraphs) {
    ctx.fillStyle = t.color;
    ctx.fillRect(t.x, t.y, t.w, t.h);
  }

  if (enemy && enemy.alive) {
    ctx.fillStyle = enemy.color;
    ctx.fillRect(enemy.x, enemy.y, enemy.size, enemy.size);
    ctx.fillStyle = '#000';
    ctx.fillRect(enemy.x, enemy.y - 18, enemy.size, 8);
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(enemy.x, enemy.y - 18, enemy.size * (enemy.hp / enemy.maxHp), 8);
    ctx.fillStyle = '#000';
    ctx.font = '14px sans-serif';
    ctx.fillText(enemy.name + ' ' + Math.floor(enemy.hp) + '/' + enemy.maxHp, enemy.x, enemy.y - 25);
  }

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
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 8, p.y + 12);
      ctx.lineTo(p.x + 8, p.y + 12);
      ctx.closePath();
      ctx.fill();
    } else if (p.kind === 'crystal') {
      ctx.fillStyle = '#d8f9ff';
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

  for (const r of robots) {
    ctx.fillStyle = '#7d7d7d';
    ctx.fillRect(r.x - r.size / 2, r.y - r.size / 2, r.size, r.size);
  }

  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 4, 4);
  }

  party.forEach((member, idx) => {
    if (!member.alive) {
      ctx.fillStyle = '#7d7d7d';
      ctx.fillRect(member.x, member.y, member.size, member.size);
      return;
    }
    ctx.fillStyle = member.color;
    ctx.fillRect(member.x, member.y, member.size, member.size);

    ctx.fillStyle = '#111';
    ctx.fillRect(member.x, member.y - 18, member.size, 6);
    ctx.fillStyle = '#25d65a';
    ctx.fillRect(member.x, member.y - 18, member.size * (member.hp / member.maxHp), 6);

    ctx.fillStyle = '#111';
    ctx.fillRect(member.x, member.y - 10, member.size, 5);
    ctx.fillStyle = '#ffd447';
    ctx.fillRect(member.x, member.y - 10, member.size * (member.pb / member.maxPb), 5);

    ctx.fillStyle = '#000';
    ctx.font = '12px sans-serif';
    ctx.fillText(member.name, member.x, member.y - 24);

    if (idx === selectedIndex) {
      ctx.strokeStyle = '#1e5bff';
      ctx.lineWidth = 2;
      ctx.strokeRect(member.x - 3, member.y - 3, member.size + 6, member.size + 6);
    }
  });

  ctx.fillStyle = '#000';
  ctx.font = '16px sans-serif';
  ctx.fillText('Selected: ' + party[selectedIndex].name, 20, 26);
  ctx.fillText('Controls: Arrows move, Space M1, Z defend, C passive, X special/final', 20, 48);
  if (transferPending) ctx.fillText('Transfer power: press 1, 2, or 3', 20, 70);
  if (onlyM1Phase) ctx.fillText('Final Phase: only M1 is allowed.', 20, 92);

  for (let i = 0; i < messages.length; i++) {
    ctx.fillText(messages[i], 20, canvas.height - 22 - i * 18);
  }
}

function gameLoop() {
  const now = performance.now();
  const dt = now - lastFrame;
  lastFrame = now;
  update(dt);
  draw();
  requestAnimationFrame(gameLoop);
}

function initGame() {
  resetPartyForRound();
  spawnEnemy(0);
  tutorialMode = true;
  log('Tutorial: Light Wizard is active.');
  log('Magatank starts as the selected character.');
}

initGame();
requestAnimationFrame(gameLoop);
