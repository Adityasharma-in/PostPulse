/* PostPulse frontend — one composer, two platform brains */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let CFG = null;
let platform = 'linkedin';
let goal = 'reach';
let timer = null, seq = 0, history = [];
const SEE_MORE = 210;

const EXAMPLES = {
  linkedin: {
    fluff: 'Thrilled to announce that we are excited to share some big news! Our team has been leveraging synergies to drive game-changing innovation. Stay tuned for more updates!',
    story: 'I got fired on a Friday.\n\nNo warning. 4 years of work, gone in a 10-minute call.\n\nHere is what those 4 years taught me about surviving a layoff:\n\n1. Save 6 months of runway. I had 3 weeks.\n2. Your network is your net worth. 11 strangers referred me within 48 hours.\n3. Document your wins weekly. I had to rebuild mine from memory.\n\n90 days later I signed an offer 30% higher.\n\nGetting fired was the best career advice I never asked for.\n\nWhat is the hardest career lesson you learned the hard way?',
    howto: 'The 3-line LinkedIn hook formula I use for every post:\n\nLine 1: name the pain (I lost 80% of my reach in 30 days).\nLine 2: promise the fix (Here are the 4 changes that brought it back).\nLine 3: blank. Let curiosity do the work.\n\nMost people bury the payoff in paragraph 4. The feed never gets there.\n\nSave this for your next draft. Which line do you struggle with most?',
  },
  x: {
    weak: 'Oh my god',
    launch: 'Oh my god... this is absolutely insane chatgpt just released a new model.',
    howto: "Oh my god... this is absolutely insane chatgpt just released a new model. And here's exactly how you can use it.",
    list: 'Oh my god... this is absolutely insane chatgpt just released a new model. And here are the 10 ways to use it.\n\n1. Make a thing do a thing',
  },
};

const PLAT_META = {
  linkedin: {
    note: 'LinkedIn brain · 6000 chars · “…see more” at ~210',
    who: 'Post to Anyone · LinkedIn', placeholder: 'What do you want to talk about?',
    previewTitle: '📱 Feed preview — before “…see more”',
    lengthTitle: 'Length sweet spot · 90–220 words',
    examples: [['fluff', 'corporate fluff'], ['story', 'story'], ['howto', 'framework']],
  },
  x: {
    note: 'X brain · 280-char feed · thread-friendly',
    who: 'Everyone can reply · X', placeholder: "What's happening?",
    previewTitle: '⚡ X preview — first line is everything',
    lengthTitle: 'Brevity meter · punchier under ~280 chars',
    examples: [['weak', 'weak'], ['launch', 'launch'], ['howto', 'how-to'], ['list', 'list']],
  },
};

function barColor(v) {
  if (v < 40) return '#cf1f1f';
  if (v < 70) return platform === 'linkedin' ? '#0a66c2' : '#2b3beb';
  return '#0a7a44';
}

