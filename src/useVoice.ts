import { useEffect, useRef, useState } from 'react';
import { SpeechWindow, speakRussian, startRecognition } from './speech';
export function useVoice(setInput:(s:string)=>void) {
  const [listening,setListening]=useState(false),[speaking,setSpeaking]=useState(false),[error,setError]=useState('');
  const [enabled,setEnabled]=useState(()=>{try{return localStorage.getItem('voicetask.voice.v1')==='true';}catch{return false;}});
  const recorder=useRef<ReturnType<typeof startRecognition>>(null);
  const generation=useRef(0);
  const stopSpeaking=()=>{window.speechSynthesis?.cancel();setSpeaking(false);};
  const cancel=()=>{generation.current++;recorder.current?.cancel();recorder.current=null;setListening(false);};
  const toggleMic=()=>{
    if(listening){recorder.current?.stop();return;}
    stopSpeaking();cancel();setError('');const token=generation.current;
    recorder.current=startRecognition(window as unknown as SpeechWindow,s=>{if(token===generation.current)setInput(s);},s=>{if(token===generation.current)setListening(s);},s=>{if(token===generation.current)setError(s);});
  };
  const toggleVoice=()=>{const next=!enabled;setEnabled(next);if(!next)stopSpeaking();try{localStorage.setItem('voicetask.voice.v1',String(next));}catch{setError('Не удалось сохранить режим озвучивания.');}};
  const speak=(text:string)=>{if(enabled){cancel();speakRussian(text,window.speechSynthesis,s=>new SpeechSynthesisUtterance(s),setSpeaking,setError);}};
  useEffect(()=>()=>{recorder.current?.cancel();window.speechSynthesis?.cancel();},[]);
  return {listening,speaking,enabled,error,setError,toggleMic,cancel,toggleVoice,stopSpeaking,speak};
}
