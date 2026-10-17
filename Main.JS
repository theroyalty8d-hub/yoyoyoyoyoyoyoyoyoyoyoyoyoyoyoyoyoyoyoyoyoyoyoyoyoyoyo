// Real-time battle prototype (not turn-based) with simple projectiles and enemy waves
// Controls:
// Arrows = move (selected character)
// Space = M1 (spawns a projectile; increases PB: +2 for Magatank/Magaknight, +1 for True Mage)
// Z = Defend (reduces damage while held)
// X = Special (press to use special if enough PB, hold X for Final Attack when PB full)
// C = Passive (class-specific)
// 1/2/3 = select party member (auto-starts with Magatank)

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 700;
canvas.height = 500;

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

// Party members
let party = [
  {
    id:1, name:'Magatank', x:50, y:80, size:50, color:'red',
    maxHp:100, hp:100, maxPb:10, pb:0, m1Gain:2, m1Dmg:10,
    defendReduction:0.5, specialCost:10, specialDmg:55, counterChance:1.0, speed:3, alive:true,
    m1Cooldown:1000, lastM1:0
  },
  {
    id:2, name:'Magaknight', x:50, y:200, size:40, color:'silver',
    maxHp:75, hp:75, maxPb:10, pb:0, m1Gain:2, m1Dmg:10,
    defendReduction:0.25, specialCost:10, specialDmg:55, counterChance:0.5, speed:3, alive:true,
    m1Cooldown:1000, lastM1:0
  },
  {
    id:3, name:'True Mage', x:50, y:320, size:30, color:'green',
    maxHp:25, hp:25, maxPb:10, pb:0, m1Gain:1, m1Dmg:15,
    defendReduction:0.15, specialCost:10, specialDmg:70, counterChance:0.25, speed:2.5, alive:true,
    m1Cooldown:1000, lastM1:0
  }
];
let selectedIndex = 0; // auto magatank

// Enemy roster (one at a time)
let enemyRoster = [
  {key:'lightwizard', name:'Light Wizard', hp:100, maxHp:100, color:'yellow', size:60},
  {key:'darkwizard', name:'Dark Wizard', hp:200, maxHp:200, color:'purple', size:60},
  {key:'blitz', name:'Blitz', hp:400, maxHp:400, color:'blue', size:70},
  {key:'cyberdio', name:'Cyber Dio', hp:500, maxHp:500, color:'black', size:45},
  {key:'bitbunny', name:'Bitbunny', hp:700, maxHp:700, color:'lightblue', size:70}
];
let currentEnemyIndex = 0;
let enemy = null;
let tutorialMode = true;

// Projectiles and effects
let projectiles = []; // {x,y, vx,vy, r, owner:'player'|'enemy', dmg, type:'bullet'|'meteor'|'knife' }
let particles = [];

let keys = {};
let holdXStart = null;
let messages = [];

function log(msg){ messages.unshift(msg); if(messages.length>6) messages.pop(); }

// Input
window.addEventListener('keydown', (e)=>{
  if(e.repeat) return;
  keys[e.key] = true;
  if(e.key === '1') selectedIndex = 0;
  if(e.key === '2') selectedIndex = 1;
  if(e.key === '3') selectedIndex = 2;
  if(e.key === 'x' || e.key === 'X') holdXStart = performance.now();
});
window.addEventListener('keyup', (e)=>{
  keys[e.key] = false;
  if(e.key === 'x' || e.key === 'X'){
    let held = 0; if(holdXStart) held = performance.now()-holdXStart; holdXStart = null;
    const actor = party[selectedIndex];
    if(!actor || !actor.alive) return;
    // Final attack if held and full PB
    if(held>=600 && actor.pb >= actor.maxPb){ doFinal(actor); return; }
    // Otherwise attempt special
    if(actor.pb >= actor.specialCost){ doSpecial(actor); }
    else { log(actor.name + ' tried Special but lacked power.'); }
  }
});

