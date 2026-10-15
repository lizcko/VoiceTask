export type RecognitionLike = {
  lang:string; continuous:boolean; interimResults:boolean;
  onstart:(()=>void)|null; onend:(()=>void)|null;
  onerror:((event:{error:string})=>void)|null;
  onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}> & {isFinal:boolean}>})=>void)|null;
  start:()=>void; stop:()=>void; abort:()=>void;
};
export type SpeechWindow = { SpeechRecognition?:new()=>RecognitionLike; webkitSpeechRecognition?:new()=>RecognitionLike };
export function recognitionError(code:string) {
  return code==='not-allowed'||code==='service-not-allowed'?'Доступ к микрофону запрещён. Разрешите микрофон в настройках сайта браузера, затем нажмите кнопку ещё раз.':code==='no-speech'?'Речь не распознана. Повторите запись или введите текст.':code==='audio-capture'?'Микрофон не найден или занят другим приложением.':code==='network'?'Сервис распознавания недоступен. Проверьте сеть или используйте текст.':code==='aborted'?'Запись отменена.':'Не удалось распознать речь. Повторите запись или используйте текст.';
}
export function startRecognition(host:SpeechWindow,onText:(s:string)=>void,onState:(active:boolean)=>void,onError:(s:string)=>void) {
  const Constructor=host.SpeechRecognition||host.webkitSpeechRecognition;
  if(!Constructor){onError('Браузер не поддерживает голосовой ввод. Используйте текстовый режим.');return null;}
  const r=new Constructor();let cancelled=false,received=false,failed=false;
  r.lang='ru-RU';r.continuous=false;r.interimResults=false;
  r.onstart=()=>{if(!cancelled)onState(true);};
  r.onresult=e=>{if(cancelled)return;const transcript=Array.from(e.results).filter(result=>result.isFinal).map(result=>result[0].transcript).join(' ').trim();if(transcript){received=true;onText(transcript);}};
  r.onerror=e=>{if(!cancelled){failed=true;onError(recognitionError(e.error));}onState(false);};
  r.onend=()=>{onState(false);if(!cancelled&&!failed&&!received)onError(recognitionError('no-speech'));};
  try{onState(true);r.start();}catch{onState(false);onError('Не удалось включить микрофон. Проверьте разрешения браузера.');return null;}
  return {stop:()=>{try{r.stop();}catch{onState(false);}},cancel:()=>{cancelled=true;r.abort();onState(false);}};
}
export function speakRussian(text:string,synth:SpeechSynthesis|undefined,makeUtterance:(s:string)=>SpeechSynthesisUtterance,onState:(active:boolean)=>void,onError:(s:string)=>void) {
  if(!synth){onError('Озвучивание недоступно в этом браузере. Ответ остаётся в чате.');return;}
  synth.cancel();
  const voice=synth.getVoices().find(v=>/^ru(?:-|_)/i.test(v.lang)||v.lang==='ru');
  if(!voice){onError('Русский голос не найден. Установите русский голос в системе или используйте текстовый режим.');return;}
  const utterance=makeUtterance(text.slice(0,4000));utterance.lang='ru-RU';utterance.voice=voice;
  utterance.onstart=()=>onState(true);utterance.onend=()=>onState(false);
  utterance.onerror=e=>{onState(false);if(e.error!=='canceled'&&e.error!=='interrupted')onError('Не удалось озвучить ответ. Текст сохранён в чате.');};
  try{synth.speak(utterance);}catch{onState(false);onError('Не удалось озвучить ответ. Текст сохранён в чате.');}
}
