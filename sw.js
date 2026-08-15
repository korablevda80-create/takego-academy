// Take&Go — service worker.
// Задача: приложение открывается и работает при плохой связи (подсобка, склад),
// а не показывает браузерную ошибку. Стратегия консервативная, чтобы обновления
// контента доходили до сотрудников сразу:
//   • /_next/static/* — файлы с хэшем в имени, кэшируем навсегда
//   • страницы — сначала сеть, кэш только если сети нет
//   • запросы к Supabase (данные) — НИКОГДА не кэшируем
const VERSION = "v1"
const SHELL = `takego-shell-${VERSION}`
const PAGES = `takego-pages-${VERSION}`

const OFFLINE_URL = "/offline.html"

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL).then(c => c.addAll([OFFLINE_URL, "/icon-192.png"])).then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== PAGES).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", event => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)

  // Данные и авторизация — всегда только из сети, ничего не кэшируем.
  if (url.origin !== self.location.origin) return

  // Статика Next.js: имя файла содержит хэш, поэтому кэш безопасен.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(res => {
        const copy = res.clone()
        caches.open(SHELL).then(c => c.put(request, copy))
        return res
      }))
    )
    return
  }

  // Переходы по страницам: сначала сеть (чтобы правки контента были видны сразу),
  // при отсутствии сети — последняя сохранённая версия, иначе офлайн-страница.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone()
          caches.open(PAGES).then(c => c.put(request, copy))
          return res
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match(OFFLINE_URL)))
    )
    return
  }

  // Картинки уроков и прочие ассеты: сеть, с откатом на кэш.
  event.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok && (request.destination === "image" || request.destination === "font")) {
          const copy = res.clone()
          caches.open(SHELL).then(c => c.put(request, copy))
        }
        return res
      })
      .catch(() => caches.match(request))
  )
})
