import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3400;
const API_KEY = process.env.TYPESAFE_API_KEY || '';
const API_URL = process.env.TYPESAFE_API_URL || 'https://api.typesafe.ai/v1/systemone';
const MODEL = process.env.TYPESAFE_MODEL || 'jev-latest';

app.use(cors());
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// PostPulse: one backend, two platform brains.
// Every judgment is ONE System One call: 1 Choice (post type) + 8 Scores
// + platform Nouls. Composite + reach math live in code per TypeSafe docs.
//   Choice    https://docs.typesafe.ai/primitives/choice
//   Score     https://docs.typesafe.ai/primitives/score
//   Noul      https://docs.typesafe.ai/primitives/noul
//   Composite https://docs.typesafe.ai/patterns/composite-scoring
// ---------------------------------------------------------------------------

const PLATFORMS = {
  linkedin: {
    label: 'LinkedIn',
    maxChars: 6000,
    organic: 0.12,
    verbs: { score: 'Post score', empty: 'Post score' },
    dims: {
      hook: {
        label: 'Hook', hint: 'First ~210 chars before "see more"',
        instructions: 'How strong are the first two lines as a scroll-stopper? Only the opening earns the "see more" click.',
        criteria: [
          'Opens with corporate filler or throat-clearing (thrilled to announce, excited to share, a quick update) and no reason to expand',
          'Opens with a topic but no payoff, tension, or curiosity gap',
          'Opens with a clear tension, claim, or curiosity gap that earns the "see more" click',
          'Opening alone could travel: a bold result, a striking confession, or an irresistible open loop',
        ],
        tip: 'Rewrite the first two lines: put tension or payoff before the "see more" cutoff (~210 chars). Never open with "thrilled/excited to announce".',
      },
      story: {
        label: 'Story', hint: 'Lived experience beats advice',
        instructions: 'How much lived, personal experience does the post carry versus generic advice?',
        criteria: [
          'No story at all: pure generic advice anyone could post',
          'A vague nod to experience but no real scene or moment',
          'A concrete personal moment or episode that grounds the point',
          'A vivid lived story with stakes, a turning point, and a lesson only the author could tell',
        ],
        tip: 'Anchor the point in something that actually happened to you: a scene, a mistake, a number. Stories earn dwell time; advice alone does not.',
      },
      insight: {
        label: 'Insight', hint: 'Non-obvious value',
        instructions: 'How non-obvious and valuable is the core insight?',
        criteria: [
          'A platitude: work hard, network, be authentic. Zero new information',
          'Sensible but familiar: true and unobjectionable, said a thousand times',
          'A genuinely useful, non-obvious point of view or framework',
          'A sharp, quotable insight that reframes how the reader sees the topic',
        ],
        tip: 'Sharpen the insight until a smart reader would screenshot it. Cut anything a fortune cookie could say.',
      },
      readability: {
        label: 'Readability', hint: 'Line breaks, short paras',
        instructions: 'How skimmable is the formatting for the LinkedIn feed?',
        criteria: [
          'A wall of text: long dense paragraphs with no breathing room',
          'Readable but heavy: long lines, little structure',
          'Breathable: short paragraphs, line breaks, easy to scan',
          'Native feed shape: one idea per line, white space, bold pacing, impossible to bounce off',
        ],
        tip: 'Break it up: one idea per line, short paragraphs, blank lines between thoughts. Walls of text die in the feed.',
      },
      specific: {
        label: 'Specific', hint: 'Numbers, names, proof',
        instructions: 'How concrete is the post: numbers, names, proof?',
        criteria: [
          'Totally vague: no numbers, names, timelines, or evidence',
          'Topic named but no hard specifics or proof',
          'Concrete: at least one real number, name, or timeline',
          'Receipts: exact metrics, before/after, screenshots promised or shown',
        ],
        tip: 'Add receipts: an exact number, a timeline, a before/after. Specific posts get saved and shared; vague ones get scrolled past.',
      },
      authentic: {
        label: 'Authentic', hint: 'Human voice, zero fluff',
        instructions: 'How human and authentic does the voice sound, versus corporate or AI-generated fluff?',
        criteria: [
          'Reads like a press release or AI slop: buzzwords, hype, zero humanity',
          'Professional but stiff: correct, forgettable, could be anyone',
          'A real human voice with some personality and honesty',
          'Unmistakably the author: honest, specific, a little vulnerable, impossible to fake',
        ],
        tip: 'Delete every buzzword (leverage, synergy, thrilled, game-changer). Write one sentence you would actually say out loud.',
      },
      cta: {
        label: 'CTA', hint: 'Next step for the reader',
        instructions: 'How clearly does the post drive an action or next step?',
        criteria: [
          'Ends nowhere: no ask, no question, no next step',
          'A weak or implied close with no clear ask',
          'A clear close: an explicit question, invitation, or call to action',
          'A compelling close that makes replying, following, or clicking feel obvious',
        ],
        tip: 'End with one explicit ask: a question, an invitation to DM, or a follow for part 2. Posts that end nowhere convert nowhere.',
      },
      dwell: {
        label: 'Dwell', hint: 'Depth worth staying for',
        instructions: 'How much does the post reward reading to the end? LinkedIn rewards dwell time.',
        criteria: [
          'Nothing to stay for: the whole value, if any, is in line one',
          'Thin: skimmable in seconds with no reason to linger',
          'Layered: builds as it goes, worth the full read',
          'A full meal: tension, payoff, and a takeaway that rewards every second spent',
        ],
        tip: 'Build in layers: open loop at the top, payoff in the middle, takeaway at the end. Give readers a reason to stay past line three.',
      },
    },
    goals: {
      reach: {
        label: 'Max reach',
        weights: { hook: 0.22, dwell: 0.14, story: 0.14, insight: 0.12, authentic: 0.12, specific: 0.10, readability: 0.08, cta: 0.08 },
      },
      authority: {
        label: 'Authority',
        weights: { insight: 0.20, specific: 0.16, story: 0.14, authentic: 0.14, hook: 0.12, readability: 0.10, dwell: 0.08, cta: 0.06 },
      },
      leads: {
        label: 'Leads',
        weights: { cta: 0.20, insight: 0.16, specific: 0.14, hook: 0.14, authentic: 0.12, readability: 0.10, story: 0.08, dwell: 0.06 },
      },
    },
    typeCriteria: {
      story: 'A personal story or lesson from lived experience',
      contrarian: 'A contrarian take that challenges common wisdom',
      howto: 'A how-to, framework, playbook, or step-by-step guide',
      company_news: 'Company news: funding, launch, milestone, announcement',
      hiring: 'Hiring or team-related: we are hiring, welcome, farewell',
      milestone: 'A personal milestone: new role, anniversary, achievement',
      advice: 'General career or business advice with no personal story',
      promo: 'Promotion or ad: webinar, ebook, product pitch',
      other: 'None of the above, or too short to tell',
    },
    typeMult: { story: 1.25, contrarian: 1.3, howto: 1.15, milestone: 1.1, company_news: 0.9, hiring: 0.9, advice: 1.0, promo: 0.7, other: 0.9, question: 1.1 },
    defaultGoal: 'reach',
  },

  x: {
    label: 'X',
    maxChars: 2000,
    organic: 0.10,
    verbs: { score: 'Viral potential', empty: 'Viral potential' },
    dims: {
      hook: {
        label: 'Hook', hint: 'First-line scroll stopper',
        instructions: 'How strong is the opening line as a scroll-stopper?',
        criteria: [
          'Opens with filler or throat-clearing (oh my god, so, hey guys) and gives no reason to keep reading',
          'Opens with a topic but no payoff or curiosity gap',
          'Opens with a clear claim or curiosity gap that earns the second line',
          'First line alone could travel: a bold result, striking claim, or irresistible curiosity gap',
        ],
        tip: 'Lead with the payoff. On X the first line is the whole post; put the result or the claim there, not the setup.',
      },
      feeling: {
        label: 'Feeling', hint: 'Emotional charge',
        instructions: 'How much emotion does the post carry?',
        criteria: [
          'Flat, no emotional charge at all',
          'Mild tone but nothing that makes a reader feel something',
          'Genuinely emotive: excitement, awe, outrage, or delight comes through',
          'Overwhelming feeling that demands a reaction: awe, disbelief, or urgency',
        ],
        tip: 'Turn up the feeling. Excitement, awe, or outrage travels; flat recaps do not. Show your reaction, not just the news.',
      },
      repostable: {
        label: 'Repostable', hint: 'Worth sharing',
        instructions: 'How worth reposting is this?',
        criteria: [
          'Nothing worth reposting; a pure diary entry',
          'Mildly interesting but no self-contained takeaway',
          'Contains a quotable line or takeaway worth sharing',
          'Packaged to travel: a punchy standalone insight, stat, or rule',
        ],
        tip: "Give readers a takeaway they'd look smart reposting: a rule, a stat, or a one-line lesson.",
      },
      fit: {
        label: 'Fit', hint: 'Native X shape',
        instructions: 'How native is the shape of this post to the X feed?',
        criteria: [
          'Wrong shape for X: a wall of text with no line breaks, reads like an email',
          'Readable but unformatted: long lines, no structure',
          'Decent X shape: short lines, breathable, skimmable',
          'Native X shape: punchy lines, numbered or spaced for the feed',
        ],
        tip: 'Format for the feed: short lines, line breaks, one idea per line. Walls of text get scrolled past.',
      },
      specific: {
        label: 'Specific', hint: 'Names, numbers, proof',
        instructions: 'How concrete and specific is the post?',
        criteria: [
          'Totally vague: no names, numbers, or concrete details',
          'Topic named but no specifics, numbers, or proof',
          'Concrete: names a thing, a number, or a real result',
          'Ultra-specific: exact numbers, names, receipts, or screenshots promised',
        ],
        tip: "Add a number, a name, or a concrete result. Vague claims don't travel.",
      },
      fresh: {
        label: 'Fresh', hint: 'Non-obvious angle',
        instructions: 'How fresh and non-obvious is the angle?',
        criteria: [
          'A completely generic take anyone could post',
          'A familiar angle with only a slight twist',
          'A fresh angle or non-obvious insight',
          'Genuinely novel: surprises even heavy scrollers',
        ],
        tip: "This angle is familiar. What's the part only you can say, from something you actually did?",
      },
      clear: {
        label: 'Clear', hint: 'One-read point',
        instructions: 'How clear is the point of the post?',
        criteria: [
          "Confusing or incomplete; the reader can't tell the point",
          'The point is guessable but muddy',
          'Clear point, easy to follow',
          'Crystal clear: the point lands in one read',
        ],
        tip: 'Sharpen the point until it lands in one read. If a stranger must re-read it, rewrite it.',
      },
      replies: {
        label: 'Replies', hint: 'Reply magnet',
        instructions: 'How much does the post invite replies?',
        criteria: [
          'A closed statement with nothing to reply to',
          'Mildly replyable but asks nothing',
          'Invites replies: a question, a bold claim, or an open loop',
          'A reply magnet: a direct question plus a bold claim people must react to',
        ],
        tip: 'Raise the stakes. What here is surprising, or at odds with what people assume? End with a question or an open loop.',
      },
    },
    goals: {
      growth: {
        label: 'Growth',
        weights: { hook: 0.24, repostable: 0.18, feeling: 0.14, replies: 0.12, specific: 0.10, clear: 0.08, fresh: 0.08, fit: 0.06 },
      },
      authority: {
        label: 'Authority',
        weights: { specific: 0.18, fresh: 0.16, clear: 0.16, hook: 0.12, repostable: 0.12, replies: 0.12, feeling: 0.08, fit: 0.06 },
      },
      leads: {
        label: 'Leads',
        weights: { replies: 0.18, repostable: 0.16, hook: 0.14, specific: 0.14, clear: 0.14, feeling: 0.10, fresh: 0.08, fit: 0.06 },
      },
    },
    typeCriteria: {
      launch: 'Announcing something new: a release, launch, or drop',
      howto: 'Tutorial or explainer: how to do something, steps, a guide',
      list: 'A list: numbered tips, ways, lessons, or examples',
      take: 'An opinion or hot take on something',
      story: 'A personal story or build-in-public update',
      question: 'Asking the audience something',
      joke: 'A joke, meme, or shitpost',
      other: 'None of the above, or too short to tell',
    },
    typeMult: { take: 1.25, story: 1.2, joke: 1.2, howto: 1.15, list: 1.15, question: 1.1, launch: 1.0, other: 0.9 },
    defaultGoal: 'growth',
  },
};

