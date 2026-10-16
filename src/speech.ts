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
  const r=new Constructor();
  let active=true, cancelled=false, running=false, prefix='', current='', final='', emptyEnds=0;
  let restart:ReturnType<typeof setTimeout>|undefined, timeout:ReturnType<typeof setTimeout>|undefined;
  let resolveStop:((text:string)=>void)|undefined;
  let attempts:number[]=[];
  const join=(a:string,b:string)=>[a,b].filter(Boolean).join(' ').trim();
  const finish=()=>{if(timeout)clearTimeout(timeout);onState(false);resolveStop?.(join(prefix,current));resolveStop=undefined;};
  const launch=()=>{
    if(!active||cancelled||running)return;
    attempts=attempts.filter(time=>Date.now()-time<10000);
    if(attempts.length>=10){active=false;onError('Распознавание слишком часто прерывается. Текст сохранён. Включите микрофон снова или используйте текстовый ввод.');finish();return;}
    attempts.push(Date.now());running=true;current='';final='';
    try{r.start();}catch{running=false;active=false;onError('Не удалось включить микрофон. Проверьте разрешения браузера.');finish();}
  };
  r.lang='ru-RU';r.continuous=true;r.interimResults=true;
  r.onstart=()=>{if(!cancelled)onState(true);};
  r.onresult=e=>{
    if(cancelled)return;
    const results=Array.from(e.results);
    final=results.filter(result=>result.isFinal).map(result=>result[0].transcript.trim()).filter(Boolean).join(' ');
    const interim=results.filter(result=>!result.isFinal).map(result=>result[0].transcript.trim()).filter(Boolean).join(' ');
    current=join(final,interim);onText(join(prefix,current));
  };
  r.onerror=e=>{
    if(cancelled)return;
    if(e.error==='no-speech')return; // onend performs the bounded restart.
    active=false;onError(recognitionError(e.error));finish();
  };
  r.onend=()=>{
    running=false;
    if(cancelled)return;
    if(!active){finish();return;}
    emptyEnds=current?0:emptyEnds+1;
    prefix=join(prefix,current);current='';final='';
    if(emptyEnds>=3){active=false;onError(recognitionError('no-speech'));finish();return;}
    restart=setTimeout(launch,300);
  };
  onState(true);launch();
  return {
    stop:()=>new Promise<string>(resolve=>{
      active=false;if(restart)clearTimeout(restart);resolveStop=resolve;
      if(!running){finish();return;}
      // Browsers may deliver a final result between stop() and onend.
      timeout=setTimeout(()=>{cancelled=true;try{r.abort();}catch{/* already ended */}finish();},700);
      try{r.stop();}catch{finish();}
    }),
    cancel:()=>{active=false;cancelled=true;if(restart)clearTimeout(restart);try{r.abort();}catch{/* already ended */}finish();}
  };
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
