state.completionEffects={sound:true,confetti:true,...state.completionEffects};
let completionAudio;
let confettiAnimation=0;
let confettiCanvas=null;

function stopWorkConfetti(){
 cancelAnimationFrame(confettiAnimation);
 confettiCanvas?.remove();
 confettiCanvas=null;
}

function playWorkDing(){
 if(window.OrbitaAndroid?.completionSound){
  window.OrbitaAndroid.completionSound();
  return;
 }
 const Audio=window.AudioContext||window.webkitAudioContext;
 if(!Audio)return;
 try {
  completionAudio ||= new Audio();
  completionAudio.resume().then(()=>{
   const now=completionAudio.currentTime;
   for(const [frequency,offset,volume] of [[1046.5,0,.075],[1568,.06,.04]]){
    const tone=completionAudio.createOscillator();
    const gain=completionAudio.createGain();
    tone.frequency.value=frequency;
    gain.gain.setValueAtTime(0,now+offset);
    gain.gain.linearRampToValueAtTime(volume,now+offset+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,now+offset+.45);
    tone.connect(gain);gain.connect(completionAudio.destination);
    tone.start(now+offset);tone.stop(now+offset+.46);
   }
  }).catch(()=>{});
 }catch{}
}

function celebrateMajorWork(){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 stopWorkConfetti();
 const canvas=document.createElement('canvas');
 canvas.className='work-confetti';
 canvas.setAttribute('aria-hidden','true');
 canvas.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:120;width:100%;height:100%';
 const width=innerWidth,height=innerHeight,scale=Math.min(devicePixelRatio||1,2);
 canvas.width=width*scale;canvas.height=height*scale;
 const drawing=canvas.getContext('2d');
 if(!drawing)return;
 drawing.scale(scale,scale);
 const accent=getComputedStyle(document.body).getPropertyValue('--accent').trim()||'#a9c4ff';
 const colors=[accent,'#f39cc4','#f6d66e','#7cdbb8'];
 const pieces=Array.from({length:52},()=>({
  x:width/2,y:height*.48,vx:(Math.random()-.5)*width*.9,vy:-160-Math.random()*240,
  angle:Math.random()*6,spin:(Math.random()-.5)*8,color:colors[Math.floor(Math.random()*colors.length)]
 }));
 confettiCanvas=canvas;
 const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
 if(typeof canvas.showPopover==='function'){
  canvas.popover='manual';
  canvas.style.cssText+=';margin:0;padding:0;border:0;background:transparent;max-width:none;max-height:none';
  document.body.appendChild(canvas);
  try{canvas.showPopover()}catch{(dialog||document.body).appendChild(canvas)}
 }else (dialog||document.body).appendChild(canvas);
 const started=performance.now();
 function frame(now){
  const t=(now-started)/1000;
  if(t>1.5||document.hidden||!state.completionEffects.confetti){stopWorkConfetti();return}
  drawing.clearRect(0,0,width,height);
  drawing.globalAlpha=Math.min(1,(1.5-t)*2);
  for(const piece of pieces){
   drawing.save();
   drawing.translate(piece.x+piece.vx*t,piece.y+piece.vy*t+340*t*t);
   drawing.rotate(piece.angle+piece.spin*t);
   drawing.fillStyle=piece.color;drawing.fillRect(-3,-5,6,10);drawing.restore();
  }
  confettiAnimation=requestAnimationFrame(frame);
 }
 confettiAnimation=requestAnimationFrame(frame);
}
window.orbitaCelebrate=function(task){
 if(state.completionEffects.sound)playWorkDing();
 if(state.completionEffects.confetti&&(task.major??task.kind==='Курсовая'))celebrateMajorWork();
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopWorkConfetti()});

const effectsSettings=document.createElement('section');
effectsSettings.className='settings-section';
effectsSettings.id='completion-settings';
effectsSettings.innerHTML='<div class="settings-section-title"><span class="settings-section-icon">'+icon('bell')+'</span><div><h3>Выполнение работ</h3></div></div>'+
 '<label class="setting-row"><span>Звук «дзинь»<small>При выполнении, в том числе из виджета</small></span><input id="completion-sound" type="checkbox"></label>'+
 '<label class="setting-row"><span>Конфетти<small>Для крупных работ в приложении и виджете</small></span><input id="completion-confetti" type="checkbox"></label>';
$('.settings-about').before(effectsSettings);
for(const key of ['sound','confetti']){
 const input=$('#completion-'+key);
 input.checked=state.completionEffects[key];
 input.onchange=()=>{
  const previous=state.completionEffects[key];state.completionEffects[key]=input.checked;
  if(!save()){state.completionEffects[key]=previous;input.checked=previous}
  if(key==='confetti'&&!input.checked)stopWorkConfetti();
 };
}

if(window.OrbitaAndroid?.requestLessonNotificationPermission){
 const section=document.createElement('section');
 section.className='settings-section';
 section.innerHTML='<div class="settings-section-title"><span class="settings-section-icon">'+icon('bell')+
  '</span><div><h3>Напоминания о задачах</h3></div></div>'+
  '<label class="setting-row"><span>Ежедневный список задач<small>Только если есть незавершённые задачи</small></span><input type="checkbox" id="daily-work-enabled"></label>'+
  '<div class="setting-row daily-time-row" id="daily-work-time-row"><span>Время напоминания</span><button type="button" id="daily-work-time" aria-label="Изменить время напоминания"></button></div>';
 helpButton.before(section);
 const enabled=$('#daily-work-enabled'),time=$('#daily-work-time'),row=$('#daily-work-time-row');
 const paint=()=>{
  enabled.checked=!!state.dailyWorkReminder?.enabled;
  time.textContent=state.dailyWorkReminder?.time||'19:00';row.hidden=!enabled.checked;
 };
 function update(value){
  const previous=state.dailyWorkReminder;
  state.dailyWorkReminder={enabled:enabled.checked,time:value};
  if(!save()){state.dailyWorkReminder=previous;paint();return false}
  paint();
  if(enabled.checked&&window.OrbitaAndroid.notificationsAllowed?.()===false)
   window.OrbitaAndroid.requestLessonNotificationPermission();
  return true;
 }
 enabled.onchange=()=>update(state.dailyWorkReminder?.time||'19:00');
 time.onclick=()=>{
  const [hour,minute]=(state.dailyWorkReminder?.time||'19:00').split(':');
  modal('<h2>Время напоминания</h2><div class="daily-clock-fields">'+
   '<label>Часы<input id="daily-clock-hour" type="text" inputmode="numeric" maxlength="2" value="'+safe(hour)+'"></label>'+
   '<span aria-hidden="true">:</span><label>Минуты<input id="daily-clock-minute" type="text" inputmode="numeric" maxlength="2" value="'+safe(minute)+'"></label></div>'+
   '<p id="daily-clock-error" role="status"></p><button class="primary" id="daily-clock-save">Сохранить</button>');
  $('#daily-clock-save').onclick=()=>{
   const h=$('#daily-clock-hour').value.trim(),m=$('#daily-clock-minute').value.trim();
   if(!/^\d{1,2}$/.test(h)||!/^\d{1,2}$/.test(m)||Number(h)>23||Number(m)>59){
    $('#daily-clock-error').textContent='Укажи часы от 00 до 23 и минуты от 00 до 59.';return
   }
   if(update(h.padStart(2,'0')+':'+m.padStart(2,'0')))$('#modal').close();
  };
 };
 paint();
}
$('.settings-about').before(helpButton);
