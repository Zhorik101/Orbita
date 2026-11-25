// Presets and custom colors are distinct modes. Editing a draft never changes saved appearance.
const validColor=value=>/^#[0-9a-f]{6}$/i.test(value);
function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))}
function mixColor(a,b,amount){return '#'+rgb(a).map((value,i)=>Math.round(value*(1-amount)+rgb(b)[i]*amount).toString(16).padStart(2,'0')).join('')}
function luminance(hex){return rgb(hex).map(n=>{const s=n/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4}).reduce((sum,value,i)=>sum+value*[.2126,.7152,.0722][i],0)}
function readableText(background){return (luminance(background)+.05)/.05>=1.05/(luminance(background)+.05)?'#000000':'#ffffff'}
function colorContrast(a,b){
 const first=luminance(a),second=luminance(b);
 return (Math.max(first,second)+.05)/(Math.min(first,second)+.05);
}
function ensureContrast(color,text,...surfaces){
 for(let i=0;i<12&&surfaces.some(surface=>colorContrast(color,surface)<4.5);i++)color=mixColor(color,text,.2);
 return color;
}
function appearancePalette(accent,background,custom=true){
 if(custom){
  const channels=rgb(background),spread=Math.max(...channels)-Math.min(...channels);
  const dark=luminance(background)<.179;
  // Pull vivid and middle-tone colors toward a tinted light or dark base.
  const normalization=Math.max(0,(spread-96)/180,luminance(background)>.09&&luminance(background)<.48?.65:0);
  background=mixColor(background,dark?'#101218':'#f5f6fa',normalization);
  const text=dark?'#ffffff':'#111318';
  const panel=mixColor(background,'#ffffff',dark?.10:.60);
  const line=mixColor(panel,text,dark?.19:.18);
  accent=ensureContrast(accent,text,background,panel);
  const soft=mixColor(panel,accent,.11);
  const muted=ensureContrast(mixColor(panel,text,.66),text,background,panel,soft);
  return {accent,background,text,panel,line,muted,soft,onAccent:readableText(accent),dark};
 }
 const text=readableText(background),toward=text==='#ffffff'?'#ffffff':'#000000';
 return {accent,background,text,panel:mixColor(background,toward,.065),line:mixColor(background,toward,.14),muted:mixColor(background,text,.62),soft:mixColor(background,accent,.2),onAccent:readableText(accent),dark:text==='#ffffff'};
}
const glassModes=['off','low','normal'];
state.glassEffect=glassModes.includes(state.glassEffect)?state.glassEffect:'normal';

