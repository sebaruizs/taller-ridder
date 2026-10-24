// Sin caché offline: los datos son de Odoo en vivo. Solo habilita la instalación.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