// Actions
function spawnPlayerM1(actor){
  if(!actor.alive) return;
  const now = Date.now();
  if(now < (actor.lastM1 || 0) + actor.m1Cooldown){ log('M1 on cooldown'); return; }
  actor.lastM1 = now;

  // spawn bullet towards enemy center (use drawn enemy position)
  if(!enemy || !enemy.alive){ log('No enemy to target'); return; }
  const ex = canvas.width - 120;
  const ey = canvas.height/2;
  const dirx = ex + enemy.size/2 - (actor.x + actor.size/2);
  const diry = ey + enemy.size/2 - (actor.y + actor.size/2);
  const len = Math.hypot(dirx,diry)||1;
  const speed = 6;
  projectiles.push({
    x: actor.x + actor.size/2,
    y: actor.y + actor.size/2,
    vx: dirx/len*speed,
    vy: diry/len*speed,
    r: 6,
    owner:'player', dmg: actor.m1Dmg, type:'bullet'
  });
  actor.pb = clamp(actor.pb + actor.m1Gain, 0, actor.maxPb);
  log(actor.name + ' M1: +' + actor.m1Gain + ' PB');
}

function doPassive(actor){
  if(!actor.alive) return;
  if(actor.id===1){ // Magatank: -5 PB, -25 dmg magic punch
    if(actor.pb<5){ log(actor.name+' lacks PB for Passive'); return; }
    actor.pb -= 5;
    if(enemy && enemy.alive){ enemy.hp -= 25; log(actor.name+' used Passive: Magic Punch -25'); if(enemy.hp<=0){ enemy.alive=false; onEnemyDefeated(); } }
  } else if(actor.id===2){ // Magaknight: -5 PB, -25 dmg, steal 2% hp
    if(actor.pb<5){ log(actor.name+' lacks PB for Passive'); return; }
    actor.pb -=5;
    if(enemy && enemy.alive){ enemy.hp -=25; const steal = Math.max(1, Math.floor(enemy.maxHp*0.02)); actor.hp = clamp(actor.hp + steal, 0, actor.maxHp); log(actor.name+' used Passive: Slash+Steal -25, +'+steal+' HP'); if(enemy.hp<=0){ enemy.alive=false; onEnemyDefeated(); } }
  } else if(actor.id===3){ // True Mage: heals based on PB
    if(actor.pb>=10){ actor.pb-=10; party.forEach(p=>p.hp = clamp(p.hp + Math.floor(p.maxHp*0.75), 0, p.maxHp)); log(actor.name+' Passive: Healed ALL +75%'); }
    else if(actor.pb>=6){ actor.pb-=6; let targets = party.filter(p=>p.alive).slice(0,2); targets.forEach(t=> t.hp = clamp(t.hp + Math.floor(t.maxHp*0.5),0,t.maxHp)); log(actor.name+' Passive: Healed TWO +50%'); }
    else if(actor.pb>=3){ actor.pb-=3; actor.hp = clamp(actor.hp + Math.floor(actor.maxHp*0.25),0,actor.maxHp); log(actor.name+' Passive: Healed ONE +25%'); }
    else { log(actor.name+' lacks PB for Passive'); }
  }
}

function doSpecial(actor){
  if(actor.pb < actor.specialCost) { log('Not enough PB'); return; }
  actor.pb -= actor.specialCost;
  // spawn barrage: several projectiles aimed at selected target
  const target = party[selectedIndex] && party[selectedIndex].alive ? party[selectedIndex] : party.find(p=>p.alive);
  const tx = (target) ? target.x + target.size/2 : canvas.width/2;
  const ty = (target) ? target.y + target.size/2 : canvas.height/2;
  for(let i=0;i<6;i++){
    const dirx = tx - (actor.x + actor.size/2) + (Math.random()-0.5)*40;
    const diry = ty - (actor.y + actor.size/2) + (Math.random()-0.5)*40;
    const len = Math.hypot(dirx,diry)||1;
    const speed = 5 + Math.random()*2;
    projectiles.push({ x: actor.x + actor.size/2, y: actor.y + actor.size/2, vx: dirx/len*speed, vy: diry/len*speed, r: 8, owner:'player', dmg: Math.ceil(actor.specialDmg/6), type:'magic' });
  }
  // stun enemy temporarily
  if(enemy) enemy.stunned = 600; // ms
  log(actor.name+' used SPECIAL: barrage, stun');
}