function platformOf(p) {
  return PLATFORMS[p] ? p : 'linkedin';
}

function buildQuestions(platform) {
  const P = PLATFORMS[platform];
  const questions = {
    post_type: {
      type: 'choice',
      instructions: `What type of ${P.label} post is this? Judge by structure and intent.`,
      criteria: P.typeCriteria,
    },
  };
  if (platform === 'linkedin') {
    questions.is_fluff = {
      type: 'noul',
      instructions: 'This post reads like corporate fluff, buzzword filler, or generic AI-generated slop',
      criteria: {
        true: 'Buzzwords (thrilled, leverage, synergy, game-changer), hype with no substance, could be written by anyone',
        false: 'Concrete, human, specific voice with real substance',
      },
    };
    questions.asks_question = {
      type: 'noul',
      instructions: 'This post explicitly asks the reader a question or invites comments',
    };
  } else {
    questions.is_rage_bait = {
      type: 'noul',
      instructions: 'This post baits outrage: insults, dunking, or provocation engineered to farm angry replies',
      criteria: {
        true: 'Name-calling, sweeping insults, us-vs-them provocation, contempt for a group',
        false: 'Strong opinion argued in good faith, no contempt or insult',
      },
    };
    questions.is_ai_slop = {
      type: 'noul',
      instructions: 'This post reads like generic AI-generated slop rather than a human voice',
      criteria: {
        true: 'Buzzword soup (delve, landscape, unlock, elevate, game-changer), em-dash lists, hype with no lived detail',
        false: 'Concrete, specific, human voice with real detail',
      },
    };
    questions.is_ad = {
      type: 'noul',
      instructions: 'This post reads like a disguised ad, promo, or sales pitch',
      criteria: {
        true: 'Discount codes, buy-now language, sponsored tone, link-in-bio selling',
        false: 'No selling; shares news, ideas, or stories',
      },
    };
  }
  for (const [id, d] of Object.entries(P.dims)) {
    questions[id] = { type: 'score', instructions: d.instructions, criteria: d.criteria };
  }
  return questions;
}

