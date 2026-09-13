# Memory Card Backend v2

Ветка: `backend-v2-supabase`

## Что уже реализовано

- Supabase Auth: email + пароль
- обязательное подтверждение email
- Cloudflare Turnstile для регистрации и входа
- одна учётная запись на нескольких устройствах
- PostgreSQL вместо Google Sheets
- Row Level Security: пользователь читает и меняет только свои данные
- таблицы профилей, игр, настроек, коллекций и дружбы
- публичный Memory Card ID вида `MC-XXXX-XXXX`
- локальная IndexedDB остаётся быстрым кэшем
- данные локального пользователя при первом входе сливаются с облаком и загружаются в Supabase
- Google Sheets sync при включённом Backend v2 отключается

## 1. Supabase

Создать новый проект Supabase.

В SQL Editor выполнить:

`supabase/migrations/20260913_backend_v2.sql`

В Authentication включить Email provider и Confirm email.

В URL Configuration указать:

- Site URL: `https://escobarrkz.github.io/memory-card/`
- Redirect URL: `https://escobarrkz.github.io/memory-card/**`

## 2. Cloudflare Turnstile

Создать Turnstile widget для домена:

`escobarrkz.github.io`

Скопировать Site Key и Secret Key.

В Supabase открыть Authentication → Bot and Abuse Protection, включить CAPTCHA, выбрать Cloudflare Turnstile и вставить Secret Key.

Secret Key Turnstile нельзя добавлять в репозиторий или клиентский JavaScript.

## 3. Email

Для теста можно использовать стандартную отправку Supabase.

Перед публичным запуском подключить Custom SMTP в Supabase Authentication, например Resend, Postmark или Brevo.

## 4. Клиентская конфигурация

Открыть `backend-config.js` и заполнить:

```js
window.MC_BACKEND_V2={
  supabaseUrl:'https://PROJECT.supabase.co',
  supabaseAnonKey:'PUBLISHABLE_OR_ANON_KEY',
  turnstileSiteKey:'TURNSTILE_SITE_KEY',
  enabled:true
};
```

В браузер кладётся только publishable/anon key. `service_role` использовать на клиенте нельзя.

## 5. Проверка

1. Открыть сайт в приватном окне.
2. Зарегистрировать новый email.
3. Пройти Turnstile.
4. Проверить письмо подтверждения.
5. После подтверждения войти.
6. Выбрать приставки и сохранить настройки.
7. Добавить тестовую игру.
8. Открыть сайт на другом устройстве и войти тем же email и паролем.
9. Игра и настройки должны загрузиться из Supabase.
10. Проверить, что другой аккаунт не видит записи первого пользователя через обычный API.

## Миграция текущих пользователей

Ничего экспортировать вручную не требуется. При первом входе в Backend v2 текущая локальная библиотека объединяется с облачной по ID игр и `updatedAt`, после чего отправляется в Supabase.

До завершения тестов ветка `main` продолжает использовать текущий production backend.
