/* Advanced Car Game — script.js (updated: difficulty presets, vehicle select, prefer mp3/ogg) */

(() => {
  const gameContainer = document.getElementById('gameContainer');
  const playerCar = document.getElementById('playerCar');
  const bgFar = document.getElementById('bgFar');
  const bgMid = document.getElementById('bgMid');
  const bgNear = document.getElementById('bgNear');
  const scoreEl = document.getElementById('score');
  const speedLabel = document.getElementById('speedLabel');
  const diffLabel = document.createElement('div');
  diffLabel.id = 'diffLabel';
  diffLabel.textContent = 'Diff: Normal';
  document.getElementById('hud').appendChild(diffLabel);

  const startOverlay = document.getElementById('startOverlay');
  const startBtn = document.getElementById('startBtn');
  const playerNameInput = document.getElementById('playerName');
  const useImagesCheckbox = document.getElementById('useImages');
  const pauseBtn = document.getElementById('pauseBtn');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const resumeBtn = document.getElementById('resumeBtn');
  const restartBtnFromPause = document.getElementById('restartBtnFromPause');
  const gameOverOverlay = document.getElementById('gameOverOverlay');
  const finalScore = document.getElementById('finalScore');
  const saveScoreBtn = document.getElementById('saveScoreBtn');
  const saveScoreFirebaseBtn = document.getElementById('saveScoreFirebaseBtn');
  const restartBtn = document.getElementById('restartBtn');
  const leaderboardEl = document.getElementById('leaderboard');
  const touchControls = document.getElementById('touchControls');
  const muteToggle = document.getElementById('muteToggle');
  const musicVol = document.getElementById('musicVol');
  const sfxVol = document.getElementById('sfxVol');

  // new controls
  const difficultySelect = document.getElementById('difficultySelect');
  const vehicleSelect = document.getElementById('vehicleSelect');

  // geometry & lanes
  const W = gameContainer.clientWidth;
  const H = gameContainer.clientHeight;
  const lanes = 3;
  const roadLeft = Math.round(W * 0.2);
  const roadWidth = Math.round(W * 0.6);
  const laneWidth = Math.floor(roadWidth / lanes);
  const laneCenters = Array.from({length: lanes}, (_, i) => roadLeft + Math.floor(laneWidth/2) + i * laneWidth);

  // game state
  let running = false, paused = false;
  let lastTime = 0;
  let spawnTimer = 0, spawnInterval = 1400;
  let objects = [];
  const player = { x: laneCenters[1] - 28, y: H - 120, w:56, h:86, speed:6, score:0, shield:false, shieldT:0, slowT:0, magnetT:0, name:'You', vehicle:'car' };

  // difficulty presets
  const DIFFICULTY = {
    easy:   { startSpeed: 1.0, targetSpeed: 3.2, spawnInterval: 1700, oppSpeedMult: 0.9 },
    normal: { startSpeed: 1.2, targetSpeed: 4.0, spawnInterval: 1400, oppSpeedMult: 1.0 },
    hard:   { startSpeed: 1.6, targetSpeed: 5.2, spawnInterval: 1100, oppSpeedMult: 1.2 }
  };
  let currentPreset = 'normal';

  // speed ramp
  let gameSpeed = DIFFICULTY.normal.startSpeed;
  let targetSpeed = DIFFICULTY.normal.targetSpeed;
  let speedRampRate = 0.006;

  // input
  const keys = { ArrowLeft:false, ArrowRight:false, ArrowUp:false, ArrowDown:false };
  const touch = { left:false, right:false, up:false, down:false };

  // audio pref loading (prefer mp3 then ogg then wav)
  let audioCtx = null, engineGainNode = null, engineOsc = null;
  const audioFiles = {}; // holds playable element or null

  const audioAssets = {
    engine: ['assets/snd_engine_loop.mp3','assets/snd_engine_loop.ogg','assets/snd_engine_loop.wav'],
    crash:  ['assets/snd_crash.mp3','assets/snd_crash.ogg','assets/snd_crash.wav'],
    powerup:['assets/snd_powerup.mp3','assets/snd_powerup.ogg','assets/snd_powerup.wav'],
    coin:   ['assets/snd_coin.mp3','assets/snd_coin.ogg','assets/snd_coin.wav'],
    nuke:   ['assets/snd_nuke.mp3','assets/snd_nuke.ogg','assets/snd_nuke.wav'],
    button: ['assets/snd_button.mp3','assets/snd_button.ogg','assets/snd_button.wav']
  };

  // Try to load the best available format for each audio key
  function chooseAudioFile(pathCandidates){
    // Synchronous check: try to create Audio element and check canPlayType
    for (const p of pathCandidates){
      try {
        const a = new Audio();
        // Quick heuristic: check extension
        const ext = p.split('.').pop().toLowerCase();
        if (ext === 'mp3' && a.canPlayType('audio/mpeg')) return p;
        if (ext === 'ogg' && a.canPlayType('audio/ogg')) return p;
        if (ext === 'wav' && a.canPlayType('audio/wav')) return p;
        // if browser returns empty string for canPlayType, still allow (fallback)
      } catch(e){}
    }
    // fallback to first candidate
    return pathCandidates[pathCandidates.length-1];
  }

  Object.keys(audioAssets).forEach(k => {
    const pick = chooseAudioFile(audioAssets[k]);
    audioFiles[k] = new Audio(pick);
    audioFiles[k].preload = 'auto';
  });

  function ensureAudioSynth(){
    if (!audioCtx){
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      engineOsc = audioCtx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineGainNode = audioCtx.createGain();
      engineGainNode.gain.value = 0;
      engineOsc.connect(engineGainNode);
      engineGainNode.connect(audioCtx.destination);
      engineOsc.frequency.value = 80;
      engineOsc.start();
    } else if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playSfx(name, volume=1.0){
    const a = audioFiles[name];
    if (a && a.play) {
      try {
        const clone = a.cloneNode(true);
        clone.volume = Math.max(0, Math.min(1, volume * getSfxVol()));
        clone.play().catch(()=>{ /* ignore */ });
        return clone;
      } catch(e){ synthBlip(name); }
    } else synthBlip(name);
  }
  function synthBlip(kind){
    try {
      ensureAudioSynth();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type = kind==='crash' ? 'square' : 'sine';
      const freq = kind==='coin' ? 1200 : kind==='powerup'? 700 : 500;
      o.frequency.value = freq;
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.06 * getSfxVol(), audioCtx.currentTime + 0.01);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22);
      o.stop(audioCtx.currentTime + 0.23);
    } catch(e){}
  }

  function startEngineAudio(){
    if (audioFiles.engine && audioFiles.engine.play){
      try {
        audioFiles.engine.loop = true;
        audioFiles.engine.volume = getMusicVol();
        audioFiles.engine.play().catch(()=>{});
        return;
      } catch(e){}
    }
    ensureAudioSynth();
    if (engineGainNode) engineGainNode.gain.value = 0.02 + (gameSpeed/120);
  }
  function stopEngineAudio(){
    if (audioFiles.engine && audioFiles.engine.pause) {
      try { audioFiles.engine.pause(); audioFiles.engine.currentTime = 0; } catch(e) {}
    }
    if (engineGainNode) engineGainNode.gain.value = 0;
  }

  function getSfxVol(){ return muteToggle.checked ? 0 : parseFloat(sfxVol.value || 1.0); }
  function getMusicVol(){ return muteToggle.checked ? 0 : parseFloat(musicVol.value || 0.6); }

  // helpers
  function makeEl(cl='div', cls=''){ const e = document.createElement('div'); if (cls) e.className = cls; return e; }
  function vib(ms=30){ if (navigator.vibrate) navigator.vibrate(ms); }
  function collides(el1, el2){ const a = el1.getBoundingClientRect(); const b = el2.getBoundingClientRect(); return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom); }

  // parallax & lines
  let bgFarX = 0, bgMidX = 0, bgNearX = 0;
  function updateParallax(dt, speed){ bgFarX -= dt * speed * 0.02; bgMidX -= dt * speed * 0.05; bgNearX -= dt * speed * 0.12; bgFar.style.backgroundPosition = `${Math.floor(bgFarX)}px 0`; bgMid.style.backgroundPosition = `${Math.floor(bgMidX)}px 0`; bgNear.style.backgroundPosition = `${Math.floor(bgNearX)}px 0`; }

  let roadLines = [];
  function setupRoadLines(){ roadLines.forEach(r=>r.remove()); roadLines = []; for (let i=0;i<6;i++){ const l = document.createElement('div'); l.className = 'roadLine'; l.style.top = `${i * (H/6) - 100}px`; gameContainer.appendChild(l); roadLines.push(l); } }

  // spawn opponents & powerups (opponents get difficulty multiplier)
  function spawnOpp(){
    const pPow = Math.random();
    if (pPow < 0.14){
      const r = Math.random();
      let kind = r < 0.4 ? 'shield' : r < 0.7 ? 'coin' : r < 0.9 ? 'magnet' : 'nuke';
      const el = makeEl('div','powerup');
      el.innerText = kind === 'coin' ? '¢' : kind === 'shield' ? 'S' : kind === 'magnet' ? 'M' : '☢';
      el.style.width='48px'; el.style.height='48px';
      el.style.background = kind==='coin'? '#f59e0b' : kind==='shield'? '#facc15' : kind==='magnet'? '#8b5cf6' : '#ef4444';
      const lane = Math.floor(Math.random()*lanes);
      const x = laneCenters[lane] - 24;
      const y = -80;
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      gameContainer.appendChild(el);
      objects.push({ type:'powerup', kind, el, x, y, speed: (2 + Math.random()*1.4) });
      return;
    }
    const el = makeEl('div','opponent');
    const lane = Math.floor(Math.random()*lanes);
    const x = laneCenters[lane] - 28;
    const y = -140;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    // set opponent appearance: sometimes bike variant
    const useBike = Math.random() < 0.25;
    if (useBike) el.style.backgroundImage = 'url("assets/opponent-bike1.png")';
    else el.style.backgroundImage = Math.random() < 0.5 ? 'url("assets/opponent-car.png")' : 'url("assets/opponent-car2.png")';
    gameContainer.appendChild(el);
    const baseSpeed = (2 + Math.random()*1.6);
    objects.push({ type:'opponent', el, x, y, speed: baseSpeed * DIFFICULTY[currentPreset].oppSpeedMult });
  }

  // explosion helpers
  function spawnExplosion(cx, cy){ const ex = makeEl('div','explosion'); ex.style.left = `${cx-64}px`; ex.style.top = `${cy-64}px`; gameContainer.appendChild(ex); setTimeout(()=>ex.remove(),700); }
  function explodeElAt(el){ const r = el.getBoundingClientRect(); const pr = gameContainer.getBoundingClientRect(); const cx = r.left - pr.left + r.width/2; const cy = r.top - pr.top + r.height/2; spawnExplosion(cx, cy); }

  // input
  document.addEventListener('keydown', e => { if (e.key in keys) { keys[e.key] = true; e.preventDefault(); } if (e.key === 'p' || e.key === 'P') togglePause(); });
  document.addEventListener('keyup', e => { if (e.key in keys) keys[e.key] = false; });

  touchControls.addEventListener('pointerdown', e => { const a = e.target.dataset.action; if (!a) return; e.target.setPointerCapture(e.pointerId); playSfx('button'); vib(12); if (a==='left') touch.left = true; if (a==='right') touch.right = true; if (a==='up') touch.up = true; if (a==='down') touch.down = true; });
  touchControls.addEventListener('pointerup', e => { const a = e.target.dataset.action; if (!a) return; if (a==='left') touch.left = false; if (a==='right') touch.right = false; if (a==='up') touch.up = false; if (a==='down') touch.down = false; });

  // leaderboard localStorage
  function getLB(){ return JSON.parse(localStorage.getItem('cg_leaderboard') || '[]'); }
  function saveLB(list){ localStorage.setItem('cg_leaderboard', JSON.stringify(list)); }
  function addScoreLocal(name, score){ const lb=getLB(); lb.push({name, score:Math.floor(score), ts:Date.now()}); lb.sort((a,b)=>b.score-a.score); if(lb.length>10) lb.length=10; saveLB(lb); renderLB(); }
  function renderLB(){ const lb=getLB(); leaderboardEl.innerHTML=''; lb.forEach(it=>{ const li=document.createElement('li'); li.textContent=`${it.name} — ${it.score}`; leaderboardEl.appendChild(li); }); }

  // firebase helper stubs
  let firebaseEnabled = false;
  function initFirebase(configObj){ try{ firebase.initializeApp(configObj); window.db = firebase.firestore(); firebaseEnabled = true; console.log('Firebase initialized'); } catch(e){ console.warn('Firebase init failed', e); } }
  async function saveScoreFirebase(name, score){ if(!firebaseEnabled || !window.db) return; try{ await db.collection('scores').add({ name, score: Math.floor(score), ts: firebase.firestore.FieldValue.serverTimestamp() }); } catch(e){ console.error('Firebase save failed', e); } }

  // UI setup & wiring
  startBtn.addEventListener('click', ()=>{
    // apply selected difficulty & vehicle
    const chosen = difficultySelect.value || 'normal';
    currentPreset = chosen;
    const preset = DIFFICULTY[chosen];
    gameSpeed = preset.startSpeed;
    targetSpeed = preset.targetSpeed;
    spawnInterval = preset.spawnInterval;
    // update UI
    diffLabel.textContent = `Diff: ${chosen.charAt(0).toUpperCase()+chosen.slice(1)}`;
    player.vehicle = (vehicleSelect.value || 'car');
    // set player sprite
    if (useImagesCheckbox.checked){
      if (player.vehicle === 'car') playerCar.style.backgroundImage = 'url("assets/player-car.png")';
      else playerCar.style.backgroundImage = 'url("assets/player-bike.png")';
    } else {
      playerCar.style.backgroundImage = '';
      playerCar.style.backgroundColor = player.vehicle === 'car' ? '#4ade80' : '#fb7185';
    }
    // name
    const name = (playerNameInput.value || 'You').trim();
    player.name = name ? name.slice(0,12) : 'You';
    // start
    playSfx('button');
    startOverlay.classList.add('hidden');
    startGame();
  });

  pauseBtn.addEventListener('click', ()=>{ togglePause(); playSfx('button'); vib(10); });
  resumeBtn.addEventListener('click', ()=>{ togglePause(); playSfx('button'); vib(10); });
  restartBtnFromPause.addEventListener('click', ()=>{ restartGame(); playSfx('button'); vib(20); });
  restartBtn.addEventListener('click', ()=>{ restartGame(); playSfx('button'); vib(20); });
  saveScoreBtn.addEventListener('click', ()=>{ addScoreLocal(player.name||'You', player.score); playSfx('button'); });
  saveScoreFirebaseBtn.addEventListener('click', ()=>{ saveScoreFirebase(player.name||'You', player.score); playSfx('button'); });

  // start / restart functions
  function startGame(){
    objects.forEach(o=>o.el.remove()); objects=[];
    player.x = laneCenters[1] - player.w/2;
    player.y = H - 120;
    player.score = 0; player.shield=false; player.shieldT=0; player.slowT=0; player.magnetT=0;
    spawnTimer = 0;
    // spawnInterval already set by preset; ensure gameSpeed/targetSpeed set
    lastTime = performance.now(); running=true; paused=false;
    playerCar.style.left = `${player.x}px`; playerCar.style.top = `${player.y}px`;
    setupRoadLines();
    startEngineAudio();
    requestAnimationFrame(loop);
  }
  function restartGame(){ startOverlay.classList.remove('hidden'); gameOverOverlay.classList.add('hidden'); pauseOverlay.classList.add('hidden'); running=false; paused=false; stopEngineAudio(); }

  function togglePause(){ if(!running) return; paused = !paused; if(paused){ pauseOverlay.classList.remove('hidden'); if(engineGainNode) engineGainNode.gain.value = 0.01; if(audioFiles.engine) audioFiles.engine.pause(); } else { pauseOverlay.classList.add('hidden'); if(engineGainNode) engineGainNode.gain.value = 0.06 + (gameSpeed/120); if(audioFiles.engine){ audioFiles.engine.volume = getMusicVol(); audioFiles.engine.play().catch(()=>{}); } } }

  // main loop
  function loop(now){
    if(!running) return;
    const dt = Math.min(40, now - lastTime);
    lastTime = now;

    // ramp speed
    if (gameSpeed < targetSpeed) {
      gameSpeed += speedRampRate * (dt/16);
      if (gameSpeed > targetSpeed) gameSpeed = targetSpeed;
    }

    if(!paused){
      if(engineGainNode) engineGainNode.gain.value = 0.02 + (gameSpeed/120);
      if(audioFiles.engine) audioFiles.engine.volume = getMusicVol();

      // input
      if (keys.ArrowLeft || touch.left) player.x -= player.speed;
      if (keys.ArrowRight || touch.right) player.x += player.speed;
      if (keys.ArrowUp || touch.up) player.y -= player.speed;
      if (keys.ArrowDown || touch.down) player.y += player.speed;

      // clamp & update UI pos
      const leftBound = roadLeft;
      const rightBound = roadLeft + laneWidth * lanes - player.w;
      player.x = Math.max(leftBound, Math.min(rightBound, player.x));
      player.y = Math.max(10, Math.min(H - player.h - 8, player.y));
      playerCar.style.left = `${player.x}px`; playerCar.style.top = `${player.y}px`;

      // parallax
      updateParallax(dt, gameSpeed);

      // road lines
      roadLines.forEach(line => { let t = parseFloat(line.style.top); t += (gameSpeed * dt / 16) * 5; if (t > H) t = -120; line.style.top = `${t}px`; });

      // spawn
      spawnTimer += dt;
      if (spawnTimer > spawnInterval){ spawnTimer = 0; spawnOpp(); spawnInterval = Math.max(400, spawnInterval - 2); }

      // move objects & collisions
      for (let i = objects.length - 1; i >= 0; i--){
        const o = objects[i];
        if (player.magnetT && player.magnetT > 0 && o.type === 'powerup' && o.kind === 'coin'){
          const dx = (player.x - o.x) * 0.08;
          o.x += dx;
        }
        const slowFactor = (player.slowT && player.slowT > 0) ? 0.45 : 1;
        o.y += (o.speed + (gameSpeed/1.5)) * (dt/16) * 4 * slowFactor;
        o.el.style.top = `${o.y}px`; o.el.style.left = `${o.x}px`;
        if (o.y > H + 160){ o.el.remove(); objects.splice(i,1); continue; }
        if (o.type === 'opponent'){
          if (!player.shield && collides(playerCar, o.el)){ explodeElAt(o.el); endGame(o.el); return; }
          else if (player.shield && collides(playerCar, o.el)){ spawnExplosion(o.x+28,o.y+43); o.el.remove(); objects.splice(i,1); player.score+=150; playSfx('powerup'); continue; }
        } else if (o.type === 'powerup'){
          if (collides(playerCar, o.el)){
            if (o.kind === 'shield'){ player.shield = true; player.shieldT = 5000; }
            else if (o.kind === 'slow'){ player.slowT = 5000; }
            else if (o.kind === 'coin'){ player.score += 200; playSfx('coin'); }
            else if (o.kind === 'magnet'){ player.magnetT = 5000; }
            else if (o.kind === 'nuke'){
              for (let j = objects.length - 1; j >= 0; j--){
                const x2 = objects[j];
                if (x2.type === 'opponent' && Math.abs(x2.x - player.x) < 140 && x2.y > -200){
                  spawnExplosion(x2.x+28,x2.y+43); x2.el.remove(); objects.splice(j,1); player.score += 120;
                }
              }
            }
            o.el.remove(); objects.splice(i,1); playSfx('powerup'); vib(40); continue;
          }
        }
      }

      // score & difficulty scaling
      const slowMult = (player.slowT && player.slowT > 0) ? 0.5 : 1;
      player.score += dt * 0.12 * (1 + gameSpeed/10) * slowMult;
      scoreEl.innerText = `Score: ${Math.floor(player.score)}`;
      speedLabel.innerText = `Speed: ${ (1 + (gameSpeed-1)/4).toFixed(2) }x`;

      // timers for powerups
      if (player.shield && player.shieldT > 0){ player.shieldT -= dt; playerCar.style.boxShadow = '0 8px 28px rgba(250,204,21,0.8)'; if (player.shieldT <= 0){ player.shield=false; playerCar.style.boxShadow='0 6px 18px rgba(0,0,0,0.6)'; } }
      if (player.slowT && player.slowT > 0){ player.slowT -= dt; gameContainer.style.filter = 'saturate(0.9) contrast(0.95)'; if (player.slowT <= 0){ player.slowT = 0; gameContainer.style.filter = ''; } }
      if (player.magnetT && player.magnetT > 0){ player.magnetT -= dt; if (player.magnetT <= 0) player.magnetT = 0; }

      // difficulty increases every 500 points
      if (Math.floor(player.score) !== 0 && Math.floor(player.score) % 500 === 0){
        targetSpeed += 0.18;
      }
    }

    requestAnimationFrame(loop);
  }

  function endGame(opEl=null){ running=false; finalScore.textContent = `Score: ${Math.floor(player.score)}`; gameOverOverlay.classList.remove('hidden'); if(opEl) explodeElAt(opEl); playSfx('crash'); vib(140); stopEngineAudio(); }

  // init
  function init(){
    player.x = laneCenters[1] - player.w/2;
    playerCar.style.left = `${player.x}px`; playerCar.style.top = `${player.y}px`;
    setupRoadLines(); renderLB(); gameContainer.addEventListener('click', ()=>gameContainer.focus());
    // auto init firebase if config injected
    if (window._firebaseConfig){
      try { firebase.initializeApp(window._firebaseConfig); window.db = firebase.firestore(); firebaseEnabled = true; console.log('Firebase auto-initialized'); } catch(e){ console.warn('Firebase init failed', e); }
    }
  }
  init();

  // expose helpers
  window.initFirebase = initFirebase;
  window.saveScoreToFirebase = saveScoreFirebase;

})();
