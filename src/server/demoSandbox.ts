/**
 * الوضع التجريبي المعزول لأوربت (للزوّار ومراجعي المتجر) — على نموذج مِراس.
 *
 * مبدأ العزل: هذه الوحدة **لا تستورد أي حالة حقيقية** (لا منصّات ولا أحداث ولا توكنات
 * ولا GitHub ولا Cloud Run ولا Firestore). البوابة تُركَّب أول ما يُركَّب على `/api`،
 * وأي طلب يحمل ترويسة `x-orbit-demo` صحيحة يُجاب منها وحدها من بيانات وهمية، ثم
 * ينتهي الطلب هنا: لا `next()` أبدًا. فلا يمكن لمسار حقيقي (حساس أو غيره) أن يُنفَّذ
 * لطلب تجريبي، ومهما أُضيف من مسارات لاحقًا فهي غير متاحة للتجريبي لأن القاعدة
 * «قائمة سماح» لا «قائمة منع».
 */
import crypto from 'crypto';
import type express from 'express';
import type { PlatformRecord } from '../core/types.ts';

export const DEMO_HEADER = 'x-orbit-demo';
/** نفس صيغة مِراس: demo_ + 32 بايت بالست عشري. */
export const DEMO_ID_PATTERN = /^demo_[0-9a-f]{64}$/;
export const DEMO_TTL_MS = 30 * 60_000;
export const DEMO_MAX_SANDBOXES = 200;
const DEMO_MAX_ADDED = 10;
const ENTER_WINDOW_MS = 15 * 60_000;
const ENTER_MAX_PER_WINDOW = 20;

/** مفتاح الإيقاف: يعمل افتراضيًا، ويُعطَّل بـ ORBIT_DEMO_ENABLED=0|false|off|no. */
export function demoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !/^(0|false|off|no|disabled)$/i.test(String(env.ORBIT_DEMO_ENABLED ?? '').trim());
}

const iso = (offsetMs: number, now: number) => new Date(now - offsetMs).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

function basePlatform(id: string, codeName: string, nameAr: string, now: number): PlatformRecord {
  return {
    id, codeName, nameAr,
    description: 'برنامج وهمي لأغراض العرض التجريبي فقط.',
    owner: 'demo', repoName: id, repoUrl: '', defaultBranch: 'main',
    techStack: ['React', 'Node.js'],
    runtimeMode: 'non-github-web', environments: ['production'],
    productionUrl: `https://${id}.demo.invalid`, productionUrlVerified: true,
    apiServices: [], databasesAndIntegrations: [], sensitiveFunctions: [],
    healthStatus: 'Healthy', lifecycleState: 'active', dataIntegrity: 'Live',
    monitoringCoveragePct: 90, monitoringBoundaries: ['بيانات وهمية للعرض'],
    connectionStatus: 'Connected (Read-Only)', connectionVerified: true,
    lastVerifiedEvidence: 'بيانات تجريبية مصطنعة', lastVerifiedTimestamp: iso(20 * MIN, now),
    fourState: { ciPassed: true, deploymentSucceeded: true, siteReachable: true, userJourneyHealthy: true },
    releaseShield: 'Ready', releaseConfidencePct: 92,
    existingSystems: [], ecgMetrics: [], journeys: [], featuresDna: [],
    recentRuns: [], recentCommits: [],
    siteCheckedAt: iso(15 * MIN, now), siteLastOkAt: iso(15 * MIN, now),
    vitals: [{ at: iso(2 * HOUR, now), ms: 420, bytes: 180_000 }, { at: iso(15 * MIN, now), ms: 440, bytes: 181_000 }],
    createdAt: iso(30 * 24 * HOUR, now),
  };
}