function verdictFor(platform, score) {
  if (platform === 'x') {
    if (score < 25) return { label: 'Scroll past', color: 'red' };
    if (score < 55) return { label: 'Decent', color: 'yellow' };
    if (score < 80) return { label: 'Strong', color: 'green' };
    return { label: 'Viral', color: 'green' };
  }
  if (score < 25) return { label: 'Skip past', color: 'red' };
  if (score < 55) return { label: 'Solid', color: 'yellow' };
  if (score < 80) return { label: 'Standout', color: 'green' };
  return { label: 'Top 1%', color: 'green' };
}

// --- Local fallbacks (labelled, so the UI always responds offline) --------

function localFallback(platform, text) {
  const t = text.toLowerCase();
  const has = (...ws) => ws.some((w) => t.includes(w));
  const n = (v) => Math.max(0, Math.min(3, v));
  const P = PLATFORMS[platform];
  const scores = {};
  const answers = {};

  if (platform === 'linkedin') {
    const first210 = text.slice(0, 210);
    Object.assign(scores, {
      hook: n(1 + (has('?', 'mistake', 'fired', 'failed', 'truth', 'stop', 'secret') || /\d/.test(first210) ? 0.8 : 0) + (has('thrilled to announce', 'excited to share') ? -0.8 : 0)),
      story: n(0.6 + (has('i ', 'my ', 'we ', 'year', 'when i') ? 0.8 : 0)),
      insight: n(1 + (has('framework', 'lesson', 'rule', 'playbook', 'steps') ? 0.8 : 0)),
      readability: n(1 + (text.includes('\n\n') ? 0.8 : 0) + (text.length > 1500 ? -0.5 : 0.3)),
      specific: n(0.5 + (/\d/.test(text) ? 1.2 : 0)),
      authentic: n(1.5 - (has('thrilled', 'leverage', 'synergy', 'game-changer', 'delighted') ? 1 : 0)),
      cta: n(0.5 + (text.includes('?') ? 1 : 0) + (has('dm', 'comment', 'follow', 'link') ? 0.8 : 0)),
      dwell: n(1 + (text.split(/\s+/).length > 120 ? 0.8 : 0)),
    });
    Object.assign(answers, {
      post_type: {
        type: 'choice', choice: has('hiring', "we're hiring") ? 'hiring' : has('thrilled', 'announce', 'funding') ? 'company_news' : 'other',
        confidence: 0.4,
        probabilities: { story: 0.1, contrarian: 0.05, howto: 0.1, company_news: 0.1, hiring: 0.05, milestone: 0.05, advice: 0.15, promo: 0.05, other: 0.35 },
      },
      is_fluff: { type: 'noul', noul: has('thrilled to announce', 'excited to share', 'leverage', 'synergy') ? 0.8 : 0.2 },
      asks_question: { type: 'noul', noul: text.includes('?') ? 0.9 : 0.1 },
    });
  } else {
    Object.assign(scores, {
      hook: n(1 + (has('?', '!', 'how', 'why', 'stop', 'secret') ? 0.8 : 0) + (text.length > 60 ? 0.4 : -0.4)),
      feeling: n(1 + (has('insane', 'omg', 'wow', 'crazy', 'love', 'hate', '!', 'absolutely') ? 1 : 0)),
      repostable: n(0.6 + (has('how to', 'rule', 'lesson', 'tip', 'ways', 'steps') ? 1.2 : 0)),
      fit: n(1 + (text.includes('\n') ? 1 : 0) + (text.length < 280 ? 0.5 : -0.5)),
      specific: n(0.5 + (/\d/.test(text) ? 1.2 : 0) + (has('chatgpt', 'iphone', '$') ? 0.4 : 0)),
      fresh: n(1 + (has('just released', 'new', 'announced', 'breaking') ? 0.6 : 0)),
      clear: n(1.5 + (text.length > 12 ? 0.8 : -1)),
      replies: n(0.5 + (text.includes('?') ? 1.4 : 0) + (has('you', 'your') ? 0.4 : 0)),
    });
    Object.assign(answers, {
      post_type: {
        type: 'choice', choice: 'other', confidence: 0.4,
        probabilities: { launch: 0.1, howto: 0.1, list: 0.05, take: 0.1, story: 0.05, question: 0.05, joke: 0.05, other: 0.5 },
      },
      is_rage_bait: { type: 'noul', noul: has('idiot', 'stupid', 'dumb', 'everyone is wrong', 'worst', 'morons') ? 0.8 : 0.1 },
      is_ai_slop: { type: 'noul', noul: has('delve', 'landscape', 'furthermore', 'moreover', 'fast-paced', 'game-changer', 'unlock', 'elevate', 'tapestry', 'in conclusion') ? 0.8 : 0.15 },
      is_ad: { type: 'noul', noul: has('discount', 'buy now', 'link in bio', 'sponsored', 'sale', 'shop', 'code ', '% off') ? 0.85 : 0.1 },
    });
    if (has('how to', 'how you can', 'steps', 'guide')) answers.post_type = { ...answers.post_type, choice: 'howto' };
    else if (/^\d+\.|10 ways|tips|lessons/.test(t) || has('10 ways')) answers.post_type = { ...answers.post_type, choice: 'list' };
    else if (has('released', 'launch', 'announcing', 'just dropped')) answers.post_type = { ...answers.post_type, choice: 'launch' };
  }

  for (const [id, s] of Object.entries(scores)) {
    const lo = Math.floor(Math.min(2.999, s)), f = Math.min(2.999, s) - lo;
    const probs = { 0: 0, 1: 0, 2: 0, 3: 0 };
    probs[lo] = 1 - f; probs[Math.min(3, lo + 1)] = f;
    answers[id] = { type: 'score', score: s, confidence: 0.3, legend: { 0: 'low', 1: 'mid', 2: 'high', 3: 'top' }, probabilities: probs };
  }
  // silence unused
  void P;
  return answers;
}