function doFinal(actor){
  // Final attack large meteor barrage consuming full PB
  if(actor.pb < actor.maxPb){ log('Need full PB'); return; }
  actor.pb = 0;
  // create a few large meteors from top aimed at selected target
  const target = party[selectedIndex] && party[selectedIndex].alive ? party[selectedIndex] : party[0];
  for(let i=0;i<8;i++){
    const mx = (target.x + target.size/2) + randInt(-40,40);
    projectiles.push({ x: mx, y: -20 - i*60, vx: (Math.random()-0.5)*1.5, vy: 4 + Math.random()*2, r: 18, owner:'player', dmg: Math.floor(actor.maxHp*0.5), type:'meteor' });
  }
  log(actor.name+' unleashed FINAL ATTACK!');
}

// Enemy spawn helper
function spawnEnemyFromRoster(index){
  const r = enemyRoster[index];
  if(!r) { enemy = null; return; }
  enemy = { ...r, x: canvas.width - 120, y: canvas.height/2 - r.size/2, alive: true, stunned: 0 };
  enemyTimer = 0;
}

// Enemy behaviors per type
let enemyTimer = 0;
function enemyAI(dt){
  if(!enemy || !enemy.alive) return;
  if(enemy.stunned){ enemy.stunned = Math.max(0, enemy.stunned - dt); return; }
  enemyTimer += dt;
  const actor = party[selectedIndex];
  const target = actor && actor.alive ? actor : party.find(p=>p.alive);
  if(!target) return;

  const ex = canvas.width - 120;
  const ey = canvas.height/2;

  // behavior by key
  if(enemy.key === 'lightwizard'){
    // tutorial: slow crystals aimed at player every 900ms
    if(enemyTimer > 900){
      enemyTimer = 0;
      const dirx = (target.x+target.size/2) - (ex + enemy.size/2);
      const diry = (target.y+target.size/2) - (ey + enemy.size/2);
      const len = Math.hypot(dirx,diry)||1;
      projectiles.push({ x: ex + enemy.size/2, y: ey + enemy.size/2, vx: dirx/len*3, vy: diry/len*3, r:7, owner:'enemy', dmg:7, type:'crystal' });
      log('Light Wizard throws a crystal!');
    }
  } else if(enemy.key === 'darkwizard'){
    if(enemyTimer > 700){ enemyTimer = 0; // shoots random targeted crystals
      const dirx = (target.x+target.size/2) - (ex + enemy.size/2) + randInt(-30,30);
      const diry = (target.y+target.size/2) - (ey + enemy.size/2) + randInt(-30,30);
      const len = Math.hypot(dirx,diry)||1;
      projectiles.push({ x: ex + enemy.size/2, y: ey + enemy.size/2, vx: dirx/len*4, vy: diry/len*4, r:8, owner:'enemy', dmg:8, type:'crystal' });
    }
  } else if(enemy.key === 'blitz'){
    if(enemyTimer > 300){ enemyTimer = 0;
      // spawn fast bullets aimed at selected player
      for(let i=0;i<3;i++){
        const dirx = (target.x+target.size/2) - (ex + enemy.size/2) + randInt(-20,20);
        const diry = (target.y+target.size/2) - (ey + enemy.size/2) + randInt(-20,20);
        const len = Math.hypot(dirx,diry)||1;
        projectiles.push({ x: ex + enemy.size/2, y: ey + enemy.size/2, vx: dirx/len*(8+Math.random()*2), vy: diry/len*(8+Math.random()*2), r:6, owner:'enemy', dmg:10, type:'bullet' });
      }
    }
  } else if(enemy.key === 'cyberdio'){
    if(enemyTimer > 500){ enemyTimer = 0; // throws knives at selected player
      const dirx = (target.x+target.size/2) - (ex + enemy.size/2);
      const diry = (target.y+target.size/2) - (ey + enemy.size/2);
      const len = Math.hypot(dirx,diry)||1;
      projectiles.push({ x: ex + enemy.size/2, y: ey + enemy.size/2, vx: dirx/len*5, vy: diry/len*5, r:5, owner:'enemy', dmg:7, type:'knife' });
    }
  } else if(enemy.key === 'bitbunny'){
    if(enemyTimer > 400){ enemyTimer = 0; // spawns ring bullets centered on screen but aimed to selected player
      const centerX = canvas.width/2; const centerY = canvas.height/2;
      for(let a=0;a<6;a++){
        const ang = a*(Math.PI*2/6);
        projectiles.push({ x:centerX + Math.cos(ang)*120, y:centerY + Math.sin(ang)*120, vx:Math.cos(ang)*-2, vy:Math.sin(ang)*-2, r:5, owner:'enemy', dmg:5, type:'gun' });
      }
    }
  }
}