function glassPalette(palette, mode){
 const {panel,background,accent,text,muted,line,dark}=palette;
 if(mode==='off')return {'--glass-surface':panel,'--glass-chrome':panel,'--glass-solid':panel,'--glass-edge':line,
  '--glass-highlight':'transparent','--glass-blur':'0px','--glass-toolbar-blur':'0px','--glass-dialog-blur':'0px'};
 const contrast=Math.abs(luminance(panel)-luminance(background));
 const tint=mixColor(panel,accent,dark?.055:.035);
 const low=mode==='low';
 // Keep foreground contrast even when a bright or dark part of the page scrolls under the glass.
 let opacity=low?.96:Math.max(dark?.88:.90,.88+contrast*.3);
 while(opacity<1&&['#000000','#ffffff'].some(underlay=>colorContrast(text,mixColor(underlay,tint,opacity))<4.5)){
  opacity=Math.min(1,opacity+.02);
 }
 const backgrounds=['#000000','#ffffff'].map(underlay=>mixColor(underlay,tint,opacity));
 const rgba=(color,alpha)=>`rgba(${rgb(color).join(',')},${alpha.toFixed(3)})`;
 return {'--glass-surface':rgba(tint,opacity),'--glass-chrome':rgba(tint,Math.min(1,opacity+.02)),
  '--glass-solid':tint,'--glass-edge':mixColor(line,accent,dark?.27:.20),
  '--glass-highlight':rgba(accent,dark?.12:.08),
  '--glass-text':ensureContrast(text,readableText(tint),...backgrounds),
  '--glass-muted':ensureContrast(muted,text,...backgrounds),
  '--glass-accent-text':ensureContrast(accent,text,...backgrounds),
  '--glass-blur':low?'5px':'18px','--glass-toolbar-blur':low?'3px':'14px',
  '--glass-dialog-blur':low?'0px':'8px'};
}
function applyGlass(palette){
 const reduced=window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
 const mode=state.glassEffect==='normal'&&reduced?'low':state.glassEffect;
 document.body.dataset.glass=mode;
 const vars=glassPalette(palette,mode);
 for(const [key,value] of Object.entries(vars))document.body.style.setProperty(key,value);
 const input=$('#glass-effect');
 if(input)input.value=state.glassEffect;
}
state.appearanceMode=state.appearanceMode==='custom'?'custom':'preset';
state.customAppearance={accent:'#a9c4ff',background:'#000000',...state.customAppearance};
if(!validColor(state.customAppearance.accent)||!validColor(state.customAppearance.background))state.customAppearance={accent:'#a9c4ff',background:'#000000'};
let appearanceDraft=null;
function courseChevron(direction='right'){
 return `<svg class="row-chevron chevron-${direction}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>`;
}
$('#settings-page').innerHTML=`<div class="settings-layout"><section class="settings-intro"><span class="eyebrow">ТВОЁ ПРОСТРАНСТВО</span><h2>Настройки</h2><p>Пусть приложение выглядит по-твоему.</p></section><section class="settings-section"><div class="settings-section-title"><span class="settings-section-icon">${icon('people')}</span><div><h3>Учёба</h3><p>Группа запоминается между запусками</p></div></div><button class="settings-link" id="settings-group"><span>Моя группа</span><b id="settings-group-name"></b>${courseChevron()}</button></section><section class="settings-section"><div class="settings-section-title"><span class="settings-section-icon">◈</span><div><h3>Готовые темы</h3><p>Выбери шаблон одним касанием</p></div></div><div id="theme-options" class="preset-grid"></div></section><section class="settings-section custom-theme-section"><div class="settings-section-title"><span class="settings-section-icon">✦</span><div><h3>Своя тема</h3><p>Отдельно от готовых шаблонов</p></div></div><button class="settings-link custom-theme-entry" id="open-custom-theme"><span class="custom-color-pair"><i id="custom-bg-dot"></i><i id="custom-accent-dot"></i></span><span><b>Акцент и фон</b><small id="custom-mode-label"></small></span>${courseChevron()}</button><div id="custom-theme-editor" hidden><div class="custom-preview" id="custom-theme-preview"><div class="preview-header"><span>Твоя тема</span><i>●</i></div><div class="preview-lesson"><span>14:20<small>15:50</small></span><div><b>Следующая пара</b><p>Аудитория А-308</p></div></div><div class="preview-nav"><span>⌂</span><span class="preview-selected">▦</span><span>☑</span><span>⚙</span></div></div><div class="color-field"><span><b>Акцентный цвет</b><small>Кнопки, выбранный день и выделения</small></span><button type="button" class="color-swatch" id="custom-accent" aria-haspopup="dialog" aria-label="Выбрать цвет: акцентный цвет"></button><input type="text" id="custom-accent-hex" aria-label="Акцентный цвет HEX" maxlength="7" spellcheck="false"></div><div class="color-field"><span><b>Цвет фона</b><small>Основной фон приложения</small></span><button type="button" class="color-swatch" id="custom-background" aria-haspopup="dialog" aria-label="Выбрать цвет: цвет фона"></button><input type="text" id="custom-background-hex" aria-label="Цвет фона HEX" maxlength="7" spellcheck="false"></div><p class="color-hint" id="custom-color-hint">Яркие оттенки фона смягчаются. Предпросмотр показывает итоговые цвета.</p><div class="custom-editor-actions"><button id="cancel-custom-theme">Отмена</button><button class="primary" id="apply-custom-theme">Применить свою тему</button></div></div></section><section class="settings-section"><div class="settings-section-title"><span class="settings-section-icon">${icon('grid')}</span><div><h3>Главный экран</h3><p>Твои карточки и порядок</p></div></div><button class="settings-link" id="settings-edit-home"><span>Настроить карточки</span>${courseChevron()}</button><label class="setting-row"><span>Компактное расписание<small>Меньше отступов в карточках</small></span><input type="checkbox" id="compact"></label></section><section class="settings-about"><b>Орбита <span>2.1.0-beta7</span></b><p>Расписание демонстрационное.<br>Настройки и заметки хранятся на устройстве.</p></section></div>`;
const glassSettings=document.createElement('div');
glassSettings.className='appearance-glass-control';
glassSettings.innerHTML='<label class="setting-row"><span>Эффект стекла</span>'+
 '<select id="glass-effect"><option value="off">Выключено</option><option value="low">Слабое</option>'+
 '<option value="normal">Обычное</option></select></label>'+
 '<figure class="glass-preview"><figcaption>Предпросмотр стекла</figcaption><div class="glass-sample" aria-hidden="true"><i></i><i></i><span></span></div></figure>';
