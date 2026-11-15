'use strict';
// Panel del defensor (S02+S03): polling 1s a /api/lab/state + timeline incremental,
// control del ataque (AC1/AC4), contadores en vivo (AC2) y alerta roja (AC3).
(() => {
  const $ = (id) => document.getElementById(id);
  const ACTS = ['', 'normal', 'ataque', 'detectado', 'contenido', 'hardened'];
  const BADGES = {
    1: ['ok', 'Operación normal'], 2: ['warn', 'Ataque en curso'], 3: ['down', 'Intrusión detectada'],
    4: ['down', 'Incidente contenido'], 5: ['ok', 'Sistema endurecido'],
  };
  let lastEventId = 0;

  // Estado completo del lab (contrato §2.4): actos, contadores del ataque y de la DB.
  async function pollState() {
    try {
      const s = await (await fetch('/api/lab/state')).json();
      $('conn').hidden = true;
      const [cls, label] = BADGES[s.act] || ['down', 'estado ?'];
      const badge = $('state');
      badge.className = 'badge ' + cls;
      badge.textContent = label;
      $('act').textContent = `${s.act} · ${ACTS[s.act] || '?'}`;
      $('entries').textContent = s.db.legit + s.db.garbage;
      $('legit').textContent = s.db.legit;
      $('garbage').textContent = s.db.garbage;
      $('attack-requests').textContent = s.attack.requests;
      $('attack-start').disabled = s.attack.running;
      $('attack-stop').disabled = !s.attack.running;
      // S04: indicadores de matafuegos + key vigente (solo máscara, contrato §2.4).
      $('fw-kill').disabled = s.flags.killswitch;
      $('fw-kill').textContent = s.flags.killswitch ? 'Kill switch ✓ ON' : 'Kill switch';
      $('fw-rate').disabled = s.flags.ratelimit;
      $('fw-rate').textContent = s.flags.ratelimit ? 'Rate limit ✓ ON' : 'Rate limit';
      $('key-current').textContent = s.keys.current_masked || '—';
      const feed = $('feed'); // códigos HTTP REALES del bot (base del relato de S04)
      feed.hidden = s.attack.recent.length === 0;
      feed.innerHTML = s.attack.recent
        .map((r) => `<code class="${r.status >= 200 && r.status < 300 ? 'c2xx' : 'c4xx'}">${r.status}</code>`)
        .join('');
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
        if (e.kind === 'alert') { // alerta roja visible hasta fin de la sesión (AC3)
          const banner = $('alert');
          banner.textContent = `${new Date(e.ts).toLocaleTimeString()} — ${e.message}`;
          banner.hidden = false;
        }
      }
      ul.scrollTop = ul.scrollHeight; // lo más reciente visible
    } catch { /* pollState ya reporta la desconexión */ }
  }

  // Control del bot (AC1/AC4): los botones se rehabilitan en el próximo poll.
  function attack(action) {
    $('attack-start').disabled = true;
    $('attack-stop').disabled = true;
    fetch('/api/lab/attack', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    }).catch(() => {});
  }
  $('attack-start').addEventListener('click', () => attack('start'));
  $('attack-stop').addEventListener('click', () => attack('stop'));

  // S04 matafuegos (AC N-0003): POST a /api/lab/firewall/*; el efecto no se finge acá —
  // llega por polling como códigos 403/401/429 REALES del bot en el feed.
  const firewall = (name, body) => fetch(`/api/lab/firewall/${name}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  $('fw-kill').addEventListener('click', () => firewall('kill-switch', { enabled: true }));
  $('fw-rotate').addEventListener('click', () => firewall('rotate-key', {}));
  $('fw-rate').addEventListener('click', () => firewall('rate-limit', { enabled: true }));

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