// --- Small numeric helpers --------------------------------------------------

function toNum(v, dflt) { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : dflt; }
function roundNice(n) {
  if (n < 100) return Math.max(1, Math.round(n));
  if (n < 1000) return Math.round(n / 10) * 10;
  if (n < 10000) return Math.round(n / 100) * 100;
  return Math.round(n / 500) * 500;
}

// Estimated views = baseline x quality multiplier x format signals.
// Transparent heuristic in code: Jev judges quality, this projects reach.
// A rough range, not a prediction or guarantee.
function estimateReach(platform, base, followers, avgImp) {
  const P = PLATFORMS[platform];
  const f = toNum(followers, 1000);
  const avg = toNum(avgImp, 0);
  const baseline = avg > 0 ? avg : Math.max(50, f * P.organic);
  const quality = 0.3 + (base.score / 100) * 3.2;
  const mult = quality * (P.typeMult[base.postType?.choice] ?? 1)
    * (platform === 'linkedin'
      ? (1 + (base.asksQuestion / 100) * 0.15) * (1 - (base.fluff / 100) * 0.3)
      : (1 + ((base.dims?.replies?.value ?? 0) / 100) * 0.15) * (1 - ((base.flags?.aiSlop ?? 0) / 100) * 0.25));
  const est = baseline * mult;
  const pct = Math.round(P.organic * 100);
  return {
    low: roundNice(est * 0.6),
    high: roundNice(est * 1.7),
    upside: roundNice(est * 3.5),
    likesLow: roundNice(Math.max(1, est * 0.02)),
    likesHigh: roundNice(Math.max(2, est * 0.05)),
    multiplier: Math.round(mult * 10) / 10,
    baseline: roundNice(baseline),
    assumptions: avg > 0
      ? `your avg ${roundNice(avg).toLocaleString()} impressions/post`
      : `${f.toLocaleString()} followers x ${pct}% organic reach`,
  };
}

