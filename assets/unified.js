// One surface and motion system across the app; the actual Android status icons remain native.
document.body.classList.add('unified-ui');
const statusGlass=document.createElement('div');statusGlass.className='status-glass';statusGlass.setAttribute('aria-hidden','true');document.body.appendChild(statusGlass);
const bottomGlass=document.createElement('div');bottomGlass.className='bottom-glass';bottomGlass.setAttribute('aria-hidden','true');document.body.appendChild(bottomGlass);
window.orbitaSetInsets=function(values){
 const number=key=>Math.max(0,Math.min(1000,Number(values?.[key])||0));
 document.documentElement.style.setProperty('--system-top',number('top')+'px');
 document.documentElement.style.setProperty('--system-bottom',number('bottom')+'px');
 document.documentElement.style.setProperty('--keyboard-inset',number('keyboard')+'px');
 document.body.classList.toggle('keyboard-open',number('keyboard')>120);
};
try{if(window.OrbitaAndroid?.insets)window.orbitaSetInsets(JSON.parse(window.OrbitaAndroid.insets()));else if(window.orbitaInsets)window.orbitaSetInsets(window.orbitaInsets)}catch{}
function updateChromeGlass(){
 const progress=Math.min(1,Math.max(0,window.scrollY/48));
 document.documentElement.style.setProperty('--chrome-progress',progress.toFixed(3));
 document.documentElement.style.setProperty('--chrome-tint',(.07+progress*.28).toFixed(3));
 document.body.classList.toggle('scrolled',progress>.05);
}
let glassFrame=false;
window.addEventListener('scroll',()=>{if(!glassFrame){glassFrame=true;(window.requestAnimationFrame||setTimeout)(()=>{glassFrame=false;updateChromeGlass()})}},{passive:true});
updateChromeGlass();
const applyThemeBeforeUnified=applyTheme;
applyTheme=function(){
 applyThemeBeforeUnified();
 const bg=document.documentElement.style.getPropertyValue('--bg').trim();
 if(validColor(bg))document.documentElement.style.setProperty('--glass-rgb',rgb(bg).join(', '));
 const accent=document.documentElement.style.getPropertyValue('--accent').trim();
 if(validColor(accent))document.documentElement.style.setProperty('--accent-rgb',rgb(accent).join(', '));
};
// Dialog headings share the tinted calendar header, while inputs retain their original IDs/handlers.
const modalBeforeUnified=modal;
modal=function(html){
 modalBeforeUnified(html);
 const content=$('#modal-content'),heading=content.querySelector(':scope > h2');
 if(!heading)return;
 const header=document.createElement('div');header.className='unified-dialog-heading';
 const eyebrow=content.querySelector(':scope > .eyebrow');if(eyebrow)header.appendChild(eyebrow);header.appendChild(heading);
 const body=document.createElement('div');body.className='unified-dialog-body';
 while(content.firstChild)body.appendChild(content.firstChild);
 content.append(header,body);
};
applyTheme();