// Collision helpers
function circleRectCollide(cx,cy,r, rx,ry,rw,rh){
  const closestX = clamp(cx, rx, rx+rw);
  const closestY = clamp(cy, ry, ry+rh);
  const dx = cx-closestX; const dy = cy-closestY;
  return dx*dx+dy*dy <= r*r;
}

// Update loop
let lastTime = performance.now();
function update(){
  const now = performance.now();
  const dt = now - lastTime; lastTime = now;

  // Player selection movement
  const actor = party[selectedIndex];
  if(actor && actor.alive){
    if(keys['ArrowRight']) actor.x += actor.speed;
    if(keys['ArrowLeft']) actor.x -= actor.speed;
    if(keys['ArrowUp']) actor.y -= actor.speed;
    if(keys['ArrowDown']) actor.y += actor.speed;
    actor.x = clamp(actor.x, 0, canvas.width - actor.size);
    actor.y = clamp(actor.y, 0, canvas.height - actor.size);

    // M1 space (on keydown is handled by press detection)
    if(keys[' ']){ // fire once per press: to avoid rapid fire, consume key
      keys[' '] = false;
      spawnPlayerM1(actor);
    }

    // Defend while Z held
    actor.defending = !!(keys['z']||keys['Z']);

    // Passive C
    if(keys['c']||keys['C']){ keys['c']=false; keys['C']=false; doPassive(actor); }

    // Special handled on X release (already)
  }

  // Enemy ai
  enemyAI(dt);

  // Move projectiles
  for(let i=projectiles.length-1;i>=0;i--){
    const p = projectiles[i];
    p.x += p.vx * (dt/16);
    p.y += p.vy * (dt/16);

    // offscreen cleanup
    if(p.x < -50 || p.x > canvas.width+50 || p.y < -1000 || p.y > canvas.height+50){ projectiles.splice(i,1); continue; }

    if(p.owner === 'player'){
      // hit enemy at drawn position
      if(enemy && enemy.alive && circleRectCollide(p.x,p.y,p.r, canvas.width - 120, canvas.height/2 - enemy.size/2, enemy.size, enemy.size)){
        enemy.hp -= p.dmg;
        projectiles.splice(i,1);
        // small particles
        particles.push({x:p.x,y:p.y,ttl:300});
        log('Hit enemy for '+p.dmg);
        if(enemy.hp <= 0){ enemy.alive=false; onEnemyDefeated(); }
      }
    } else {
      // enemy projectile hits ONLY the selected party member
      const m = party[selectedIndex];
      if(m && m.alive && circleRectCollide(p.x,p.y,p.r, m.x, m.y, m.size, m.size)){
        let dmg = p.dmg;
        if(m.defending) dmg = Math.ceil(dmg * (1 - m.defendReduction));
        m.hp -= dmg;
        projectiles.splice(i,1);
        particles.push({x:p.x,y:p.y,ttl:200});
        log(m.name+' hit for '+dmg);
        if(m.hp <= 0){ m.alive=false; log(m.name+' died.'); transferPB(m); }
      }
    }
  }

  // particles ttl
  for(let i=particles.length-1;i>=0;i--){ particles[i].ttl -= dt; if(particles[i].ttl<=0) particles.splice(i,1); }

  // enemy simple movement: keep at right side drawn position
  if(enemy && enemy.alive){ enemy.y = canvas.height/2 - enemy.size/2; }
}

function transferPB(deadMember){
  const alive = party.filter(p=>p.alive);
  if(alive.length>0){ alive[0].pb = clamp(alive[0].pb + deadMember.pb, 0, alive[0].maxPb); log(deadMember.name+"'s PB transferred to " + alive[0].name); }
}