$('#theme-options').after(glassSettings);
$('#glass-effect').onchange=event=>{
 const previous=state.glassEffect;
 state.glassEffect=event.target.value;
 if(!save())state.glassEffect=previous;
 applyTheme();
};
window.matchMedia('(prefers-reduced-transparency: reduce)').addEventListener?.('change',()=>applyTheme());
function renderPresetChoices(){
 $('#theme-options').innerHTML=Object.entries(themes).map(([key,values])=>{
  const selected=state.appearanceMode==='preset'&&state.theme===key,accent=key==='dark'?'#a9c4ff':values[1],bg=key==='dark'?'#08090d':'#f5f5fa',panel=key==='dark'?'#1b1e27':'#ffffff';
  return `<button class="theme-option preset-option ${selected?'selected':''}" data-option="${key}" aria-pressed="${selected}"><span class="preset-thumbnail" style="--sample-accent:${accent};--sample-bg:${bg};--sample-panel:${panel}"><i></i><span></span><span></span><em></em></span><span class="preset-name">${values[0]}<b>${selected?'✓':''}</b></span></button>`;
 }).join('');
 $$('[data-option]').forEach(button=>button.onclick=()=>setTheme(button.dataset.option));
 $('#settings-group-name').textContent=state.group||'Выбрать группу';
 $('#custom-mode-label').textContent=state.appearanceMode==='custom'?'Используется сейчас':'Создать или изменить';
 $('#custom-bg-dot').style.background=state.customAppearance.background;
 $('#custom-accent-dot').style.background=state.customAppearance.accent;
 $('#open-custom-theme').setAttribute('aria-expanded',String(!!appearanceDraft));
}
const applyThemeBeforeAppearance=applyTheme;
applyTheme=function(){
 applyThemeBeforeAppearance();
 let palette;
 if(state.appearanceMode==='custom')palette=appearancePalette(state.customAppearance.accent,state.customAppearance.background);
 else palette=appearancePalette(document.documentElement.style.getPropertyValue('--accent')||themes[state.theme][1],state.theme==='dark'?'#000000':'#f4f5f9',false);
 const vars={'--accent':palette.accent,'--bg':palette.background,'--text':palette.text,'--panel':palette.panel,'--line':palette.line,'--muted':palette.muted,'--accent-soft':palette.soft,'--on-accent':palette.onAccent};
 for(const [key,value] of Object.entries(vars)){document.documentElement.style.setProperty(key,value);document.body.style.setProperty(key,value);}
 applyGlass(palette);
 document.body.classList.toggle('dark-theme',palette.dark);document.body.dataset.appearance=state.appearanceMode;
 document.documentElement.style.colorScheme=palette.dark?'dark':'light';
 document.querySelector('meta[name="theme-color"]').content=palette.background;
 const toggle=$('#theme-toggle');toggle.textContent=palette.dark?'☀':'☾';toggle.setAttribute('aria-label',palette.dark?'Включить светлую тему':'Включить тёмную тему');
 if(window.OrbitaAndroid&&window.OrbitaAndroid.appearance)window.OrbitaAndroid.appearance(palette.background,!palette.dark);
 renderPresetChoices();
 if(window.OrbitaAndroid?.launcherIcon)renderLauncherIcon();
};
setTheme=function(theme){
 if(!themes[theme])return;
 const previous={theme:state.theme,mode:state.appearanceMode};state.theme=theme;state.appearanceMode='preset';
 if(!save()){state.theme=previous.theme;state.appearanceMode=previous.mode;return}
 appearanceDraft=null;$('#custom-theme-editor').hidden=true;applyTheme();
};
function renderColorDraft(){
 if(!appearanceDraft)return;
 const palette=appearancePalette(appearanceDraft.accent,appearanceDraft.background),preview=$('#custom-theme-preview');
 for(const [key,value] of Object.entries({'--preview-bg':palette.background,'--preview-panel':palette.panel,'--preview-accent':palette.accent,'--preview-text':palette.text,'--preview-muted':palette.muted,'--preview-on-accent':palette.onAccent}))preview.style.setProperty(key,value);
 for(const key of ['accent','background']){$('#custom-'+key).style.setProperty('--swatch',appearanceDraft[key]);$('#custom-'+key+'-hex').value=appearanceDraft[key].toUpperCase();$('#custom-'+key+'-hex').removeAttribute('aria-invalid')}
 $('#apply-custom-theme').disabled=false;$('#custom-color-hint').textContent='Яркие оттенки фона смягчаются. Предпросмотр показывает итоговые цвета.';
}
function openCustomTheme(){
 appearanceDraft={...state.customAppearance};$('#custom-theme-editor').hidden=false;renderColorDraft();renderPresetChoices();
}
$('#open-custom-theme').onclick=()=>{if(appearanceDraft){appearanceDraft=null;$('#custom-theme-editor').hidden=true;renderPresetChoices()}else openCustomTheme()};
$('#cancel-custom-theme').onclick=()=>{appearanceDraft=null;$('#custom-theme-editor').hidden=true;renderPresetChoices()};
for(const key of ['accent','background']){
 $('#custom-'+key).onclick=()=>openColorPicker(key);
 $('#custom-'+key+'-hex').oninput=event=>{
  const value=event.target.value.trim();const normalized=value.startsWith('#')?value:'#'+value;
  if(!validColor(normalized)){event.target.setAttribute('aria-invalid','true');$('#apply-custom-theme').disabled=true;$('#custom-color-hint').textContent='Введи цвет в формате #A9C4FF.';return}
  appearanceDraft[key]=normalized.toLowerCase();renderColorDraft();
 };
}
const themeQuickColors={
 accent:['#a9c4ff','#b8a4ff','#7cdbb8','#ffb17c','#f39cc4','#f6d66e'],
 background:['#000000','#10141e','#20192b','#f4f5f9','#fff5e8','#e9f1ed']
};
function colorToHsl(hex){
 const [r,g,b]=rgb(hex).map(channel=>channel/255);
 const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
 const light=(max+min)/2;
 if(!delta)return [0,0,light*100];
 const hue=max===r?(g-b)/delta:max===g?2+(b-r)/delta:4+(r-g)/delta;
 return [(hue*60+360)%360,delta/(1-Math.abs(2*light-1))*100,light*100];
}
function hslToColor(hue,saturation,lightness){
 const s=saturation/100,l=lightness/100,a=s*Math.min(l,1-l);
 return '#'+[0,8,4].map(offset=>{
  const k=(offset+hue/30)%12;
  const channel=l-a*Math.max(-1,Math.min(k-3,9-k,1));
  return Math.round(channel*255).toString(16).padStart(2,'0');
 }).join('');
}
function openColorPicker(key){
 let selectedColor=appearanceDraft[key];
 const title=key==='accent'?'Акцентный цвет':'Цвет фона';
 const sliders=[['hue','Тон',360],['saturation','Насыщенность',100],['lightness','Яркость',100]];
 modal(`<h2>${title}</h2><div class="theme-picker">
  <div class="theme-picker-sample"><span></span><output></output></div>
  <div class="quick-colors theme-picker-presets" role="group" aria-label="Готовые цвета">
   ${themeQuickColors[key].map(color=>`<button type="button" style="--quick-color:${color}" data-picker-color="${color}" aria-label="Цвет ${color}"></button>`).join('')}
  </div>
  ${sliders.map(([id,label,max])=>`<label class="theme-picker-slider">${label}<input type="range" id="picker-${id}" min="0" max="${max}" step="any"></label>`).join('')}
  <div class="custom-editor-actions"><button type="button" id="picker-cancel">Отмена</button><button type="button" class="primary" id="picker-apply">Выбрать</button></div>
 </div>`);
 const picker=$('.theme-picker');
 const ranges=sliders.map(([id])=>$('#picker-'+id));
 function render(){
  const [h,s,l]=ranges.map(range=>Number(range.value));
  picker.style.setProperty('--picked-color',selectedColor);
  picker.style.setProperty('--picker-saturation',hslToColor(h,100,l));
  picker.style.setProperty('--picker-gray',hslToColor(h,0,l));
  picker.style.setProperty('--picker-mid',hslToColor(h,s,50));
  picker.querySelector('output').textContent=selectedColor.toUpperCase();
  for(const button of picker.querySelectorAll('[data-picker-color]')){
   button.setAttribute('aria-pressed',String(button.dataset.pickerColor===selectedColor));
  }
 }
 function selectColor(color){
  selectedColor=color;
  colorToHsl(color).forEach((value,index)=>{ranges[index].value=value});
  render();
 }
 for(const range of ranges)range.oninput=()=>{
  selectedColor=hslToColor(...ranges.map(input=>Number(input.value)));
  render();
 };
 for(const button of picker.querySelectorAll('[data-picker-color]'))button.onclick=()=>selectColor(button.dataset.pickerColor);
 $('#picker-cancel').onclick=()=>$('#modal').close();
 $('#picker-apply').onclick=()=>{
  if(appearanceDraft){appearanceDraft[key]=selectedColor;renderColorDraft()}
  $('#modal').close();
 };
 selectColor(selectedColor);
}
$('#apply-custom-theme').onclick=()=>{
 if(!appearanceDraft||!validColor(appearanceDraft.accent)||!validColor(appearanceDraft.background))return;
 const previous={mode:state.appearanceMode,colors:state.customAppearance};state.appearanceMode='custom';state.customAppearance={...appearanceDraft};
 if(!save()){state.appearanceMode=previous.mode;state.customAppearance=previous.colors;return}
 appearanceDraft=null;$('#custom-theme-editor').hidden=true;applyTheme();toast('Своя тема сохранена');
};
$('#settings-group').onclick=()=>$('#group-button').click();
const chooseGroupBeforeSettings=chooseGroup;chooseGroup=function(value){const ok=chooseGroupBeforeSettings(value);if(ok)$('#settings-group-name').textContent=state.group||'Выбрать группу';return ok};
$('#settings-edit-home').onclick=()=>{showPage('schedule');startHomeEdit();window.scrollTo({top:0,behavior:'smooth'})};
if (window.OrbitaAndroid?.pin) {
 const launcherWidgets = document.createElement('button');
 launcherWidgets.className='settings-link';
 launcherWidgets.id='launcher-widgets';
 launcherWidgets.innerHTML='<span>Виджеты рабочего стола</span>'+courseChevron();
 $('#settings-edit-home').after(launcherWidgets);
 launcherWidgets.onclick=()=>{
  const widgets=[
   ['tasks','Задачи','Все несданные работы'],
   ['deadlines','Дедлайны','Работы со сроком сдачи'],
   ['next','Ближайшая пара','Время, предмет и аудитория'],
   ['day','Расписание','Пары своей группы на сегодня']
  ];
  modal('<h2>Виджеты рабочего стола</h2>'+widgets.map(([kind,name,details])=>
   '<button class="official-result" data-launcher-widget="'+kind+'"><span>'+name+'</span><small>'+details+'</small></button>'
  ).join('')+'<p id="widget-pin-status" role="status"></p>');
  for(const button of $$('[data-launcher-widget]')) button.onclick=()=>{
   const supported=window.OrbitaAndroid.pin(button.dataset.launcherWidget);
   $('#widget-pin-status').textContent=supported
    ?'Подтверди добавление на рабочем столе.'
    :'Удерживай свободное место на рабочем столе, открой «Виджеты» и выбери «Орбита».';
  };
 };
}
$('#compact').onchange=event=>{state.compact=event.target.checked;save();applyTheme()};
const showPageBeforeSettings=showPage;showPage=function(p){
 if(p!=='settings'&&appearanceDraft){appearanceDraft=null;$('#custom-theme-editor').hidden=true;renderPresetChoices()}
 showPageBeforeSettings(p);
 if(p==='settings'){$('#page-title').textContent='Настройки';$('#page-subtitle').textContent='Оформление и личные предпочтения.';$('#crumb').textContent='Настройки'}
};
$('#theme-toggle').onclick=()=>setTheme(document.body.classList.contains('dark-theme')?'violet':'dark');
const launcherIcons={
 violet:['Лаванда','#5A46BB'],blue:['Небо','#2554A4'],green:['Мята','#246450'],
 rose:['Роза','#A43E68'],amber:['Янтарь','#925122'],dark:['Космос','#171C31']
};
function activeLauncherIcon(){
 if(!state.syncLauncherIcon)return Object.keys(launcherIcons).includes(state.launcherIcon)?state.launcherIcon:'violet';
 if(state.appearanceMode==='preset')return ({violet:"violet",blue:"blue",green:"green",pink:"rose",dark:"dark"})[state.theme]||"violet";
 const [hue,saturation,lightness]=colorToHsl(state.customAppearance.accent);
 if(saturation<12)return lightness<50?'dark':'violet';
 const hueDistance=(a,b)=>Math.abs((a-b+540)%360-180);
 return Object.entries(launcherIcons)
  .filter(([key])=>key!=='dark')
  .map(([key,[,color]])=>[key,hueDistance(hue,colorToHsl(color)[0])])
  .sort((a,b)=>a[1]-b[1])[0][0];
}
let appliedLauncherIcon;
function renderLauncherIcon(){
 const variant=activeLauncherIcon();
 $('#launcher-icon-sync').checked=!!state.syncLauncherIcon;
 for(const button of $$('[data-launcher-icon]')){
  button.disabled=!!state.syncLauncherIcon;
  button.setAttribute('aria-pressed',String(button.dataset.launcherIcon===variant));
 }
 if(appliedLauncherIcon===variant)return true;
 if(!window.OrbitaAndroid.launcherIcon(variant))return false;
 appliedLauncherIcon=variant;
 return true;
}
if(window.OrbitaAndroid?.launcherIcon){
 const section=document.createElement('section');
 section.className='settings-section launcher-icon-section';
 section.innerHTML=`<div class="settings-section-title"><span class="settings-section-icon">◈</span><div><h3>Иконка приложения</h3><p>На рабочем столе</p></div></div>
  <label class="setting-row"><span>Подбирать под тему<small>Цвет иконки меняется вместе с оформлением Орбиты</small></span><input type="checkbox" id="launcher-icon-sync"></label>
  <div class="launcher-icon-options" role="group" aria-label="Варианты иконки">
   ${Object.entries(launcherIcons).map(([key,[name,color]])=>`<button type="button" data-launcher-icon="${key}" style="--icon-bg:${color}" aria-pressed="false"><span class="launcher-icon-preview" aria-hidden="true"><i></i></span>${name}</button>`).join('')}
  </div>`;
 $('.custom-theme-section').after(section);
 function saveLauncherIcon(manual,sync){
  const previous={launcherIcon:state.launcherIcon,syncLauncherIcon:state.syncLauncherIcon};
  state.launcherIcon=manual;
  state.syncLauncherIcon=sync;
  if(!save())Object.assign(state,previous);
  if(!renderLauncherIcon())toast('Не удалось сменить иконку');
 }
 $('#launcher-icon-sync').onchange=event=>saveLauncherIcon(state.launcherIcon,event.target.checked);
 for(const button of $$('[data-launcher-icon]'))button.onclick=()=>saveLauncherIcon(button.dataset.launcherIcon,false);
}
const universityAccount=document.createElement('button');
universityAccount.type='button';
universityAccount.id='mirea-sign-in';
universityAccount.className='settings-link';
universityAccount.innerHTML='<span>Войти в МИРЭА<small>Учётная запись для баллов и посещений</small></span>'+courseChevron();
universityAccount.onclick=()=>openPulseGrades(true);
$('#settings-group').after(universityAccount);
if(window.OrbitaAndroid?.checkMireaServices){
 const services=document.createElement('button');
 services.type='button';
 services.className='settings-link';
 services.innerHTML='<span>Доступность сервисов МИРЭА<small>Состояние входа, SSO и Пульса</small></span>'+courseChevron();
 universityAccount.after(services);
 let lastCheck=0;
 services.onclick=()=>{
  modal('<h2>Сервисы МИРЭА</h2><div id="mirea-service-results" role="status">Проверяем соединение…</div>');
  window.OrbitaAndroid.checkMireaServices(++lastCheck);
 };
 window.orbitaMireaServices=(id,sso,pulse,session)=>{
  const results=$('#mirea-service-results');
  if(id!==lastCheck||!results||!$('#modal').open)return;
  const describe=status=>{
   if(!status)return 'Нет ответа';
   if(status>=200&&status<400)return 'Отвечает';
   return 'Ответ '+status;
  };
  const sessionText={active:'Активна',login:'Требуется вход',expired:'Истекла',unknown:'Не удалось проверить'};
  results.innerHTML='<p><b>Вход МИРЭА (SSO)</b> · '+describe(sso)+'</p><p><b>Пульс</b> · '+describe(pulse)+'</p><p><b>Личная сессия</b> · '+sessionText[session]+'</p>';
 };
}

const attendanceScannerIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M6 12h12"/></svg>';
function openAttendanceScanner(){
 window.OrbitaAndroid?.openAttendanceScanner(document.documentElement.style.getPropertyValue('--bg').trim());
}
if(window.OrbitaAndroid?.openAttendanceScanner){
 const scannerButton=document.createElement('button');
 scannerButton.type='button';
 scannerButton.className='attendance-nav-button';
 scannerButton.setAttribute('aria-label','Сканировать QR посещения');
 scannerButton.innerHTML=attendanceScannerIcon;
 scannerButton.onclick=openAttendanceScanner;
 const campusButton=$('.mobile-nav [data-ref-page="campus"]');
 campusButton.before(scannerButton);
 const scannerSetting=document.createElement('label');
 scannerSetting.className='setting-row';
 scannerSetting.innerHTML='<span>Сканер в нижнем меню<small>Быстрый доступ к QR посещения</small></span><input type="checkbox" id="attendance-scanner-dock">';
 universityAccount.after(scannerSetting);
 const scannerToggle=scannerSetting.querySelector('input');
 scannerToggle.checked=state.attendanceScannerDock===true;
 const paintScannerDock=()=>{
  scannerButton.hidden=!scannerToggle.checked;
  campusButton.hidden=scannerToggle.checked;
 };
 paintScannerDock();
 scannerToggle.onchange=()=>{
  const previous=state.attendanceScannerDock;
  state.attendanceScannerDock=scannerToggle.checked;
  if(!save()){state.attendanceScannerDock=previous;scannerToggle.checked=previous===true}
  paintScannerDock();
 };
}
applyTheme();save();
