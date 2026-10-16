import test from 'node:test';
import assert from 'node:assert/strict';
import { startRecognition, speakRussian } from '../.tools/test-build/speech.js';
test('recognition: ru, explicit start/stop, preview, denial and cancel',()=>{
  let instance,text='',state=false,error='';
  class Recognition {constructor(){instance=this;}start(){this.started=true;this.onstart();}stop(){this.stopped=true;}abort(){this.onend();}}
  const r=startRecognition({SpeechRecognition:Recognition},s=>text=s,s=>state=s,s=>error=s);assert.equal(instance.lang,'ru-RU');assert.equal(instance.continuous,true);assert.equal(instance.interimResults,true);assert.ok(state);
  instance.onresult({results:[Object.assign([{transcript:'Создай задачу'}],{isFinal:true})]});assert.equal(text,'Создай задачу');r.stop();assert.ok(instance.stopped);
  instance.onerror({error:'not-allowed'});assert.match(error,/настройках сайта/);assert.equal(state,false);r.cancel();text='';instance.onresult({results:[Object.assign([{transcript:'Поздний ответ'}],{isFinal:true})]});assert.equal(text,'');
});
test('unsupported and repeated empty sessions have clear errors',async()=>{
  let error='';assert.equal(startRecognition({},()=>{},()=>{},s=>error=s),null);assert.match(error,/не поддерживает/);
  let r;class Recognition{constructor(){r=this;}start(){}abort(){}stop(){}}
  const recorder=startRecognition({webkitSpeechRecognition:Recognition},()=>{},()=>{},s=>error=s);
  for(let i=0;i<3;i++){r.onend();await new Promise(resolve=>setTimeout(resolve,320));}
  assert.match(error,/не распознана/);recorder.cancel();
});
test('interim revisions, pause restart and final stop retain one accumulated message',async()=>{
  let r,text='',starts=0;
  class Recognition{constructor(){r=this;}start(){starts++;this.onstart();}abort(){this.onend();}stop(){this.onresult({results:[Object.assign([{transcript:'вторая фраза'}],{isFinal:true})]});this.onend();}}
  const recorder=startRecognition({SpeechRecognition:Recognition},s=>text=s,()=>{},()=>{});
  const emit=(words,final=false)=>r.onresult({results:[Object.assign([{transcript:words}],{isFinal:final})]});
  emit('первая');emit('первая фраза');emit('первая фраза',true);emit('первая фраза',true);
  assert.equal(text,'первая фраза');r.onend();await new Promise(resolve=>setTimeout(resolve,320));assert.equal(starts,2);
  emit('вторая');assert.equal(text,'первая фраза вторая');
  assert.equal(await recorder.stop(),'первая фраза вторая фраза');
  await new Promise(resolve=>setTimeout(resolve,320));assert.equal(starts,2);
});
test('network errors stop restarting and retain draft',async()=>{
  let r,text='',error='',starts=0;
  class Recognition{constructor(){r=this;}start(){starts++;}abort(){}stop(){this.onend();}}
  const recorder=startRecognition({SpeechRecognition:Recognition},s=>text=s,()=>{},s=>error=s);
  r.onresult({results:[Object.assign([{transcript:'сохранить текст'}],{isFinal:true})]});r.onerror({error:'network'});r.onend();
  await new Promise(resolve=>setTimeout(resolve,320));assert.equal(starts,1);assert.equal(text,'сохранить текст');assert.match(error,/недоступен/);recorder.cancel();
});
test('synthesis uses Russian voice, cancels prior speech and retains text on errors',()=>{
  let error='',cancelled=0,spoken,active=false;
  const synth={cancel(){cancelled++;},getVoices(){return [{lang:'en-US'},{lang:'ru-RU'}];},speak(u){spoken=u;u.onstart();}};
  speakRussian('Текст',synth,s=>({text:s}),s=>active=s,s=>error=s);assert.equal(cancelled,1);assert.equal(spoken.lang,'ru-RU');assert.ok(active);spoken.onerror({error:'synthesis-failed'});assert.equal(active,false);assert.match(error,/Текст сохранён/);
  synth.getVoices=()=>[];speakRussian('Текст',synth,s=>({text:s}),()=>{},s=>error=s);assert.match(error,/Русский голос не найден/);
});