async function analyzeBase(platform, text, goal) {
  const P = PLATFORMS[platform];
  const started = Date.now();
  const g = P.goals[goal] ? goal : P.defaultGoal;
  let answers, model, usage, fallback = false, error = null;
  try {
    if (!API_KEY) throw new Error('Missing TYPESAFE_API_KEY');
    const upstreamRes = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ state: { post: text, goal: P.goals[g].label, platform }, model: MODEL, questions: buildQuestions(platform) }),
    });
    const raw = await upstreamRes.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = null; }
    if (!upstreamRes.ok) throw new Error(data?.message || data?.error || `Upstream ${upstreamRes.status}`);
    answers = data.answers; model = data.model; usage = data.usage;
  } catch (err) {
    answers = localFallback(platform, text);
    model = 'local-fallback';
    usage = { input_tokens: 0, output_tokens: 0 };
    fallback = true;
    error = String(err?.message || err);
  }

  const weights = P.goals[g].weights;
  const dims = {};
  let total = 0;
  for (const [id] of Object.entries(P.dims)) {
    const a = answers[id];
    const value = a ? Math.max(0, Math.min(100, (a.score / 3) * 100)) : 0;
    dims[id] = { value: Math.round(value), confidence: a?.confidence ?? 0, probabilities: a?.probabilities ?? {} };
    total += value * weights[id];
  }

  const type = answers.post_type || { choice: 'other', confidence: 0, probabilities: {} };
  const topTypes = Object.entries(type.probabilities || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, p]) => ({ key: k, prob: p }));

  const tips = Object.entries(dims)
    .sort((a, b) => a[1].value - b[1].value)
    .filter(([, v]) => v.value < 65)
    .slice(0, 4)
    .map(([id]) => P.dims[id].tip);

  let score, verdict;
  const out = {
    dims, tips, goal: g, platform,
    postType: { choice: type.choice, confidence: type.confidence ?? 0, top: topTypes },
    model, usage, fallback, error,
    latencyMs: 0,
  };

  if (platform === 'linkedin') {
    const fluff = answers.is_fluff?.noul ?? 0;
    const question = answers.asks_question?.noul ?? 0;
    score = Math.max(0, Math.min(100, Math.round(total - fluff * 12 + question * 4)));
    verdict = verdictFor(platform, score);
    if (fluff > 0.6) tips.unshift('Fluff alert: this reads corporate or AI-generated. Delete the buzzwords and add one sentence only you could write.');
    if (!tips.length) tips.push('This is ready to post. Publish, then reply to every comment in the first hour — early replies drive LinkedIn distribution.');
    out.fluff = Math.round(fluff * 100);
    out.asksQuestion = Math.round(question * 100);
  } else {
    const rage = answers.is_rage_bait?.noul ?? 0;
    const slop = answers.is_ai_slop?.noul ?? 0;
    const ad = answers.is_ad?.noul ?? 0;
    score = Math.max(0, Math.min(100, Math.round(total - rage * 8 - slop * 10 - ad * 6)));
    verdict = verdictFor(platform, score);
    if (!tips.length) tips.push('This is ready. Post it — then reply to every comment in the first hour to feed the algorithm.');
    if (rage > 0.6) tips.unshift('Rage-bait risk: dunking farms angry replies but burns trust. Argue the point without the contempt.');
    if (slop > 0.6) tips.unshift('AI-slop signal: this reads machine-written. Add one detail only you could know.');
    if (ad > 0.6) tips.unshift('Reads like an ad: disclose paid content and lead with value, not the pitch.');
    out.flags = { rageBait: Math.round(rage * 100), aiSlop: Math.round(slop * 100), ad: Math.round(ad * 100) };
  }

  out.score = score;
  out.verdict = verdict;
  out.tips = tips;
  out.latencyMs = Date.now() - started;
  return out;
}

