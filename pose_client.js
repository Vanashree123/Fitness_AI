/* ====== DOM ====== */
const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

const startBtn = document.getElementById('startBtn');
const stopBtn  = document.getElementById('stopBtn');
const flipBtn  = document.getElementById('flipBtn');
const muteBtn  = document.getElementById('muteBtn');

const repEl = document.getElementById('repCount');
const setEl = document.getElementById('setCount');
const fb = document.getElementById('feedback');
const targetSetsEl = document.getElementById('targetSets');
const targetRepsEl = document.getElementById('targetReps');
const tutorial = document.getElementById('tutorial');
const formTip = document.getElementById('formTip');

/* ====== State ====== */
let facingMode = 'user';
let stream = null, camera = null, running = false;
let voiceOn = true, lastCueAt = 0;
let reps = 0, sets = 1, stage = 'idle';
let lastSavedSet = 0;

const EX = (window.GP_EXERCISE || 'Push-Up').trim();

/* ====== Helpers ====== */
function say(text){
  if(!voiceOn) return;
  const now = performance.now();
  if(now - lastCueAt < 800) return;
  lastCueAt = now;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.0; u.pitch = 1.0;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
function uiTip(text, kind='ok'){
  fb.textContent = text;
  fb.style.color = kind==='bad' ? '#ff6b6b' : kind==='warn' ? '#ffd166' : '#00d6a3';
}
function setRep(v){ reps = Math.max(0, v); repEl.textContent = reps; }
function setSet(v){ sets = Math.max(1, v); setEl.textContent = sets; }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function angle(a,b,c){
  const ab = [a.x-b.x, a.y-b.y], cb = [c.x-b.x, c.y-b.y];
  const dot = ab[0]*cb[0] + ab[1]*cb[1];
  const m1 = Math.hypot(ab[0],ab[1]), m2 = Math.hypot(cb[0],cb[1]);
  const cos = clamp(dot/((m1*m2)||1), -1, 1);
  return Math.acos(cos)*180/Math.PI;
}
function mid(p,q){ return { x:(p.x+q.x)/2, y:(p.y+q.y)/2 }; }

/* ====== Exercise configs (tutorial + logic) ====== */
const EXDB = {
  "Push-Up": {
    tutorial: "https://www.youtube.com/embed/_l3ySVKYVJ8",
    tip: "Body straight, hands under shoulders. Brace the core.",
    logic(lm){
      const L = n => lm[Pose.POSE_LANDMARKS[n]];
      const eL = angle(L('LEFT_SHOULDER'), L('LEFT_ELBOW'), L('LEFT_WRIST'));
      const eR = angle(L('RIGHT_SHOULDER'), L('RIGHT_ELBOW'), L('RIGHT_WRIST'));
      const e = (eL+eR)/2;
      const hips = mid(L('LEFT_HIP'), L('RIGHT_HIP'));
      const sh  = mid(L('LEFT_SHOULDER'), L('RIGHT_SHOULDER'));
      const spine = Math.abs(hips.y - sh.y);
      const down = e < 85, up = e > 150;
      let msg = "Lower with control"; let q="ok";
      if(spine > 0.08){ msg = "Brace core — no hip sag"; q="warn"; }
      return {down, up, message: msg, quality: q};
    }
  },
  "Bodyweight Squat": {
    tutorial: "https://www.youtube.com/embed/aclHkVaku9U",
    tip: "Knees track toes; chest up; neutral spine.",
    logic(lm){
      const L = n => lm[Pose.POSE_LANDMARKS[n]];
      const kL = angle(L('LEFT_HIP'), L('LEFT_KNEE'), L('LEFT_ANKLE'));
      const kR = angle(L('RIGHT_HIP'), L('RIGHT_KNEE'), L('RIGHT_ANKLE'));
      const knee = (kL+kR)/2;
      const hips = mid(L('LEFT_HIP'), L('RIGHT_HIP'));
      const sh = mid(L('LEFT_SHOULDER'), L('RIGHT_SHOULDER'));
      const torso = Math.atan2(hips.y - sh.y, hips.x - sh.x) * 180/Math.PI;
      const lean = Math.abs(90 - Math.abs(torso));
      const down = knee < 85, up = knee > 160;
      let msg = knee < 75 ? "Great depth — drive through heels" : "Sit back and keep chest up";
      let q = knee < 75 ? "ok" : "warn";
      if(lean > 30){ msg = "Keep chest up — avoid collapsing"; q="bad"; }
      return {down, up, message: msg, quality: q};
    }
  },
  "Biceps Curl": {
    tutorial: "https://www.youtube.com/embed/in7PaeYlhrM",
    tip: "Elbows pinned to sides. Control the tempo.",
    logic(lm){
      const L = n => lm[Pose.POSE_LANDMARKS[n]];
      const eL = angle(L('LEFT_SHOULDER'), L('LEFT_ELBOW'), L('LEFT_WRIST'));
      const eR = angle(L('RIGHT_SHOULDER'), L('RIGHT_ELBOW'), L('RIGHT_WRIST'));
      const e = Math.min(eL, eR);
      const drift = Math.abs(mid(L('LEFT_ELBOW'), L('RIGHT_ELBOW')).x - mid(L('LEFT_HIP'), L('RIGHT_HIP')).x);
      const down = e > 150, up = e < 60;
      let msg = e < 70 ? "Squeeze at top; control down" : "No swinging; keep elbows close";
      let q = e < 70 ? "ok" : "warn";
      if(drift > 0.12){ msg = "Pin elbows — don’t let them drift forward"; q="bad"; }
      return {down, up, message: msg, quality: q};
    }
  },
  "Crunch": {
    tutorial: "https://www.youtube.com/embed/MKmrqcoCZ-M",
    tip: "Exhale on the way up; keep chin off chest.",
    logic(lm){
      // Simple torso angle using shoulder-hip vs vertical
      const L = n => lm[Pose.POSE_LANDMARKS[n]];
      const hips = mid(L('LEFT_HIP'), L('RIGHT_HIP'));
      const sh = mid(L('LEFT_SHOULDER'), L('RIGHT_SHOULDER'));
      const torso = Math.atan2(hips.y - sh.y, hips.x - sh.x) * 180/Math.PI;
      const crunchTop = Math.abs(torso) < 60;  // more vertical
      const crunchBottom = Math.abs(torso) > 75;
      return {down: crunchBottom, up: crunchTop, message: "Slow controlled reps", quality: "ok"};
    }
  },
  "Plank": {
    tutorial: "https://www.youtube.com/embed/pSHjTRCQxIw",
    tip: "Body in straight line; brace core; don’t drop hips.",
    logic(lm){
      const L = n => lm[Pose.POSE_LANDMARKS[n]];
      const hips = mid(L('LEFT_HIP'), L('RIGHT_HIP'));
      const sh = mid(L('LEFT_SHOULDER'), L('RIGHT_SHOULDER'));
      const diff = Math.abs(hips.y - sh.y);
      let msg = diff < 0.06 ? "Nice straight line — hold!" : "Lift hips slightly; keep straight";
      return {down:false, up:false, message: msg, quality: diff<0.06?'ok':'warn'};
    }
  }
};

/* Tutorial + tip */
(function initUI(){
  const info = EXDB[EX] || EXDB["Push-Up"];
  tutorial.src = info.tutorial;
  formTip.textContent = "Form tip: " + info.tip;
  uiTip("Ready. Get into starting position.");
})();

/* Manual controls */
document.getElementById('repPlus').onclick = ()=> setRep(reps+1);
document.getElementById('repMinus').onclick = ()=> setRep(reps-1);
document.getElementById('resetAll').onclick = ()=>{ setRep(0); setSet(1); stage='idle'; lastSavedSet=0; uiTip("Reset. Ready."); };

muteBtn.onclick = ()=>{
  voiceOn = !voiceOn;
  muteBtn.textContent = voiceOn ? "🔊 Voice On" : "🔇 Voice Off";
};

/* ====== Camera + MediaPipe setup ====== */
const pose = new Pose.Pose({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
pose.onResults(onResults);

async function startCamera(){
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
  video.srcObject = stream; await video.play();
  camera = new Camera(video, { onFrame: async () => { await pose.send({ image: video }); }, width: 1280, height: 720 });
  canvas.width  = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  await camera.start();
  running = true;
}
function stopCamera(){
  if(camera) camera.stop();
  if(stream){ stream.getTracks().forEach(t => t.stop()); }
  running = false;
}
async function flipCamera(){ stopCamera(); facingMode = (facingMode==='user'?'environment':'user'); await startCamera(); }

startBtn.onclick = startCamera;
stopBtn.onclick  = stopCamera;
flipBtn.onclick  = flipCamera;

/* ====== Core onResults ====== */
function onResults(res){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(res.image) ctx.drawImage(res.image, 0, 0, canvas.width, canvas.height);

  if(!res.poseLandmarks){ uiTip("No person detected. Step back & fit in frame.","warn"); return; }

  drawConnectors(ctx, res.poseLandmarks, Pose.POSE_CONNECTIONS, { color:'#d6d8e8', lineWidth:3 });
  drawLandmarks(ctx, res.poseLandmarks, { color:'#ff414d', lineWidth:1, radius:3 });

  const info = EXDB[EX] || EXDB["Push-Up"];
  const { down, up, message, quality } = info.logic(res.poseLandmarks);

  // State machine
  if(down && stage!=='down'){ stage='down'; say("Down"); }
  if(up && stage==='down'){ stage='up'; setRep(reps+1); say("Up"); }

  uiTip(message, quality);

  // Targets and auto-save
  const targetReps = parseInt(targetRepsEl.value||"12",10);
  const targetSets = parseInt(targetSetsEl.value||"3",10);

  if(reps >= targetReps){
    // Save once per finished set
    if(lastSavedSet !== sets){
      lastSavedSet = sets;
      onFinishSet({ exercise: EX, setNumber: sets, reps });
    }
    setRep(0);
    setSet(sets+1);
    say(`Set ${sets-1} complete`);
    uiTip(`Set ${sets-1} complete. Rest, then continue.`, 'ok');
    if(sets > targetSets){
      say("Workout complete. Great job.");
      uiTip("Workout complete! 🎉", 'ok');
    }
  }

  // HUD
  ctx.fillStyle = "rgba(0,0,0,.48)";
  ctx.fillRect(10,10,260,84);
  ctx.fillStyle = "#fff";
  ctx.font = "14px Inter, Arial";
  ctx.fillText(`Exercise: ${EX}`, 20, 32);
  ctx.fillText(`Set ${sets}/${targetSets} • Reps ${reps}/${targetReps}`, 20, 52);
  ctx.fillText(`Camera: ${running ? 'on' : 'off'}`, 20, 72);
}

/* ====== Save to backend ====== */
async function onFinishSet({ exercise, setNumber, reps }){
  try{
    if(!window.GP_SAVE_URL) return;
    const wt = inferGroup(exercise);
    await fetch(window.GP_SAVE_URL, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ workoutType: wt, exercise, sets: 1, reps })
    });
  }catch(e){ console.warn('Save failed', e); }
}
function inferGroup(name){
  const s = name.toLowerCase();
  if(s.includes('push')) return 'push';
  if(s.includes('squat')||s.includes('lunge')||s.includes('leg')) return 'legs';
  if(s.includes('curl')) return 'biceps_triceps';
  if(s.includes('plank')||s.includes('crunch')||s.includes('abs')) return 'abs';
  return 'push';
}
