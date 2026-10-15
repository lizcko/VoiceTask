import { Interpreter } from './assistantEngine.js';
import { validateCommand } from './assistantTypes.js';
// Dormant adapter. The app uses interpretLocal and never calls this without explicit integration.
// The server must authenticate users, apply rate limits and use the published command schema.
export function createBackendInterpreter(endpoint:string,transport:typeof fetch=fetch):Interpreter {
  const url=new URL(endpoint);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('AI API должен использовать HTTPS.');
  if(url.username||url.password)throw Error('Не включайте секреты в адрес AI API.');
  return async(text,context,prefs,now)=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await transport(url.href,{method:'POST',credentials:'include',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({text,now:now.toISOString(),zone:prefs.zone,context:{lastId:context.lastId,resultIds:context.resultIds?.slice(0,20),pending:context.pending,awaitingScope:context.awaitingScope}})});
      if(!response.ok)throw Error(response.status===429?'Слишком много запросов. Повторите позже.':response.status===401||response.status===403?'Для AI API требуется авторизация.':'AI API временно недоступен.');
      const body=await response.text();if(body.length>64000)throw Error('Ответ AI API превышает допустимый размер.');
      return validateCommand(JSON.parse(body));
    }catch(e){if(controller.signal.aborted)throw Error('AI API не ответил за 20 секунд. Повторите запрос.');throw e;}
    finally{clearTimeout(timer);}
  };
}