function onEnemyDefeated(){
  log(enemy.name + ' defeated!');
  // advance to next enemy; restore party HP to full
  currentEnemyIndex++;
  if(currentEnemyIndex >= enemyRoster.length){ log('All enemies cleared. You win!'); enemy = null; return; }
  spawnEnemyFromRoster(currentEnemyIndex);
  // Restore party HP to full each round
  party.forEach(p=>{ p.hp = p.maxHp; p.alive = true; p.defending = false; });
  tutorialMode = false;
  log('New enemy: ' + enemy.name + '. Party restored to full HP.');
}

// Simple UI draw
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // background
  ctx.fillStyle='#ddd'; ctx.fillRect(0,0,canvas.width,canvas.height);

  // enemy drawn at right side
  if(enemy && enemy.alive){
    const ex = canvas.width - 120; const ey = canvas.height/2 - enemy.size/2;
    ctx.fillStyle = enemy.color; ctx.fillRect(ex, ey, enemy.size, enemy.size);
    // HP bar (visible and labeled)
    ctx.fillStyle='black'; ctx.fillRect(ex, ey-12, enemy.size, 8);
    ctx.fillStyle='red'; ctx.fillRect(ex, ey-12, enemy.size * (enemy.hp/enemy.maxHp), 8);
    ctx.fillStyle='black'; ctx.fillText(enemy.name + ' ' + Math.max(0,Math.floor(enemy.hp)) + '/' + enemy.maxHp, ex, ey-18);
  }

  // projectiles
  projectiles.forEach(p=>{
    if(p.type==='meteor'){
      // triangle
      ctx.fillStyle = 'orange';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x-12, p.y+20); ctx.lineTo(p.x+12, p.y+20); ctx.closePath(); ctx.fill();
    } else if(p.type==='knife'){
      ctx.fillStyle='black'; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x-6,p.y+3); ctx.lineTo(p.x+6,p.y+3); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = (p.owner==='player') ? 'cyan' : 'maroon'; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
    }
  });

  // party
  party.forEach((m,idx)=>{
    ctx.fillStyle = m.alive ? m.color : 'gray'; ctx.fillRect(m.x, m.y, m.size, m.size);
    ctx.fillStyle='black'; ctx.fillText(m.name, m.x, m.y-10);
    // HP
    ctx.fillStyle='black'; ctx.fillRect(m.x, m.y-18, m.size, 6);
    ctx.fillStyle='green'; ctx.fillRect(m.x, m.y-18, m.size * (m.hp/m.maxHp), 6);
    // PB
    ctx.fillStyle='black'; ctx.fillRect(m.x, m.y-10, m.size, 6);
    ctx.fillStyle='yellow'; ctx.fillRect(m.x, m.y-10, m.size * (m.pb/m.maxPb), 6);
    if(idx===selectedIndex){ ctx.strokeStyle='blue'; ctx.strokeRect(m.x-2,m.y-2,m.size+4,m.size+4); }
    if(m.defending){ ctx.fillStyle='rgba(0,0,0,0.2)'; ctx.fillRect(m.x, m.y, m.size, m.size); }
  });

  // HUD
  ctx.fillStyle='black'; ctx.fillText('Selected: ' + party[selectedIndex].name, 10, 20);
  ctx.fillText('Controls: Arrows Move, Space M1, Z Defend, C Passive, X Special/Hold Final', 10, 40);

  // messages
  for(let i=0;i<messages.length;i++){ ctx.fillText(messages[i], 10, canvas.height-20 - i*16); }

  // tutorial message
  if(tutorialMode && enemy && enemy.key==='lightwizard'){
    ctx.fillStyle='black'; ctx.fillText('Tutorial: Avoid crystals. Use Space to M1, C to Passive, X to Special when charged.', 120, 30);
  }
}

// initial tutorial setup: spawn a simple light wizard enemy only
function startTutorial(){
  tutorialMode = true; currentEnemyIndex = 0; spawnEnemyFromRoster(0);
  party.forEach(p=>{ p.hp = p.maxHp; p.pb = 0; p.alive = true; p.defending=false; p.lastM1 = 0; });
  log('Tutorial start: Face the Light Wizard.');
}

startTutorial();

function loop(){ update(); draw(); requestAnimationFrame(loop); }
loop();
