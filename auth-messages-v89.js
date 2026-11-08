/* v89: safe and localized Supabase Auth errors, without personal data in logs. */
(function(root){
  'use strict';
  function describe(error,operation='login'){
    const code=String(error?.code||'').toLowerCase();
    const message=String(error?.message||'').toLowerCase();
    const status=Number(error?.status||0);
    const match=(...terms)=>terms.some(x=>code.includes(x)||message.includes(x));
    if(match('email_address_not_authorized','email address not authorized'))
      return 'Почтовый сервис пока не может отправлять письма на этот адрес. Для публичной регистрации нужна почта Memory Card.';
    if(match('over_email_send_rate_limit','email rate limit exceeded','email rate limit'))
      return 'Сейчас превышен лимит писем. Попробуй позже, не отправляй запросы подряд.';
    if(match('email_not_confirmed','email not confirmed'))
      return 'Подтверди email по ссылке в письме. Также проверь папку «Спам».';
    if(match('invalid_credentials','invalid login credentials','invalid grant'))
      return 'Неверный email или пароль.';
    if(match('captcha','verification challenge'))
      return 'Проверка безопасности не пройдена. Обнови её и повтори попытку.';
    if(match('weak_password','password should contain','password is too weak'))
      return 'Выбери более надёжный пароль: не менее 8 символов, без простых комбинаций.';
    if(match('invalid_email','email address is invalid'))
      return 'Проверь адрес электронной почты.';
    if(match('signup_disabled','signups not allowed','signup is disabled'))
      return 'Регистрация сейчас временно закрыта.';
    if(match('user_already_exists','already registered'))
      return 'Этот адрес уже может быть зарегистрирован. Попробуй войти или восстановить пароль.';
    if(status===429||match('too many requests','rate_limit','request rate limit'))
      return 'Слишком много запросов. Попробуй позже.';
    if(match('failed to fetch','networkerror','network request failed','fetch failed')||status===0&&!code&&!message)
      return 'Не удалось связаться с сервером. Проверь подключение к интернету.';
    if(operation==='signup')return 'Не удалось создать аккаунт. Проверь адрес и попробуй позже.';
    if(operation==='reset')return 'Не удалось отправить письмо для восстановления. Попробуй позже.';
    if(operation==='password')return 'Не удалось обновить пароль. Попробуй позже.';
    return 'Не удалось войти. Проверь данные и попробуй снова.';
  }
  const api=Object.freeze({describe});
  root.MemoryCardAuthMessagesV89=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:{});
