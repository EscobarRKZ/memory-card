/* Memory Card v84: submit account deletion requests without deleting anything.
   This module does not hold any privileged key or perform account deletion. */
(function(root){
  'use strict';
  const table='account_deletion_requests';
  function requireAuth(client){
    if(!client?.auth?.getUser||!client?.from){
      throw new Error('Сервис аккаунтов недоступен');
    }
  }
  async function currentUser(client){
    requireAuth(client);
    const {data,error}=await client.auth.getUser();
    if(error||!data?.user?.id){
      const e=new Error('Войди в аккаунт, чтобы отправить запрос');
      e.code='NOT_AUTHENTICATED';throw e;
    }
    return data.user;
  }
  async function status(client){
    const user=await currentUser(client);
    const {data,error}=await client.from(table)
      .select('id,status,requested_at')
      .eq('user_id',user.id)
      .maybeSingle();
    if(error)throw error;
    return data?{requested:true,status:data.status,requestedAt:data.requested_at}:{
      requested:false,status:null,requestedAt:null
    };
  }
  async function request(client){
    const user=await currentUser(client);
    const existing=await status(client);
    if(existing.requested)return {...existing,alreadyRequested:true};
    const {error}=await client.from(table).insert({user_id:user.id,status:'pending'});
    if(error){
      // Two tabs might race. If one insert succeeded, report that request
      // instead of claiming an error or creating duplicate requests.
      if(String(error.code||'')==='23505'){
        const again=await status(client);
        if(again.requested)return {...again,alreadyRequested:true};
      }
      throw error;
    }
    const result=await status(client);
    if(!result.requested)throw new Error('Заявка не подтверждена сервером');
    return {...result,alreadyRequested:false};
  }
  const FINAL_PHRASE='УДАЛИТЬ НАВСЕГДА';
  async function deletePermanently(client,details){
    if(typeof client?.functions?.invoke!=='function')throw new Error('Удаление сейчас недоступно');
    const value=details&&typeof details==='object'?details:{};
    if(value.confirmation!==FINAL_PHRASE || typeof value.password!=='string' ||
       value.password.length<8||value.password.length>256)throw new Error('Подтверждение удаления не пройдено');
    if(value.captchaToken!=null&&typeof value.captchaToken!=='string'){
      throw new Error('Неверная проверка безопасности');
    }
    const identity=await currentUser(client);
    const existing=await status(client);
    if(!existing.requested||existing.status!=='pending'){
      throw new Error('Сначала отправь заявку на удаление аккаунта');
    }
    // Never accept a user ID, email, or arbitrary deletion target from UI.
    // A separate JWT-validated Edge Function derives the account owner.
    const {data,error}=await client.functions.invoke('delete-own-account',{
      body:{
        confirmation:FINAL_PHRASE,
        password:value.password,
        ...(value.captchaToken?{captchaToken:value.captchaToken}:{})
      }
    });
    if(error){
      let code='DELETE_FAILED';
      const context=error.context;
      if(context&&typeof context.json==='function'){
        try{const payload=await context.clone?.().json?.()||await context.json();
          if(typeof payload?.code==='string')code=payload.code;
        }catch(_){}
      }
      const exception=new Error('Удаление не подтверждено сервером');
      exception.code=code;
      throw exception;
    }
    if(!data||data.deleted!==true||data.code!=='DELETED'){
      const exception=new Error('Сервер не подтвердил удаление аккаунта');
      exception.code='UNCONFIRMED';
      throw exception;
    }
    return {deleted:true,owner:identity.id,localCleanupRequired:true};
  }
  root.MemoryCardDeletionRequestV84=Object.freeze({
    status,request,currentUser,deletePermanently,FINAL_PHRASE
  });
  if(typeof module!=='undefined'&&module.exports){
    module.exports=root.MemoryCardDeletionRequestV84;
  }
})(typeof window!=='undefined'?window:{});
