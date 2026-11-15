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
  let lastState = null;   // S08: último /api/lab/state (render del modo guiado)
  let guidedOn = false;   // S08: el modo guiado es estado del panel, no del lab

  // L-3: nodos DOM + textContent, nunca innerHTML con datos de requests (defense-in-depth).
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // Estado completo del lab (contrato §2.4): actos, contadores del ataque y de la DB.
  async function pollState() {
    try {
      const s = await (await fetch('/api/lab/state')).json();
      lastState = s;
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
      // S05 hardening: botón + storage de keys (AC1) — el estado "endurecido" es el badge acto 5.
      $('fw-harden').disabled = s.flags.hardening;
      $('fw-harden').textContent = s.flags.hardening ? 'Hardening ✓ ON' : 'Activar hardening';
      $('key-storage').textContent = s.keys.storage;
      $('key-current').textContent = s.keys.current_masked || '—';
      const feed = $('feed'); // códigos HTTP REALES del bot (base del relato de S04)
      feed.hidden = s.attack.recent.length === 0;
      feed.replaceChildren(...s.attack.recent.map((r) =>
        el('code', r.status >= 200 && r.status < 300 ? 'c2xx' : 'c4xx', r.status)));
      // FIX-3 (feedback G3, ADR D-0006): estado explícito mientras corre y todo rebota.
      // Pedagógico a propósito: el atacante no sabe que su key murió — sigue probando.
      const bouncing = s.attack.running && s.attack.blocked > 0;
      $('bot-status').hidden = !bouncing;
      if (bouncing) {
        $('bot-status').textContent =
          `El atacante sigue probando — todo rebota (${s.attack.blocked} bloqueados). ` +
          'No sabe que su key murió; se rinde solo tras 20 rebotes consecutivos.';
      }
      // S09 (N-0007): el vector activo llega por /state — selector y relato del origen
      // siempre en sync (también tras un reset o un cambio hecho en otra pestaña).
      if (s.scenario) {
        $('scenario-select').value = s.scenario.id;
        $('scenario-origin').textContent = s.scenario.origin;
      }
      // S08: escenario 2 habilitado solo con hardening activo y ataque detenido.
      $('scenario-btn').disabled = !s.flags.hardening || s.attack.running;
      if (guidedOn) renderGuided(s);
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
        li.append(el('span', 'ts', new Date(e.ts).toLocaleTimeString()),
          el('span', `sev-${e.severity}`, e.message));
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

  // S05 hardening (N-0004): la migración plain→sha256 + scope pasa por el lab; el efecto
  // (rebotes 401/403 auditados) llega al feed y al audit log por polling — no se finge acá.
  $('fw-harden').addEventListener('click', () => fetch('/api/lab/hardening', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  }).catch(() => {}));

  // Audit log incremental (AC3): intentos bloqueados desde el último id.
  let lastAuditId = 0;
  async function pollAudit() {
    try {
      const { attempts } = await (await fetch(`/api/lab/audit?since=${lastAuditId}`)).json();
      const ul = $('audit');
      for (const a of attempts) {
        const li = document.createElement('li');
        const detail = el('span');
        detail.append(el('code', 'c4xx', a.status), ` ${a.method} ${a.endpoint} · key `,
          el('code', null, a.key_masked), ` · ${a.reason}`);
        li.append(el('span', 'ts', new Date(a.ts).toLocaleTimeString()), detail);
        ul.appendChild(li);
        lastAuditId = a.id;
      }
      ul.scrollTop = ul.scrollHeight;
    } catch { /* pollState ya reporta la desconexión */ }
  }

  // El leak: la evidencia del VECTOR ACTIVO (S09) — config versionada, log expuesto o
  // bundle del frontend, según el lab elegido. Key falsa (FAKE BY DESIGN).
  $('leak-btn').addEventListener('click', async () => {
    const pre = $('leak');
    if (!pre.hidden) { pre.hidden = true; return; }
    const sc = lastState && lastState.scenario;
    const text = await (await fetch(sc ? sc.leak_url : '/leak/config.json')).text();
    pre.textContent = sc && sc.leak_kind === 'json' ? JSON.stringify(JSON.parse(text), null, 2) : text;
    pre.hidden = false;
  });

  // S09 (N-0007): la serie — selector de vector. Cambiar = elegir otra historia: el
  // server re-siembra con la key de ese vector y el panel rearma los cursores (los ids
  // del timeline/audit vuelven a 1). El relato llega por polling (scenario.origin).
  (async () => {
    try {
      const { scenarios } = await (await fetch('/api/lab/scenarios')).json();
      $('scenario-select').replaceChildren(...scenarios.map((s) => new Option(s.name, s.id)));
    } catch { /* el polling reintenta */ }
  })();
  $('scenario-select').addEventListener('change', (e) => {
    fetch(`/api/lab/scenarios/${e.target.value}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }).catch(() => {});
    clearIncident();
  });

  // S08 modo guiado (N-0005): los hitos llegan por /api/lab/state (milestones) — acá solo
  // el guion numerado: próximo resaltado, hechos confirmados con ✓, resto atenuado.
  const STEPS = [
    ['attack_started', 'Ver el leak (origen) y simular el ataque'],
    ['alert_fired', 'Esperar la detección: >30 requests / 10 s → alerta crítica'],
    ['firewalls_applied', 'Aplicar los matafuegos: kill switch, rotación y rate limit'],
    ['hardening_on', 'Activar el hardening: sha256 + scopes + audit log'],
    ['reattack_bounced', 'Re-atacar con la key filtrada y ver el rebote 401/403'],
  ];
  function renderGuided(s) {
    const m = s.milestones || {};
    const next = STEPS.findIndex(([id]) => !m[id]);
    $('guided').replaceChildren(...STEPS.map(([id, label], i) => {
      const li = el('li', i < next ? 'done' : (i === next ? 'next' : ''));
      li.textContent = `${i + 1}. ${label}`;
      return li;
    }));
  }
  $('guided-btn').addEventListener('click', () => {
    guidedOn = !guidedOn;
    $('guided').hidden = !guidedOn;
    $('guided-btn').textContent = guidedOn ? 'Ocultar modo guiado' : 'Activar modo guiado';
    if (guidedOn && lastState) renderGuided(lastState);
  });

  // S08/S09: rearma los cursores del panel tras reset o cambio de vector — los ids del
  // timeline/audit vuelven a arrancar en 1.
  const clearIncident = () => {
    lastEventId = 0;
    lastAuditId = 0;
    $('timeline').replaceChildren();
    $('audit').replaceChildren();
    $('alert').hidden = true;
    $('feed').hidden = true;
    $('leak').hidden = true;
  };

  // S08 reinicio (N-0005): el server restaura el seed sin reiniciar el proceso.
  $('reset-btn').addEventListener('click', async () => {
    try {
      await fetch('/api/lab/reset', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
    } catch { /* el polling reintenta */ }
    clearIncident();
  });

  // S08 escenario 2 (N-0006): lanza el bot con una key válida sin scope de escritura.
  $('scenario-btn').addEventListener('click', () => fetch('/api/lab/scenario/scopeless-key', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  }).catch(() => {}));

  pollState();
  pollTimeline();
  pollAudit();
  setInterval(pollState, 1000);   // polling 1s (plan §2.1)
  setInterval(pollTimeline, 1000);
  setInterval(pollAudit, 1000);
})();
