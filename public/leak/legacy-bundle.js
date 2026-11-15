// breachlab-web v0.9 — build legacy servido a CADA visitante (público por definición).
// SIMULACIÓN: bundle viejo con la key hardcodeada. Key 100% FALSA (FAKE BY DESIGN).
const API_KEY = 'sk_breachlab_demo_BNDL_9f2a6b';

async function createEntry(title, body) {
  // El cliente del frontend usaba la key DIRECTO desde el código servido:
  // cualquiera que abra DevTools la lee.
  const res = await fetch('/api/entries', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ title, body }),
  });
  return res.json();
}