/** بيانات وهمية كاملة، تُبنى من جديد لكل زائر (حتمية الشكل، طازجة التواريخ). */
export function buildDemoState(now = Date.now()) {
  const run = (n: number, status: 'success' | 'failure', msg: string, ago: number) => ({
    id: `demo-run-${n}`, workflowName: 'CI (تجريبي)', branch: 'main', commitSha: `de${n}c0de`.padEnd(7, '0'),
    commitMessage: msg, status, hasSubJobWarning: false, durationSec: 95 + n * 7, timestamp: iso(ago, now), dataIntegrity: 'Live' as const,
  });
  const commit = (sha: string, msg: string, ago: number, files: string[]) => ({
    sha, author: 'مطوّر تجريبي', message: msg, timestamp: iso(ago, now), branch: 'main',
    changedFiles: files, riskLevel: 'Low' as const, dataIntegrity: 'Live' as const,
  });

  const noor = { ...basePlatform('demo-noor', 'DEMO-NOOR', 'أكاديمية النور (تجريبي)', now), runtimeMode: 'github-web' as const };
  noor.recentRuns = [run(1, 'success', 'تحسين صفحة الدخول', 3 * HOUR), run(2, 'success', 'تحديث الاعتماديات', 26 * HOUR)];
  noor.recentCommits = [commit('de1c0de', 'تحسين صفحة الدخول', 3 * HOUR, ['src/Login.tsx'])];

  const oasis = { ...basePlatform('demo-oasis', 'DEMO-OASIS', 'متجر الواحة (تجريبي)', now), runtimeMode: 'github-web' as const };
  oasis.fourState = { ciPassed: false, deploymentSucceeded: true, siteReachable: true, userJourneyHealthy: true };
  oasis.healthStatus = 'Incident';
  oasis.recentRuns = [run(3, 'failure', 'تعديل سلة الشراء', 40 * MIN), run(4, 'success', 'إصلاح الشعار', 20 * HOUR)];
  oasis.recentCommits = [commit('de3c0de', 'تعديل سلة الشراء', 45 * MIN, ['src/cart.ts', 'src/Checkout.tsx'])];

  const gate = basePlatform('demo-gate', 'DEMO-GATE', 'بوابة الخدمات (تجريبي)', now);
  gate.serverErrors = [
    { text: 'Error: connection timeout to upstream (مثال وهمي)', count: 14, lastAt: iso(12 * MIN, now), peak: 6, revision: 'demo-gate-00042', serving: true },
    { text: 'TypeError: Cannot read properties of undefined (مثال وهمي)', count: 3, lastAt: iso(50 * MIN, now), peak: 2, revision: 'demo-gate-00042', serving: true },
  ];
  gate.serverLogsCheckedAt = iso(10 * MIN, now);

  const slow = basePlatform('demo-pulse', 'DEMO-PULSE', 'نبض الأخبار (تجريبي)', now);
  slow.siteProblems = ['صفحة فرعية تعرض خطأ 500 (مثال وهمي)'];
  slow.siteCheckedAt = iso(8 * MIN, now);
  slow.healthStatus = 'Degraded';

  const notes = { ...basePlatform('demo-notes', 'DEMO-NOTES', 'مفكرة محلية (تجريبي)', now), runtimeMode: 'local-only' as const, productionUrl: null, productionUrlVerified: false };
  notes.healthStatus = 'Local / Not Running';

  return {
    platforms: [noor, oasis, gate, slow, notes],
    events: [] as unknown[], incidents: [] as unknown[], alerts: [] as unknown[],
    silentFailures: [] as unknown[], changeImpacts: [] as unknown[], crossAppPatterns: [] as unknown[],
    engineeringMemory: [] as unknown[], innovations: [] as unknown[], selfHealth: {} as Record<string, unknown>,
    costGuard: {} as Record<string, unknown>, discoveredCandidates: [] as unknown[], featureMatrix: [] as unknown[],
    acceptanceCriteria: [] as unknown[], canaryHistory: [] as unknown[], auditLogs: [] as unknown[],
    hasGithubTokenConfigured: true,
    githubTokenExpiresAt: null as string | null,
    demo: true,
  };
}
type DemoState = ReturnType<typeof buildDemoState>;