const cache = new Map();

// ---------------------------------------------------------------------------

app.get('/api/config', (_req, res) => {
  res.json({
    model: MODEL,
    hasKey: Boolean(API_KEY),
    platforms: Object.fromEntries(Object.entries(PLATFORMS).map(([k, p]) => [k, {
      label: p.label,
      maxChars: p.maxChars,
      defaultGoal: p.defaultGoal,
      goals: Object.fromEntries(Object.entries(p.goals).map(([gk, gv]) => [gk, gv.label])),
      dims: Object.fromEntries(Object.entries(p.dims).map(([dk, dv]) => [dk, { label: dv.label, hint: dv.hint }])),
    }])),
  });
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { text, platform, goal, useCache, followers, avgImpressions } = req.body || {};
    const plat = platformOf(platform);
    const P = PLATFORMS[plat];
    if (!text || typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text required' });
    if (text.length > P.maxChars + 4000) return res.status(400).json({ error: `max ${P.maxChars} chars for ${P.label}` });
    const g = P.goals[goal] ? goal : P.defaultGoal;
    const key = `${plat}::${g}::${text.trim()}`;
    let base;
    if (useCache !== false && cache.has(key)) base = { ...cache.get(key), cached: true, latencyMs: 1 };
    else {
      base = await analyzeBase(plat, text, goal);
      if (cache.size > 200) cache.clear();
      cache.set(key, base);
    }
    res.json({ ...base, reach: estimateReach(plat, base, followers, avgImpressions) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// A/B compare: two texts, same platform + goal, winner decided in code.
app.post('/api/compare', async (req, res) => {
  try {
    const { a, b, platform, goal, followers, avgImpressions } = req.body || {};
    const plat = platformOf(platform);
    if (!a?.trim() || !b?.trim()) return res.status(400).json({ error: 'both a and b texts required' });
    const [ra, rb] = await Promise.all([analyzeBase(plat, a, goal), analyzeBase(plat, b, goal)]);
    ra.reach = estimateReach(plat, ra, followers, avgImpressions);
    rb.reach = estimateReach(plat, rb, followers, avgImpressions);
    res.json({ a: ra, b: rb, winner: ra.score >= rb.score ? 'a' : 'b', delta: Math.abs(ra.score - rb.score), platform: plat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`PostPulse: http://localhost:${PORT}`);
  console.log(`Proxying to ${API_URL} model=${MODEL} hasKey=${Boolean(API_KEY)}`);
});
