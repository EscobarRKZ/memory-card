/* v89: offline Auth and template checks; no live users or network. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const api=require('../auth-messages-v89.js');
const scenarios=[
 [{code:'email_address_not_authorized'},'signup',/почтовый сервис/i],
 [{code:'over_email_send_rate_limit',status:429},'signup',/лимит писем/],
 [{message:'Email rate limit exceeded'},'reset',/лимит писем/],
 [{code:'email_not_confirmed'},'login',/подтверди email/i],
 [{code:'invalid_credentials'},'login',/Неверный email/],
 [{message:'Captcha verification failed'},'signup',/Проверка безопасности/],
 [{status:429},'login',/много запросов/],
 [{message:'Failed to fetch'},'login',/подключение к интернету/],
 [{code:'internal_error',message:'SECRET_INTERNAL'},'signup',/Не удалось создать аккаунт/]
];
for(const [e,phase,regex] of scenarios){
 const msg=api.describe(e,phase);
 assert.match(msg,regex);
 assert.ok(!msg.includes('SECRET_INTERNAL'));
}
const backend=read('backend-v2.js');
for(const p of ['signup','login','reset','password']){
 assert.ok(backend.includes("friendlyAuthError(error,'"+p+"')"),'missing safe '+p+' errors');
}
const index=read('index.html'),sw=read('sw.js');
assert.ok(index.indexOf('auth-messages-v89.js?v=89')<index.indexOf('backend-v2.js?v=89'));
assert.ok(sw.includes('"./auth-messages-v89.js?v=89"'));
for(const name of ['confirm-signup','reset-password','magic-link','email-change']){
 const html=read('emails/'+name+'.html');
 assert.ok(html.includes('{{ .ConfirmationURL }}'),name+' needs Auth confirmation URL');
 assert.ok(!html.includes('{{ .Email }}')&&!html.includes('{{ .Data }}'),name+' should avoid personal metadata');
 assert.ok(!/<script/i.test(html)&&!/<img\b/i.test(html),name+' cannot embed scripts or tracking images');
 assert.ok(html.includes('<html lang="ru">'));
}
console.log('v89 auth errors, branded mail and PWA wiring PASS');