interface Sandbox { state: DemoState; expiresAt: number }

/** صناديق في ذاكرة العملية فقط: لا قرص ولا Firestore. */
export function createDemoStore(ttlMs = DEMO_TTL_MS, maxSandboxes = DEMO_MAX_SANDBOXES) {
  const boxes = new Map<string, Sandbox>();
  const sweep = (now: number) => { for (const [id, box] of boxes) if (box.expiresAt <= now) boxes.delete(id); };
  return {
    size: () => { sweep(Date.now()); return boxes.size; },
    create(id: string, now = Date.now()): boolean {
      sweep(now);
      if (boxes.has(id)) return true;
      if (boxes.size >= maxSandboxes) return false;
      boxes.set(id, { state: buildDemoState(now), expiresAt: now + ttlMs });
      return true;
    },
    get(id: string, now = Date.now()): DemoState | null {
      const box = boxes.get(id);
      if (!box) return null;
      if (box.expiresAt <= now) { boxes.delete(id); return null; }
      return box.state;
    },
    drop: (id: string) => { boxes.delete(id); },
  };
}

const DEMO_EXPLAIN = {
  mode: 'rules', urgency: 'يمكن تأجيلها',
  meaning: 'هذا شرح تجريبي ثابت: البيانات وهمية ولا يوجد برنامج حقيقي خلفها.',
  action: 'لا شيء مطلوب. هذه بيئة عرض معزولة.',
};

export function readDemoId(req: express.Request): string {
  const raw = req.headers[DEMO_HEADER];
  const value = String((Array.isArray(raw) ? raw[0] : raw) || '').trim();
  return DEMO_ID_PATTERN.test(value) ? value : '';
}

