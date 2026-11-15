'use strict';
// Panel del defensor (S02): polling 1s a /api/health + timeline incremental (plan §2.1), botón "ver el leak" (AC4).
(() => {
  const $ = (id) => document.getElementById(id);
  const ACTS = ['', 'normal', 'ataque', 'detectado', 'contenido', 'hardened'];
  let lastEventId = 0;

  // Estado del lab desde /api/health (contrato §2.4; /api/lab/state completo llega en S03).
  async function pollState() {
    try {
      const h = await (await fetch('/api/health')).json();
      $('conn').hidden = true;
      const badge = $('state');
      badge.className = 'badge ' + (h.status === 'ok' ? 'ok' : 'down');
      badge.textContent = h.status === 'ok' ? 'Operación normal' : 'Lab caído';
      $('act').textContent = `${h.act} · ${ACTS[h.act] || '?'}`;
      $('entries').textContent = h.db_entries;
    } catch {
      $('conn').hidden = false; // reintenta en el próximo tick
    }
  }

  // Timeline incremental: solo eventos nuevos desde el último id.
  async function pollTimeline() {
    try {
      const { events } = await (await fetch(`/api/lab/timeline?since=${lastEventId}`)).json();
      const ul = $('timeline');
      for (const e of events) {
        const li = document.createElement('li');
        li.innerHTML = `<span class="ts">${new Date(e.ts).toLocaleTimeString()}</span>` +
          `<span class="sev-${e.severity}">${e.message}</span>`;
        ul.appendChild(li);
        lastEventId = e.id;
      }
      ul.scrollTop = ul.scrollHeight; // lo más reciente visible
    } catch { /* pollState ya reporta la desconexión */ }
  }

  // El leak: la config "versionada" con la key falsa (AC4, FAKE BY DESIGN).
  $('leak-btn').addEventListener('click', async () => {
    const pre = $('leak');
    if (!pre.hidden) { pre.hidden = true; return; }
    const cfg = await (await fetch('/leak/config.json')).json();
    pre.textContent = JSON.stringify(cfg, null, 2);
    pre.hidden = false;
  });

  pollState();
  pollTimeline();
  setInterval(pollState, 1000);   // polling 1s (plan §2.1)
  setInterval(pollTimeline, 1000);
})();
