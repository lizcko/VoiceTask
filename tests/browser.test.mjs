import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const port=9225;
await mkdir('.tools/browser-v2',{recursive:true});
const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=${resolve('.tools/browser-v2-'+Date.now())}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try {
  let target;for(let i=0;i<40;i++){try{target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();break;}catch{await delay(250);}}
  assert.ok(target,'Chrome started');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  let id=0;const waiting=new Map(),errors=[];
  ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=waiting.get(m.id);waiting.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
  const command=(method,params={})=>new Promise((resolve,reject)=>{const i=++id;waiting.set(i,{resolve,reject});ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const click=async selector=>{assert.ok(await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.click();return true;})()`),selector);await delay(160);};
  const text=async text=>{assert.ok(await ev(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)return false;e.click();return true;})()`),text);await delay(160);};
  const fill=async (selector,value)=>{assert.ok(await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));return true;})()`),selector);await delay(220);};
  const label=async (name,value)=>{
    const groups={'Тема':'theme','Размер текста':'text','Подробность карточек':'density','Режим при следующем открытии':'defaultPeriod'};
    if(groups[name]&&await ev(`!!document.querySelector('[data-setting="${groups[name]}"]')`)){await click(`[data-setting="${groups[name]}"] input[value="${value}"]`);return;}
    const selector=await ev(`(()=>{const e=[...document.querySelectorAll('.modal label')].find(e=>e.firstChild?.textContent.trim()===${JSON.stringify(name)})?.querySelector('input,select,textarea');if(!e)throw Error('Missing field '+${JSON.stringify(name)});e.id='test-field';return '#test-field';})()`);await fill(selector,value);await ev(`document.querySelector('#test-field').removeAttribute('id')`);
  };
  const check=async (name)=>{await ev(`(()=>{const e=[...document.querySelectorAll('.modal input[type=checkbox]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(name)}||e.closest('label')?.textContent.trim()===${JSON.stringify(name)});if(!e)throw Error('Missing checkbox');e.click();})()`);await delay(150);};
  const stored=()=>ev(`JSON.parse(localStorage.getItem('voicetask.entries.v1'))`);
  const close=()=>click('[aria-label="Закрыть"]');
  const captureModal=async(name)=>{const clip=await ev(`(()=>{const r=document.querySelector('.modal').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()`);await writeFile(`.tools/${name}.png`,Buffer.from((await command('Page.captureScreenshot',{format:'png',clip})).data,'base64'));};
  const reload=async()=>{await command('Page.reload');await delay(650);};
  await command('Runtime.enable');await command('Page.enable');
  const fixture=[{id:'legacy',title:'Старая запись',type:'task',date:new Date(Date.now()-86400000).toISOString().slice(0,10),time:'23:00',duration:180,color:'#123abc',important:true,description:'Совместимость комментария',completed:false},{id:'unknown',newFormat:true}];
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`if(!sessionStorage.getItem('v2-test-init')){localStorage.setItem('voicetask.entries.v1',${JSON.stringify(JSON.stringify(fixture))});localStorage.setItem('voicetask.preferences.v2',JSON.stringify({zone:'Europe/Moscow',enabled:false}));localStorage.setItem('voicetask.chat.v1',JSON.stringify([{role:'assistant',text:'Старая история чата'}]));sessionStorage.setItem('v2-test-init','yes');}`});
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:process.env.VOICETASK_URL||'http://127.0.0.1:4173/VoiceTask/'});await delay(800);
  assert.equal(await ev(`document.querySelector('h1').textContent`),'Ваш календарь.');
  assert.equal(await ev(`document.querySelectorAll('.day-header').length`),7);
  assert.ok(await ev(`document.querySelector('.messages').textContent.includes('Старая история чата')`));
  assert.ok(await ev(`document.documentElement.scrollWidth<=innerWidth`));
  // Global search, legacy comments, keyboard navigation, details and one modal.
  await fill('[aria-label="Поиск записей"]','СОВМЕСТИМОСТЬ');
  assert.equal(await ev(`document.querySelectorAll('[role=option]').length`),1);
  await ev(`(()=>{const e=document.querySelector('[role=combobox]');e.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));})()`);await delay(80);
  await ev(`document.querySelector('[role=combobox]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);await delay(200);
  assert.equal(await ev(`document.querySelectorAll('[role=dialog]').length`),1);
  assert.ok(await ev(`document.querySelector('.modal').textContent.includes('Совместимость комментария')`));await close();
  await fill('[aria-label="Поиск записей"]','нет совпадений');assert.ok(await ev(`document.querySelector('.search-results').textContent.includes('Ничего не найдено')`));
  await ev(`document.querySelector('[role=combobox]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await delay(100);assert.equal(await ev(`!!document.querySelector('.search-results')`),false);await click('[aria-label="Очистить поиск"]');
  // Create a multiday task, custom color, importance and comment.
  await text('Создать запись');await label('Название','Многодневная проверка');await label('Дата начала','2026-12-31');await label('Время начала','23:00');await label('Дата окончания','2027-01-02');await label('Время окончания','02:00');await label('Комментарий','Полный комментарий\nВторая строка');await fill('[aria-label="Свой цвет"]','#3579ab');await check('Важная запись');await text('Сохранить');
  let entries=await stored();const task=entries.find(e=>e.title==='Многодневная проверка');assert.ok(task.startAt&&task.endAt);assert.equal(task.duration,1620);assert.equal(task.color,'#3579ab');assert.ok(task.important);assert.deepEqual(entries.find(e=>e.id==='unknown'),fixture[1]);assert.equal(await ev(`localStorage.getItem('voicetask.entries.backup.v1')`),JSON.stringify(fixture));
  await text('Редактировать');await label('Способ задания окончания','duration');assert.equal(await ev(`document.querySelector('input[type=number]').value`),'27');await label('Часы',48);await label('Минуты',0);await text('Сохранить');assert.equal((await stored()).find(e=>e.id===task.id).duration,2880);await close();
  await fill('[aria-label="Поиск записей"]','Многодневная');await click('[role=option]');await close();await click('[aria-label="Очистить поиск"]');
  await fill('[aria-label="Режим календаря"]','День');assert.equal(await ev(`document.querySelectorAll('.day-header').length`),1);assert.ok(await ev(`document.querySelector('.event-card').textContent.includes('Многодневная')`));
  await click('.completion');assert.equal((await stored()).find(e=>e.id===task.id).completed,true);await click('.completion');assert.equal((await stored()).find(e=>e.id===task.id).completed,false);
  await fill('[aria-label="Категория записей"]','Встречи');assert.equal(await ev(`document.querySelectorAll('.event-card').length`),0);await fill('[aria-label="Категория записей"]','Все');
  await click('[aria-label="Следующий период"]');assert.ok(await ev(`document.querySelector('.event-card').textContent.includes('Многодневная')`));await click('.day-header');assert.ok(await ev(`document.querySelector('.day-list').textContent.includes('Вторая строка')`));await click('.day-entry-title');assert.equal(await ev(`document.querySelectorAll('[role=dialog]').length`),1);await close();
  await fill('[aria-label="Режим календаря"]','Месяц');assert.equal(await ev(`document.querySelectorAll('.month-cell').length`),42);
  await fill('[aria-label="Режим календаря"]','Год');assert.equal(await ev(`document.querySelectorAll('.mini-month').length`),12);assert.ok(await ev(`document.querySelectorAll('.event-dots i').length>=2`));
  await click('.event-dots i'); // bubbled to date opens day
  assert.ok(await ev(`!!document.querySelector('.day-list')`));await close();
  await fill('[aria-label="Режим календаря"]','День');
  // Appearance applies immediately and survives reload.
  await click('[aria-label="Настройки"]');assert.equal(await ev(`document.querySelectorAll('.settings-layout nav button').length`),3);await captureModal('settings-appearance');
  assert.ok(await ev(`(()=>{const e=document.querySelector('.settings-content');return e.scrollWidth<=e.clientWidth+1;})()`),'settings have no horizontal overflow');
  await ev(`document.querySelector('[data-setting=theme] input[value=light]').focus()`);
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await delay(100);assert.equal(await ev(`document.documentElement.dataset.theme`),'dark','theme cards work with keyboard');
  await fill('[aria-label="Свой основной цвет"]','#267ac1');assert.equal(await ev(`document.documentElement.style.getPropertyValue('--accent')`),'#267ac1');await click('[aria-label="Акцент #7850ec"]');assert.equal(await ev(`JSON.parse(localStorage.getItem('voicetask.preferences.v2')).accent`),'#7850ec');
  await label('Тема','dark');assert.equal(await ev(`document.documentElement.dataset.theme`),'dark');await label('Размер текста','large');assert.equal(await ev(`document.documentElement.dataset.text`),'large');await label('Подробность карточек','brief');assert.ok(await ev(`!!document.querySelector('.card-comment.brief')`));await label('Подробность карточек','standard');assert.equal(await ev(`document.querySelectorAll('.card-comment').length`),0);await label('Подробность карточек','full');assert.ok(await ev(`!!document.querySelector('.card-comment.full')`));await text('Календарь');await label('Формат даты','YYYY-MM-DD');await label('Режим при следующем открытии','Месяц');await label('Часовой пояс','Asia/Tokyo');await check('Показывать номера недель');await close();
  await reload();assert.equal(await ev(`document.documentElement.dataset.theme`),'dark');assert.equal(await ev(`document.querySelector('[aria-label="Режим календаря"]').value`),'Месяц');assert.ok((await stored()).some(e=>e.id===task.id));assert.equal((await stored()).find(e=>e.id==='legacy').date,fixture[0].date);
  await click('[aria-label="Настройки"]');await text('Календарь');await label('Начало дня',8);await label('Конец дня',22);await fill('[aria-label="Цвет задач"]','#e4c5f2');await fill('[aria-label="Цвет встреч"]','#c5def2');
  assert.ok(await ev(`document.querySelector('.calendar-additional').getBoundingClientRect().top-document.querySelector('.calendar-color-row').getBoundingClientRect().bottom<=16`),'no large gap after record colors');await close();assert.equal((await stored()).find(e=>e.id===task.id).color,'#3579ab','individual color has priority');await fill('[aria-label="Режим календаря"]','День');assert.equal(await ev(`document.querySelectorAll('.hour-slot').length`),14);await fill('[aria-label="Режим календаря"]','Месяц');
  // Meeting creation, deletion and validation.
  await text('Создать запись');await text('Сохранить');assert.ok(await ev(`!!document.querySelector('.field-error')`));await label('Название','Встреча для удаления');await label('Тип','meeting');await text('Сохранить');assert.equal((await stored()).find(e=>e.title==='Встреча для удаления').type,'meeting');await text('Редактировать');await text('Удалить');assert.ok(!(await stored()).some(e=>e.title==='Встреча для удаления'));
  // Profile menu and name persist.
  await click('.profile-button');await text('Мой профиль');await label('Отображаемое имя','Тестовый профиль');await captureModal('profile-dark');await close();await reload();assert.ok(await ev(`document.querySelector('.profile-button').textContent.includes('Тестовый профиль')`));
  await click('.profile-button');await text('Мой профиль');
  await ev(`(()=>{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;canvas.getContext('2d').fillRect(0,0,512,256);const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));const d=new DataTransfer();d.items.add(new File([bytes],'avatar.png',{type:'image/png'}));const input=document.querySelector('input[type=file]');input.files=d.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(400);
  assert.ok(await ev(`localStorage.getItem('voicetask.avatar')?.startsWith('data:image/png')`));await close();await reload();assert.ok(await ev(`!!document.querySelector('.profile-button img')`));assert.equal(await ev(`document.querySelector('.profile-button img').naturalWidth`),256);
  await click('.profile-button');await text('Мой профиль');await text('Удалить изображение');assert.equal(await ev(`localStorage.getItem('voicetask.avatar')`),null);
  await ev(`(()=>{const d=new DataTransfer();d.items.add(new File(['bad'],'bad.txt',{type:'text/plain'}));const input=document.querySelector('input[type=file]');input.files=d.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(100);assert.ok(await ev(`document.querySelector('.toast').textContent.includes('JPG')`));await close();
  // System theme follows live media changes.
  await click('[aria-label="Настройки"]');await label('Тема','system');await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});await delay(100);assert.equal(await ev(`document.documentElement.dataset.theme`),'light');await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});await delay(100);assert.equal(await ev(`document.documentElement.dataset.theme`),'dark');await close();
  // Chat creates actual saved records and persists history.
  await fill('[aria-label="Сообщение ассистенту"]','встреча Из чата; 2027-02-01; 23:00; 2880');await click('[aria-label="Отправить сообщение"]');assert.ok((await stored()).some(e=>e.title==='Из чата'&&e.duration===2880));await reload();assert.ok(await ev(`document.querySelector('.messages').textContent.includes('Из чата')`));
  // Enable reminders: overdue one-time record persists; bell contains no CRUD messages.
  await click('[aria-label="Настройки"]');await text('Уведомления');await check('Включить уведомления');await close();await click('[aria-label="Уведомления"]');assert.ok(await ev(`document.querySelector('.notification-popover').textContent.includes('Просроченная задача')`));assert.ok(await ev(`!document.querySelector('.notification-popover').textContent.includes('Запись сохранена')`));await reload();await click('[aria-label="Уведомления"]');assert.ok(await ev(`document.querySelector('.notification-popover').textContent.includes('Новых напоминаний нет')`));await click('[aria-label="Уведомления"]');
  const futureWall=await ev(`new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(Date.now()+600000)).split(' ')`);
  await fill('[aria-label="Сообщение ассистенту"]',`задача Будущее напоминание; ${futureWall[0]}; ${futureWall[1]}; 60`);await click('[aria-label="Отправить сообщение"]');await click('[aria-label="Уведомления"]');assert.ok(await ev(`document.querySelector('.notification-popover').textContent.includes('Скоро задача: Будущее напоминание')`));await reload();await click('[aria-label="Уведомления"]');assert.ok(await ev(`document.querySelector('.notification-popover').textContent.includes('Будущее напоминание')`));await click('[aria-label="Уведомления"]');
  // Screenshot desktop, then mobile without page overflow.
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await delay(100);await writeFile('.tools/desktop-v2.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(200);assert.ok(await ev(`document.documentElement.scrollWidth<=innerWidth`),'mobile has no horizontal page overflow');await writeFile('.tools/mobile-v2.png',Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  // Failed storage must not produce a successful chat reply or overwrite data.
  const beforeFailure=await stored();await ev(`window.savedSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='voicetask.entries.v1')throw new DOMException('Quota exceeded','QuotaExceededError');return window.savedSetItem.call(this,k,v);}`);
  await fill('[aria-label="Сообщение ассистенту"]','задача Не сохранится; сегодня; 12:00');await click('[aria-label="Отправить сообщение"]');assert.deepEqual(await stored(),beforeFailure);assert.ok(await ev(`document.querySelector('.messages').lastElementChild.previousElementSibling.textContent.includes('не сохранена')`));await ev(`Storage.prototype.setItem=window.savedSetItem`);
  await ev(`localStorage.setItem('voicetask.entries.v1','broken-json')`);await reload();assert.equal(await ev(`localStorage.getItem('voicetask.entries.v1')`),'broken-json');assert.ok(await ev(`document.querySelector('.error').textContent.includes('Исходные данные сохранены')`));
  await ev(`localStorage.setItem('voicetask.entries.v1',${JSON.stringify(JSON.stringify(beforeFailure))})`);
  assert.deepEqual(errors,[],'no runtime errors');console.log('Browser checks passed: 4 calendar modes, task/meeting CRUD, validation, custom color, multiday segments, completion toggle, global search/comments/keyboard/Escape, day/detail dialogs, year dots, filters, settings/date format/timezone/theme/text/density/reload, profile name, chat persistence, legacy backup/unknown record, overdue once and bell, desktop/mobile overflow.');
  await command('Browser.close');
} finally {ws?.close();chrome.kill();}