function stats(text) {
  const words = (text.trim().match(/\S+/g) || []).length;
  const emojis = (text.match(/\p{Extended_Pictographic}/gu) || []).length;
  const hashtags = (text.match(/#\w+/g) || []).length;
  const questions = (text.match(/\?/g) || []).length;
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const read = Math.max(1, Math.round(words / 200));
  return { words, emojis, hashtags, questions, paras, read };
}

function audience() {
  const followers = Number($('inFollowers').value);
  const avg = $('inAvg').value === '' ? undefined : Number($('inAvg').value);
  localStorage.setItem('pp_followers', $('inFollowers').value);
  localStorage.setItem('pp_avg', $('inAvg').value);
  return { followers, avgImpressions: avg };
}

function dimOrder() {
  if (!CFG) return [];
  return Object.keys(CFG.platforms[platform].dims);
}
function dimLabel(k) {
  const d = CFG.platforms[platform].dims[k];
  return [d.label, d.hint];
}

function renderGoals() {
  const goals = CFG.platforms[platform].goals;
  if (!goals[goal]) goal = CFG.platforms[platform].defaultGoal;
  for (const id of ['goalRow', 'goalRowAB']) {
    const el = $(id);
    const icons = { reach: '📣', growth: '🚀', authority: '🎓', leads: '💼' };
    el.innerHTML = '<span class="goal-label">Optimize for:</span>' + Object.entries(goals).map(([k, label]) =>
      `<button class="goal-btn ${k === goal ? 'active' : ''}" data-goal="${k}">${icons[k] || '🎯'} ${esc(label)}</button>`).join('');
    el.querySelectorAll('.goal-btn').forEach((b) => b.onclick = () => {
      goal = b.dataset.goal; history = []; renderHistory(); renderGoals();
      clearTimeout(timer); timer = setTimeout(() => judge($('postInput').value), 200);
    });
  }
}

function renderExamples() {
  $('exampleRow').innerHTML = PLAT_META[platform].examples.map(([k, label]) =>
    `<button data-ex="${k}">${esc(label)}</button>`).join('');
  $('exampleRow').querySelectorAll('[data-ex]').forEach((b) => b.onclick = () => {
    const input = $('postInput');
    input.value = EXAMPLES[platform][b.dataset.ex];
    input.dispatchEvent(new Event('input'));
    clearTimeout(timer); timer = setTimeout(() => judge(input.value), 300);
  });
}

function renderPreview(text) {
  const meta = PLAT_META[platform];
  $('previewTitle').textContent = meta.previewTitle;
  if (!text.trim()) { $('previewBox').innerHTML = '<span class="dim">Type to preview your hook…</span>'; return; }
  if (platform === 'linkedin') {
    const head = text.slice(0, SEE_MORE), tail = text.slice(SEE_MORE);
    $('previewBox').innerHTML = `<span class="hook-part">${esc(head)}</span>${tail ? `<span class="cut">…see more</span> <span class="dim">${esc(tail.slice(0, 140))}${tail.length > 140 ? '…' : ''}</span>` : ''}`;
  } else {
    const lines = text.split('\n');
    const first = lines[0] || '';
    const rest = lines.slice(1).join('\n');
    $('previewBox').innerHTML = `<span class="hook-part">${esc(first.slice(0, 280))}</span>${rest ? `<br/><span class="dim">${esc(rest.slice(0, 160))}${rest.length > 160 ? '…' : ''}</span>` : ''}<br/><span class="cut mono" style="font-size:11px">${text.length} chars ${text.length > 280 ? '· over 1 post, thread it 🧵' : '· fits 1 post ✓'}</span>`;
  }
}

function renderLength(text) {
  const st = stats(text);
  $('lengthTitle').textContent = PLAT_META[platform].lengthTitle;
  if (platform === 'linkedin') {
    const pct = Math.min(100, (st.words / 400) * 100);
    $('lengthFill').style.left = pct + '%';
    $('lengthLabel').textContent = `${st.words} words · sweet spot 90–220`;
  } else {
    const pct = Math.min(100, (text.length / 600) * 100);
    $('lengthFill').style.left = pct + '%';
    $('lengthLabel').textContent = `${text.length} chars · ${st.words} words`;
  }
}

function renderDims(dims) {
  const order = dimOrder();
  $('dims').innerHTML = order.map((k) => {
    const v = dims?.[k]?.value ?? 0;
    const [label, hint] = dimLabel(k);
    return `<div class="dim-row"><span class="dim-name">${esc(label)}<small>${esc(hint)}</small></span>
      <div class="dim-track"><div class="dim-fill" style="width:${v}%;background:${barColor(v)}"></div></div>
      <span class="dim-val">${dims ? v : '–'}</span></div>`;
  }).join('');
}

function renderHistory() {
  const svg = $('histSpark');
  if (history.length < 2) { svg.innerHTML = ''; return; }
  const pts = history.slice(-30);
  const step = 300 / Math.max(1, pts.length - 1);
  const path = pts.map((p, i) => `${(i * step).toFixed(1)},${(48 - (p / 100) * 44 - 2).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  svg.innerHTML = `<polyline points="${path}" fill="none" stroke="#ff4b1e" stroke-width="2"/>` +
    `<circle cx="${((pts.length - 1) * step).toFixed(1)}" cy="${(48 - (last / 100) * 44 - 2).toFixed(1)}" r="3.5" fill="#16130e"/>`;
}

function renderReach(res) {
  const r = res.reach;
  if (!r) return;
  const fmt = (n) => n.toLocaleString();
  $('reachOut').innerHTML = `
    <div class="reach-range">👁️ ≈ ${fmt(r.low)} – ${fmt(r.high)} <small>views</small></div>
    <div class="reach-sub">🔥 breakout upside ~<b>${fmt(r.upside)}</b> · 👍 ≈ ${fmt(r.likesLow)}–${fmt(r.likesHigh)} likes · <b>${r.multiplier}×</b> baseline ${fmt(r.baseline)} (${esc(r.assumptions)})</div>
    <div class="reach-note">Rough heuristic from ${res.score}/100 — Jev judges quality, the math projects reach. Not a guarantee.</div>`;
}

function renderSignals(res) {
  let html = '';
  if (res.platform === 'linkedin') {
    html += (res.fluff > 60 ? `<span class="sig bad">🚨 fluff ${res.fluff}%</span>` : `<span class="sig ok">✓ voice ${100 - res.fluff}% human</span>`);
    if (res.asksQuestion > 50) html += `<span class="sig info">❓ asks a question</span>`;
  } else if (res.flags) {
    if (res.flags.rageBait > 60) html += `<span class="sig bad">😡 rage-bait ${res.flags.rageBait}%</span>`;
    if (res.flags.aiSlop > 60) html += `<span class="sig bad">🤖 AI-slop ${res.flags.aiSlop}%</span>`;
    if (res.flags.ad > 60) html += `<span class="sig warn">📢 reads like an ad ${res.flags.ad}%</span>`;
    if (!html && res.flags.rageBait < 30 && res.flags.aiSlop < 30 && res.flags.ad < 30) html = '<span class="sig ok">✓ clean</span>';
  }
  if (res.fallback) html += `<span class="sig warn">offline fallback</span>`;
  $('signals').innerHTML = html;
}

function render(res, text) {
  $('scoreNum').textContent = res.score;
  $('pulseFill').style.width = res.score + '%';
  const v = $('verdict');
  v.textContent = res.verdict.label;
  v.className = 'verdict ' + res.verdict.color;
  const typeName = String(res.postType.choice || 'other').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  $('verdictSub').textContent = `${typeName} · certainty ${Math.round(res.postType.confidence * 100)}% · ${CFG.platforms[res.platform].label} · goal: ${res.goal}`;
  renderSignals(res);
  $('typePills').innerHTML = res.postType.top.map((t, i) =>
    `<span class="type-pill ${i === 0 ? 'top' : 'dim'}">${esc(t.key.replace(/_/g, ' '))} ${Math.round(t.prob * 100)}%</span>`).join('');
  renderDims(res.dims);
  renderLength(text);
  renderReach(res);
  $('tips').innerHTML = res.tips.map((t) => `<li>${esc(t)}</li>`).join('');
  $('latency').textContent = `${res.latencyMs} ms${res.cached ? ' · cached' : ''}`;
  $('rawJson').textContent = JSON.stringify(res, null, 2);
  history.push(res.score);
  renderHistory();
  $('statusLine').textContent = `model ${res.model} · 1 request (1 Choice + 8 Scores + Nouls) · ${CFG.platforms[res.platform].label} weights in code`;
}

function resetEmpty() {
  $('scoreNum').textContent = '–';
  $('pulseFill').style.width = '0';
  $('verdict').textContent = 'Ready when you are';
  $('verdict').className = 'verdict';
  $('verdictSub').textContent = 'Judged ~500 ms after you stop typing';
  $('signals').innerHTML = '';
  $('typePills').innerHTML = '<span class="type-pill dim">Start typing</span>';
  renderDims(null);
  $('latency').textContent = '';
}

async function judge(text) {
  const my = ++seq;
  renderPreview(text);
  const st = stats(text);
  $('statLine').textContent = `${st.words} words · ~${st.read} min · ${st.paras} paras · ${st.emojis} emojis · ${st.hashtags} tags · ${st.questions} ?`;
  renderLength(text);
  const maxC = CFG.platforms[platform].maxChars;
  $('charCount').textContent = text.length ? `${text.length} / ${maxC}` : '';
  $('charCount').style.color = text.length > maxC ? '#cf1f1f' : '';
  if (text.trim().length < 10) { resetEmpty(); return; }
  $('spin').classList.remove('hidden');
  try {
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, platform, goal, ...audience() }),
    });
    const data = await r.json();
    if (my !== seq) return;
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    render(data, text);
  } catch (err) {
    if (my === seq) $('verdictSub').textContent = 'Error: ' + err.message;
  } finally {
    if (my === seq) $('spin').classList.add('hidden');
  }
}

async function compare() {
  const a = $('abA').value, b = $('abB').value;
  if (!a.trim() || !b.trim()) { $('abResult').innerHTML = '<p class="stats">Paste both drafts first.</p>'; return; }
  const btn = $('abGo');
  btn.disabled = true; btn.textContent = 'Judging both…';
  try {
    const r = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a, b, platform, goal, ...audience() }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    const badge = (res) => res.platform === 'linkedin'
      ? `${esc(res.postType.choice.replace(/_/g, ' '))} · fluff ${res.fluff}%`
      : `${esc(res.postType.choice.replace(/_/g, ' '))} · slop ${res.flags.aiSlop}% · rage ${res.flags.rageBait}%`;
    const card = (res, tag, win) => `<div class="ab-score ${win ? 'win' : ''}"><div class="n" style="color:${res.score < 40 ? '#cf1f1f' : res.score < 70 ? '#2b3beb' : '#0a7a44'}">${res.score}</div>
      <div><b>Draft ${tag}</b> — ${esc(res.verdict.label)}</div>
      <div class="stats">${badge(res)} · ${res.latencyMs} ms</div>
      ${res.reach ? `<div class="stats">👁️ ≈ ${res.reach.low.toLocaleString()}–${res.reach.high.toLocaleString()} views · 🔥 ~${res.reach.upside.toLocaleString()}</div>` : ''}</div>`;
    $('abResult').innerHTML = `<div class="ab-winner">🏆 Draft ${data.winner.toUpperCase()} wins by ${data.delta} pts <span class="dim" style="font-size:13px;font-family:var(--body)">· ${esc(CFG.platforms[data.platform].label)}</span></div>
      <div class="ab-scores">${card(data.a, 'A', data.winner === 'a')}${card(data.b, 'B', data.winner === 'b')}</div>
      <ul class="tips"><li><b>Winner's top fix:</b> ${esc(data[data.winner].tips[0] || '')}</li>
      <li><b>Loser's top fix:</b> ${esc(data[data.winner === 'a' ? 'b' : 'a'].tips[0] || '')}</li></ul>`;
  } catch (err) {
    $('abResult').innerHTML = `<p class="stats">Compare failed: ${esc(err.message)}</p>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Compare drafts';
  }
}

function setPlatform(p) {
  platform = p;
  document.body.dataset.platform = p;
  goal = CFG.platforms[p].defaultGoal;
  history = []; renderHistory();
  document.querySelectorAll('.plat').forEach((b) => {
    const on = b.dataset.platform === p;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  $('platformNote').textContent = PLAT_META[p].note;
  $('whoSub').textContent = PLAT_META[p].who;
  $('postInput').placeholder = PLAT_META[p].placeholder;
  $('postInput').maxlength = CFG.platforms[p].maxChars + 4000;
  renderGoals(); renderExamples();
  clearTimeout(timer); timer = setTimeout(() => judge($('postInput').value), 200);
}

function bind() {
  const input = $('postInput');
  $('inFollowers').value = localStorage.getItem('pp_followers') || '1000';
  $('inAvg').value = localStorage.getItem('pp_avg') || '';
  const rejudge = () => { clearTimeout(timer); timer = setTimeout(() => judge(input.value), 600); };
  $('inFollowers').addEventListener('input', rejudge);
  $('inAvg').addEventListener('input', rejudge);
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => judge(input.value), 500); });
  document.querySelectorAll('.plat').forEach((b) => b.onclick = () => setPlatform(b.dataset.platform));
  $('postBtn').onclick = () => {
    const s = $('scoreNum').textContent;
    alert(s === '–' ? 'Write your draft first — PostPulse scores it live.' : `This ${CFG.platforms[platform].label} draft scores ${s}/100 for ${goal}. Copy it over when ready.`);
  };
  $('tabSingle').onclick = () => {
    $('tabSingle').classList.add('active'); $('tabAB').classList.remove('active');
    $('singleMode').classList.remove('hidden'); $('abMode').classList.add('hidden');
  };
  $('tabAB').onclick = () => {
    $('tabAB').classList.add('active'); $('tabSingle').classList.remove('active');
    $('abMode').classList.remove('hidden'); $('singleMode').classList.add('hidden');
  };
  $('abGo').onclick = compare;
}

async function boot() {
  renderDims(null);
  try {
    CFG = await (await fetch('/api/config')).json();
    $('modelPill').textContent = CFG.model;
    const pill = $('apiPill');
    if (CFG.hasKey) { pill.textContent = '● TypeSafe live'; pill.className = 'pill ok'; }
    else { pill.textContent = '● fallback mode'; pill.className = 'pill bad'; }
    renderGoals(); renderExamples();
  } catch {
    $('apiPill').textContent = '● server offline';
    $('apiPill').className = 'pill bad';
  }
  setPlatform('linkedin');
  bind();
  renderPreview('');
}
boot();