/** البوابة. تُركَّب أولًا على `/api` — انظر server.ts. */
export function createDemoGate(options: { enabled?: () => boolean; store?: ReturnType<typeof createDemoStore> } = {}) {
  const enabled = options.enabled ?? (() => demoEnabled());
  const store = options.store ?? createDemoStore();
  const enterHits = new Map<string, { count: number; resetAt: number }>();

  const gate: express.RequestHandler = (req, res, next) => {
    const path = req.path;
    const method = req.method;

    if (path === '/demo/config' && method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      return void res.json({ enabled: enabled(), ttlMs: DEMO_TTL_MS });
    }

    if (path === '/demo/enter' && method === 'POST') {
      res.setHeader('Cache-Control', 'no-store');
      if (!enabled()) return void res.status(404).json({ error: 'البيئة التجريبية غير مفعّلة في هذا النشر.' });
      const now = Date.now();
      const key = req.ip || 'unknown';
      const hit = enterHits.get(key);
      if (!hit || hit.resetAt <= now) enterHits.set(key, { count: 1, resetAt: now + ENTER_WINDOW_MS });
      else if (++hit.count > ENTER_MAX_PER_WINDOW) return void res.status(429).json({ error: 'طلبات كثيرة على البيئة التجريبية. أعد المحاولة بعد قليل.' });
      if (enterHits.size > 5000) for (const [k, v] of enterHits) if (v.resetAt <= now) enterHits.delete(k);
      const sessionId = `demo_${crypto.randomBytes(32).toString('hex')}`;
      if (!store.create(sessionId, now)) return void res.status(503).json({ error: 'البيئة التجريبية مشغولة الآن بعدد الزوّار الأقصى. أعد المحاولة بعد قليل.' });
      return void res.json({ ok: true, demo: true, sessionId, ttlMs: DEMO_TTL_MS });
    }

    const id = readDemoId(req);
    // بلا ترويسة تجريبية: المسارات الحقيقية كما هي، لم يتغيّر فيها شيء.
    if (!id) {
      if (req.headers[DEMO_HEADER] !== undefined) return void res.status(400).json({ error: 'معرّف تجريبي غير صالح.', demo: true });
      return next();
    }

    // من هنا: الطلب تجريبي. لا يخرج منه `next()` أبدًا.
    res.setHeader('Cache-Control', 'no-store');
    if (!enabled()) return void res.status(404).json({ error: 'البيئة التجريبية غير مفعّلة في هذا النشر.', demo: true });
    // ضاع الصندوق (انتهى الوقت أو أُعيد تشغيل النسخة): يُعاد بناؤه فارغًا من الوهمي نفسه.
    let state = store.get(id);
    if (!state) {
      if (!store.create(id)) return void res.status(503).json({ error: 'البيئة التجريبية مشغولة الآن.', demo: true });
      state = store.get(id)!;
    }

    if (path === '/auth/session' && method === 'GET') return void res.json({ authenticated: true, demo: true });
    if (path === '/auth/logout' && method === 'POST') { store.drop(id); return void res.json({ authenticated: false }); }
    if (path === '/version' && method === 'GET') return void res.json({ build: process.env.ORBIT_BUILD_ID || 'development' });
    if (path === '/state' && method === 'GET') return void res.json(state);
    if (path === '/logos' && method === 'GET') return void res.json({ logos: {} });
    if (path === '/logos/refresh' && method === 'POST') return void res.json({ logos: {}, remaining: 0 });
    if (path === '/sites' && method === 'GET') return void res.json({ sites: [] });
    if (path === '/sites/refresh' && method === 'POST') return void res.json({ remaining: 0, sites: [] });
    if (path === '/push/key' && method === 'GET') return void res.status(404).json({ error: 'التنبيهات غير متاحة في الوضع التجريبي.', demo: true });
    if (path === '/explain' && method === 'POST') return void res.json(DEMO_EXPLAIN);

    // أزرار «تحديث»: لا شبكة ولا GitHub — تُحدّث ختم الوقت داخل الصندوق وحده.
    if ((path === '/watch/run' || path === '/github/sync') && method === 'POST') {
      const now = Date.now();
      for (const p of state.platforms) { p.lastVerifiedTimestamp = new Date(now).toISOString(); p.siteCheckedAt = new Date(now).toISOString(); }
      return void res.json({
        ok: true, demo: true, platforms: state.platforms,
        syncedResults: state.platforms.map(p => ({ id: p.id, integrity: 'Live' })),
      });
    }

    if (path === '/fleet/add' && method === 'POST') {
      const body = (req.body || {}) as Record<string, unknown>;
      const nameAr = String(body.nameAr || '').trim().slice(0, 60);
      if (nameAr.length < 2) return void res.status(400).json({ error: 'اكتب اسم البرنامج أولاً.', demo: true });
      if (state.platforms.length >= 5 + DEMO_MAX_ADDED) return void res.status(400).json({ error: 'بلغت الحد الأقصى في الوضع التجريبي.', demo: true });
      const pid = `demo-added-${crypto.randomBytes(4).toString('hex')}`;
      // الرابط لا يُقرأ ولا يُفحص: لا يُستعمل أي شيء من المدخلات سوى الاسم.
      const added = { ...basePlatform(pid, pid.toUpperCase(), `${nameAr} (تجريبي)`, Date.now()), isCustomAdded: true };
      state.platforms.push(added);
      return void res.json({ ok: true, demo: true, platform: added, platforms: state.platforms });
    }
    const lifecycle = path.match(/^\/fleet\/([\w-]{1,80})\/lifecycle$/);
    if (lifecycle && method === 'POST') {
      const target = state.platforms.find(p => p.id === lifecycle[1]);
      if (!target) return void res.status(404).json({ error: 'البرنامج غير موجود.', demo: true });
      target.lifecycleState = 'unlinked';
      return void res.json({ ok: true, demo: true, platforms: state.platforms });
    }

    // كل ما عداه (حساسات، إحداث، بث، ذكاء، حالة...): مرفوض صراحة. لا تمرير.
    return void res.status(403).json({ error: 'غير متاح في الوضع التجريبي.', demo: true });
  };
  return { gate, store };
}
