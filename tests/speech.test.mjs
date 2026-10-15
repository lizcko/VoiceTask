import test from 'node:test';
import assert from 'node:assert/strict';
import { startRecognition, speakRussian } from '../.tools/test-build/speech.js';
test('recognition: ru, explicit start/stop, preview, denial and cancel',()=>{
  let instance,text='',state=false,error='';
  class Recognition {constructor(){instance=this;}start(){this.started=true;this.onstart();}stop(){this.stopped=true;}abort(){this.onend();}}
  const r=startRecognition({SpeechRecognition:Recognition},s=>text=s,s=>state=s,s=>error=s);assert.equal(instance.lang,'ru-RU');assert.equal(instance.continuous,false);assert.ok(state);
  instance.onresult({results:[Object.assign([{transcript:'Создай задачу'}],{isFinal:true})]});assert.equal(text,'Создай задачу');r.stop();assert.ok(instance.stopped);
  instance.onerror({error:'not-allowed'});assert.match(error,/настройках сайта/);assert.equal(state,false);r.cancel();text='';instance.onresult({results:[Object.assign([{transcript:'Поздний ответ'}],{isFinal:true})]});assert.equal(text,'');
});
test('unsupported and silent recognition have clear errors',()=>{
  let error='';assert.equal(startRecognition({},()=>{},()=>{},s=>error=s),null);assert.match(error,/не поддерживает/);
  let r;class Recognition{constructor(){r=this;}start(){}abort(){}stop(){}}
  startRecognition({webkitSpeechRecognition:Recognition},()=>{},()=>{},s=>error=s);r.onend();assert.match(error,/не распознана/);
});
test('synthesis uses Russian voice, cancels prior speech and retains text on errors',()=>{
  let error='',cancelled=0,spoken,active=false;
  const synth={cancel(){cancelled++;},getVoices(){return [{lang:'en-US'},{lang:'ru-RU'}];},speak(u){spoken=u;u.onstart();}};
  speakRussian('Текст',synth,s=>({text:s}),s=>active=s,s=>error=s);assert.equal(cancelled,1);assert.equal(spoken.lang,'ru-RU');assert.ok(active);spoken.onerror({error:'synthesis-failed'});assert.equal(active,false);assert.match(error,/Текст сохранён/);
  synth.getVoices=()=>[];speakRussian('Текст',synth,s=>({text:s}),()=>{},s=>error=s);assert.match(error,/Русский голос не найден/);
});
