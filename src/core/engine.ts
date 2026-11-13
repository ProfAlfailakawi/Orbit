import type {
  AlertNotification,
  AlertSeverity,
  AppHealthStatus,
  AppRuntimeMode,
  CanaryTestResult,
  DataIntegrityState,
  EventCategory,
  FourStateSeparation,
  IncidentCaseFile,
  IncidentStatus,
  ObservabilityEye,
  PlatformLifecycleState,
  PlatformRecord,
  RadarEvent,
  SelfHealthMetrics,
} from './types.ts';

export const MANDATORY_CLAUDE_GUARDRAIL =
  '«البرامج تعمل في الإنتاج الآن، فلا تعبث بالمزايا الحالية أو المدفوعات أو الإشعارات أو الصلاحيات أو البيانات أو إعدادات النشر. افحص السبب أولاً، نفذ أقل تعديل ضروري بعد موافقتي، واختبر عدم حدوث أي تراجع. لا تدمج أو تنشر دون إذن صريح.»';

export function sanitizeTelemetryPayload(rawInput: string): {
  sanitized: string;
  redactionsCount: number;
} {
  if (!rawInput) return { sanitized: '', redactionsCount: 0 };
  let redactionsCount = 0;
  let text = rawInput;

  const patterns: Array<{ regex: RegExp; replacement: string }> = [
    {
      regex: /\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{10,}\b/g,
      replacement: '[REDACTED_GITHUB_TOKEN]',
    },
    {
      regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
      replacement: 'Bearer [REDACTED_TOKEN]',
    },
    {
      regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      replacement: '[REDACTED_JWT]',
    },
    {
      regex: /((?:password|passwd|secret|api_key|apikey|access_token|auth_token|card_number|cvv|iban)\s*[:=]\s*["']?)([^"'\s,&}]+)(["']?)/gi,
      replacement: '$1[REDACTED_SECRET]$3',
    },
    {
      regex: /\b(?:\d[ -]*?){13,19}\b/g,
      replacement: '[REDACTED_CARD_PAN]',
    },
    {
      regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      replacement: '[REDACTED_EMAIL]',
    },
    {
      regex: /(?:ignore\s+previous\s+instructions|system\s*prompt\s*:|rm\s+-rf\s+\/|DROP\s+TABLE\s+)/gi,
      replacement: '[BLOCKED_LOG_INJECTION_ATTEMPT]',
    },
  ];

  for (const { regex, replacement } of patterns) {
    text = text.replace(regex, () => {
      redactionsCount += 1;
      return replacement;
    });
  }

  return { sanitized: text, redactionsCount };
}

export function computeEventFingerprint(input: {
  appId: string;
  eventType: EventCategory;
  operationName: string;
  errorCode: string;
  safeErrorMessage: string;
}): string {
  const normalizedMessage = input.safeErrorMessage
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '<uuid>')
    .replace(/\b0x[0-9a-f]+\b/g, '<hex>')
    .replace(/\d+(?:\.\d+)?(?:ms|s|mb|kb|gb|%)?/g, '<num>')
    .trim();

  const rawKey = `${input.appId.toUpperCase()}::${input.eventType}::${input.operationName.toLowerCase()}::${input.errorCode.toUpperCase()}::${normalizedMessage}`;

  let hash = 2166136261;
  for (let i = 0; i < rawKey.length; i++) {
    hash ^= rawKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `FP-${input.appId.toUpperCase()}-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

export function classifyEventSignal(input: {
  errorCode: string;
  message: string;
  operationName: string;
  isSilentMismatch?: boolean;
  isUserVisible?: boolean;
  latencyMs?: number;
}): { category: EventCategory; severity: AlertSeverity; eyeLayer: ObservabilityEye } {
  const msg = `${input.errorCode} ${input.message} ${input.operationName}`.toLowerCase();

  if (
    input.isSilentMismatch ||
    msg.includes('silent') ||
    msg.includes('mismatch') ||
    msg.includes('unconfirmed_save')
  ) {
    return {
      category: 'Silent Failure',
      severity: 'High',
      eyeLayer: 'Eye 1: Client Experience',
    };
  }

  if (
    msg.includes('auth') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('dependabot') ||
    msg.includes('secret') ||
    msg.includes('cve')
  ) {
    return {
      category: 'Security Signal',
      severity: 'Critical',
      eyeLayer: 'Eye 2: Server & Infrastructure',
    };
  }

  if (
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('database') ||
    msg.includes('crash') ||
    msg.includes('fatal') ||
    msg.includes('unhandled')
  ) {
    return {
      category: 'Critical Failure',
      severity: 'Critical',
      eyeLayer:
        msg.includes('react') || msg.includes('window')
          ? 'Eye 1: Client Experience'
          : 'Eye 2: Server & Infrastructure',
    };
  }

  if (
    (input.latencyMs && input.latencyMs > 2500) ||
    msg.includes('timeout') ||
    msg.includes('slow') ||
    msg.includes('latency')
  ) {
    return {
      category: 'Performance Degradation',
      severity: 'Medium',
      eyeLayer: 'Eye 2: Server & Infrastructure',
    };
  }

  if (
    input.isUserVisible ||
    msg.includes('toast') ||
    msg.includes('ui_error') ||
    msg.includes('boundary')
  ) {
    return {
      category: 'User-Visible Error',
      severity: 'High',
      eyeLayer: 'Eye 1: Client Experience',
    };
  }

  if (
    msg.includes('workflow') ||
    msg.includes('action') ||
    msg.includes('deploy') ||
    msg.includes('build')
  ) {
    return {
      category: 'Warning',
      severity: 'Medium',
      eyeLayer: 'Eye 3: Code & Deployment',
    };
  }

  if (
    msg.includes('expected') ||
    msg.includes('normal') ||
    msg.includes('heartbeat')
  ) {
    return {
      category: 'Expected / Normal Event',
      severity: 'Informational',
      eyeLayer: 'Eye 2: Server & Infrastructure',
    };
  }

  return {
    category: 'Functional Error',
    severity: 'Medium',
    eyeLayer: 'Eye 1: Client Experience',
  };
}

export function evaluatePlatformHealth(params: {
  lifecycleState: PlatformLifecycleState;
  runtimeMode: AppRuntimeMode;
  connectionVerified: boolean;
  monitoringCoveragePct: number;
  fourState: FourStateSeparation;
  activeIncidentSeverities: AlertSeverity[];
  isLocalSessionActive?: boolean;
}): AppHealthStatus {
  if (params.lifecycleState === 'archived') return 'Archived';
  if (params.lifecycleState === 'paused' || params.lifecycleState === 'unlinked')
    return 'Paused';

  if (params.runtimeMode === 'github-local' || params.runtimeMode === 'local-only') {
    if (!params.isLocalSessionActive) {
      return 'Local / Not Running';
    }
  }

  if (!params.connectionVerified) {
    return 'Unknown';
  }

  if (
    params.activeIncidentSeverities.includes('Critical') ||
    params.activeIncidentSeverities.includes('High')
  ) {
    return 'Incident';
  }

  if (
    params.fourState.siteReachable === false &&
    params.runtimeMode !== 'github-local' &&
    params.runtimeMode !== 'local-only'
  ) {
    return 'Offline';
  }

  if (
    params.activeIncidentSeverities.includes('Medium') ||
    params.fourState.userJourneyHealthy === false ||
    params.fourState.deploymentSucceeded === false ||
    params.fourState.ciPassed === false
  ) {
    return 'Degraded';
  }

  if (
    params.monitoringCoveragePct < 100 ||
    params.fourState.ciPassed === null ||
    params.fourState.deploymentSucceeded === null ||
    params.fourState.siteReachable === null ||
    params.fourState.userJourneyHealthy === null
  ) {
    return 'Monitoring Gap';
  }

  return 'Healthy';
}

export function ingestAndCorrelateEvent(
  raw: {
    appId: string;
    environment?: 'production' | 'staging' | 'local' | 'canary-sandbox';
    operationName: string;
    errorCode: string;
    errorMessage: string;
    stackTrace?: string;
    releaseVersion?: string;
    commitSha?: string;
    browserOs?: string;
    detectionSource?: RadarEvent['detectionSource'];
    isSilentMismatch?: boolean;
    isUserVisible?: boolean;
    latencyMs?: number;
    dataIntegrity?: DataIntegrityState;
  },
  existingEvents: RadarEvent[],
  existingIncidents: IncidentCaseFile[],
  existingAlerts: AlertNotification[]
): {
  event: RadarEvent;
  incident: IncidentCaseFile;
  alert: AlertNotification | null;
  isDeduplicated: boolean;
  events: RadarEvent[];
  incidents: IncidentCaseFile[];
  alerts: AlertNotification[];
} {
  const now = new Date().toISOString();
  const sanitizedMsg = sanitizeTelemetryPayload(raw.errorMessage);
  const sanitizedStack = sanitizeTelemetryPayload(
    raw.stackTrace || 'No stack trace provided'
  );
  const totalRedactions = sanitizedMsg.redactionsCount + sanitizedStack.redactionsCount;

  const classification = classifyEventSignal({
    errorCode: raw.errorCode,
    message: sanitizedMsg.sanitized,
    operationName: raw.operationName,
    isSilentMismatch: raw.isSilentMismatch,
    isUserVisible: raw.isUserVisible,
    latencyMs: raw.latencyMs,
  });

  const fingerprint = computeEventFingerprint({
    appId: raw.appId,
    eventType: classification.category,
    operationName: raw.operationName,
    errorCode: raw.errorCode,
    safeErrorMessage: sanitizedMsg.sanitized,
  });

  const existingEventIdx = existingEvents.findIndex((e) => e.fingerprint === fingerprint);
  const existingIncidentIdx = existingIncidents.findIndex(
    (inc) => inc.fingerprint === fingerprint
  );

  let updatedEvents = [...existingEvents];
  let updatedIncidents = [...existingIncidents];
  let updatedAlerts = [...existingAlerts];
  let resultEvent: RadarEvent;
  let resultIncident: IncidentCaseFile;
  let resultAlert: AlertNotification | null = null;
  let isDeduplicated = false;

  if (existingEventIdx !== -1 && existingIncidentIdx !== -1) {
    isDeduplicated = true;
    const prevEvent = updatedEvents[existingEventIdx];
    resultEvent = {
      ...prevEvent,
      lastSeen: now,
      timestamp: now,
      occurrenceCount: prevEvent.occurrenceCount + 1,
      affectedSessions: prevEvent.affectedSessions + 1,
      sanitizedRedactions: prevEvent.sanitizedRedactions + totalRedactions,
    };
    updatedEvents[existingEventIdx] = resultEvent;

    const prevInc = updatedIncidents[existingIncidentIdx];
    const nextStatus: IncidentStatus =
      prevInc.status === 'Resolved' ? 'Reopened' : prevInc.status;

    resultIncident = {
      ...prevInc,
      lastSeen: now,
      occurrenceCount: prevInc.occurrenceCount + 1,
      affectedSessions: prevInc.affectedSessions + 1,
      status: nextStatus,
      technicallyVerified:
        nextStatus === 'Reopened' ? false : prevInc.technicallyVerified,
      history:
        nextStatus === 'Reopened'
          ? [
              ...prevInc.history,
              {
                timestamp: now,
                actor: 'ORBIT Radar Engine',
                fromStatus: 'Resolved',
                toStatus: 'Reopened',
                note: 'تمت إعادة فتح الحادثة تلقائياً بعد رصد تكرار نفس البصمة (Fingerprint).',
                isTechnicalVerification: false,
              },
            ]
          : prevInc.history,
    };
    updatedIncidents[existingIncidentIdx] = resultIncident;

    resultAlert = {
      id: `ALT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      incidentId: resultIncident.incidentId,
      appId: raw.appId,
      severity: classification.severity,
      title: `[مجمّع / Deduplicated] ${resultIncident.title}`,
      message: `تم دمج التكرار رقم #${resultIncident.occurrenceCount} في الحادثة ${resultIncident.incidentId} لمنع إغراق التنبيهات.`,
      createdAt: now,
      deliveryStatus: 'Suppressed (Dedup)',
      acknowledgedByOperator: false,
      escalationLevel: resultIncident.occurrenceCount >= 10 ? 2 : 1,
    };
    updatedAlerts = [resultAlert, ...updatedAlerts];
  } else {
    const eventId = `EVT-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 5)
      .toUpperCase()}`;
    const incidentId = `INC-${raw.appId.toUpperCase()}-${(
      existingIncidents.length + 101
    ).toString()}`;
    const correlationId = `CORR-${Math.random()
      .toString(36)
      .slice(2, 10)
      .toUpperCase()}`;

    resultEvent = {
      eventId,
      appId: raw.appId,
      environment: raw.environment || 'production',
      eventType: classification.category,
      severity: classification.severity,
      timestamp: now,
      releaseVersion: raw.releaseVersion || 'unknown',
      commitSha: raw.commitSha || 'unknown',
      browserOs: raw.browserOs || 'unknown',
      operationName: raw.operationName,
      errorCode: raw.errorCode,
      safeErrorMessage: sanitizedMsg.sanitized,
      sanitizedStackTrace: sanitizedStack.sanitized,
      correlationId,
      traceId: `TRC-${Date.now().toString(16)}`,
      firstSeen: now,
      lastSeen: now,
      occurrenceCount: 1,
      affectedSessions: 1,
      detectionSource: raw.detectionSource || 'ORBIT Sensor',
      eyeLayer: classification.eyeLayer,
      evidenceLinks: [`/radar/${incidentId}`, `/blackbox/${correlationId}`],
      incidentStatus: 'Detected',
      confidenceLevel: 'Confirmed (95%+)',
      fingerprint,
      dataIntegrity: raw.dataIntegrity || 'Live',
      sanitizedRedactions: totalRedactions,
    };

    resultIncident = {
      incidentId,
      fingerprint,
      appId: raw.appId,
      title: `${classification.category}: ${raw.operationName} (${raw.errorCode})`,
      summary: sanitizedMsg.sanitized,
      category: classification.category,
      severity: classification.severity,
      status: 'Detected',
      technicallyVerified: false,
      firstSeen: now,
      lastSeen: now,
      occurrenceCount: 1,
      affectedSessions: 1,
      impactScope: `تأثر عملية ${raw.operationName} في بيئة ${
        raw.environment || 'production'
      }`,
      confirmedEvidence: [
        `تم التقاط الحدث ${eventId} عبر ${resultEvent.detectionSource}`,
        `البصمة الرقمية الموحدة: ${fingerprint}`,
        `الرسالة المنقحة: ${sanitizedMsg.sanitized}`,
      ],
      probableHypotheses: [
        `احتمال تعارض في عقد البيانات (Schema/Contract) داخل العملية ${raw.operationName}`,
        `تغير سلوك مرتبط بالإصدار ${resultEvent.releaseVersion} (${resultEvent.commitSha})`,
      ],
      falsifiedHypotheses: [], // No exclusions without real verification.
      relatedReleases: [resultEvent.releaseVersion],
      suspectedCommitSha: resultEvent.commitSha,
      suspectedFiles: [], // No invented path until repository inspection.
      reproductionSteps: [
        `تشغيل بيئة الفحص لبرنامج ${raw.appId} على الإصدار ${resultEvent.releaseVersion}`,
        `تنفيذ العملية: ${raw.operationName}`,
        `مراقبة الاستجابة ورمز الخطأ ${raw.errorCode} مع معرف الربط ${correlationId}`,
      ],
      requiredTests: [
        `اختبار انحدار (Regression Test) للعملية ${raw.operationName}`,
        `اختبار عقد البيانات والتحقق من عدم حدوث Silent Failure`,
      ],
      proposedActions: [
        `مراجعة التغييرات في الـ Commit (${resultEvent.commitSha})`,
        `توليد مهمة فحص وإصلاح عبر Claude Mission Pack دون المساس بالإنتاج`,
      ],
      allowedModificationScope: [
        `ملف الخدمة المرتبط بـ ${raw.operationName} فقط مع إضافة اختبار وقائي`,
      ],
      acceptanceCriteria: [
        `اختفاء الخطأ ${raw.errorCode} في بيئة المختبر الموازي (Digital Twin)`,
        `نجاح كافة اختبارات القبول الحالية دون تراجع`,
      ],
      confidenceScore: 55, // Root cause not established by a telemetry event.
      eyeLayer: classification.eyeLayer,
      dataIntegrity: resultEvent.dataIntegrity,
      blackBoxFrames: [], // Await authenticated metadata; never fabricate an interaction replay.
      history: [
        {
          timestamp: now,
          actor: 'ORBIT Radar Engine',
          fromStatus: 'New',
          toStatus: 'Detected',
          note: `تم رصد الحادثة وتوليد ملف القضية الهندسية تلقائياً (${eventId}).`,
          isTechnicalVerification: false,
        },
      ],
    };

    resultAlert = {
      id: `ALT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      incidentId,
      appId: raw.appId,
      severity: classification.severity,
      title: `حادثة جديدة في ${raw.appId}: ${raw.operationName}`,
      message: sanitizedMsg.sanitized,
      createdAt: now,
      deliveryStatus: 'Dispatched In-App',
      acknowledgedByOperator: false,
      escalationLevel: classification.severity === 'Critical' ? 2 : 1,
    };

    updatedEvents = [resultEvent, ...updatedEvents];
    updatedIncidents = [resultIncident, ...updatedIncidents];
    updatedAlerts = [resultAlert, ...updatedAlerts];
  }

  return {
    event: resultEvent,
    incident: resultIncident,
    alert: resultAlert,
    isDeduplicated,
    events: updatedEvents,
    incidents: updatedIncidents,
    alerts: updatedAlerts,
  };
}

export function transitionIncidentStatus(
  incident: IncidentCaseFile,
  nextStatus: IncidentStatus,
  actor: string,
  note: string,
  technicalVerificationPassed: boolean = false
): IncidentCaseFile {
  const now = new Date().toISOString();
  const isVerified =
    nextStatus === 'Resolved'
      ? technicalVerificationPassed || incident.technicallyVerified
      : nextStatus === 'Verification'
      ? technicalVerificationPassed
      : incident.technicallyVerified;

  return {
    ...incident,
    status: nextStatus,
    technicallyVerified: isVerified,
    history: [
      ...incident.history,
      {
        timestamp: now,
        actor,
        fromStatus: incident.status,
        toStatus: nextStatus,
        note:
          nextStatus === 'Resolved' && !isVerified
            ? `${note} (تنبيه: إغلاق إداري — لم يتم توثيق التحقق التقني الآلي بعد)`
            : note,
        isTechnicalVerification: technicalVerificationPassed,
      },
    ],
  };
}

export type ClaudeMissionType = 'fix' | 'inspect' | 'tests' | 'report' | 'plan';

export function generateClaudeMissionPrompt(
  incident: IncidentCaseFile,
  platform: PlatformRecord,
  missionType: ClaudeMissionType = 'fix'
): string {
  const missionTitles: Record<ClaudeMissionType, string> = {
    fix: 'مهمة إصلاح هندسية محكومة (Claude Surgical Fix Mission)',
    inspect: 'مهمة فحص وتشخيص عميق للقضية (Root Cause Inspection Mission)',
    tests:
      'مهمة بناء اختبارات وقائية ومنع التراجع (Regression & Prevention Tests Mission)',
    report: 'تقرير حادثة هندسي موثق (Formal Incident Case Report)',
    plan: 'خطة تطوير وتحسين معماري آمن (Safe Architecture Improvement Plan)',
  };

  return `# ORBIT MISSION PACK — ${missionTitles[missionType]}
====================================================================
${MANDATORY_CLAUDE_GUARDRAIL}
====================================================================

## 1. هوية المشروع والمستودع
- **اسم البرنامج:** ${platform.codeName} (${platform.nameAr})
- **المستودع:** ${platform.owner}/${platform.repoName} (${platform.repoUrl})
- **الفرع الأساسي:** ${platform.defaultBranch}
- **التقنيات:** ${platform.techStack.join(' · ')}
- **بيئة التشغيل:** ${platform.runtimeMode}

## 2. ملخص الحادثة القضية (${incident.incidentId})
- **العنوان:** ${incident.title}
- **التصنيف والشدة:** ${incident.category} | Severity: ${incident.severity}
- **طبقة الرصد (Three Eyes):** ${incident.eyeLayer}
- **البصمة الموحدة (Fingerprint):** ${incident.fingerprint}
- **أول ظهور:** ${incident.firstSeen}
- **آخر ظهور:** ${incident.lastSeen}
- **مرات التكرار:** ${incident.occurrenceCount} (الجلسات المتأثرة تقريبياً: ${incident.affectedSessions})
- **نطاق التأثير:** ${incident.impactScope}
- **درجة الثقة في الأدلة:** ${incident.confidenceScore}%

## 3. الأدلة المؤكدة (Confirmed Evidence)
${incident.confirmedEvidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}

## 4. الفرضيات المحتملة وما تم استبعاده
- **الفرضيات المرجحة:**
${incident.probableHypotheses.map((h) => `  * ${h}`).join('\n')}
- **الفرضيات المستبعدة بالدليل:**
${incident.falsifiedHypotheses.map((f) => `  * ${f}`).join('\n')}

## 5. الإصدارات والملفات المحتمل ارتباطها
- **الإصدارات المرتبطة:** ${incident.relatedReleases.join(', ')}
- **آخر Commit مشتبه بارتباطه الزمني:** ${incident.suspectedCommitSha}
- **الملفات المحتملة للفحص:**
${incident.suspectedFiles.map((file) => `  * \`${file}\``).join('\n')}

## 6. خطوات إعادة الإنتاج (Reproduction Steps)
${incident.reproductionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## 7. نطاق التعديل المسموح والاختبارات المطلوبة
- **النطاق المسموح فقط:** ${incident.allowedModificationScope.join(' | ')}
- **الاختبارات الوقائية المطلوبة:**
${incident.requiredTests.map((t) => `  * ${t}`).join('\n')}
- **معايير قبول الإصلاح (Acceptance Criteria):**
${incident.acceptanceCriteria.map((c) => `  * ${c}`).join('\n')}

## 8. المطلوب تنفيذه الآن (${missionType.toUpperCase()})
${
  missionType === 'inspect'
    ? 'افحص الملفات المشتبه بها وسلسلة الاستدعاءات فقط دون كتابة أي تعديل، وقدم تشخيصاً مدعوماً بالأدلة.'
    : missionType === 'tests'
    ? 'اكتب اختبارات الوحدات واختبارات التكامل التي تعيد إنتاج المشكلة وتمنع تكرارها مستقبلاً دون المساس بمنطق الإنتاج.'
    : missionType === 'report'
    ? 'راجع هذا التقرير ووثّق الدروس المستفادة لإضافتها إلى الذاكرة الهندسية الدائمة (Engineering Memory).'
    : missionType === 'plan'
    ? 'اقترح خطة تحسين معمارية مرحلية منخفضة المخاطر مع تقدير الأثر والجهد.'
    : 'افحص السبب الجذري أولاً، ثم اعرض أقل تعديل جراحي ممكن (Minimal Diff) للموافقة عليه قبل أي تطبيق.'
}
`;
}

export function inspectRepositoryCapabilities(input: {
  owner: string;
  repoName: string;
  codeName: string;
  nameAr: string;
  description: string;
  runtimeMode: AppRuntimeMode;
  productionUrl?: string | null;
  techStack?: string[];
  defaultBranch?: string;
}): PlatformRecord {
  const now = new Date().toISOString();
  const isLocal =
    input.runtimeMode === 'github-local' || input.runtimeMode === 'local-only';
  const isNonGithub =
    input.runtimeMode === 'non-github-web' || input.runtimeMode === 'local-only';

  const inferredTech =
    input.techStack && input.techStack.length > 0
      ? input.techStack
      : isLocal
      ? ['TypeScript', 'Local Runtime', 'WebAudio / Canvas']
      : ['React', 'TypeScript', 'Node.js', 'Tailwind CSS'];

  const boundaries: string[] = [];
  if (isLocal) {
    boundaries.push(
      'يعمل محلياً: تتم المراقبة خلال جلسات التشغيل النشطة فقط، ولا يخضع لفحص HTTP خارجي دائم.'
    );
  }
  if (isNonGithub) {
    boundaries.push(
      'برنامج غير مرتبط بـ GitHub: تتوفر مراقبة Client Sensor وفحص الاستجابة، ولا تتوفر بيانات Commits أو GitHub Actions.'
    );
  }
  if (!isLocal && !isNonGithub) {
    boundaries.push(
      'قراءة آمنة فقط (Read-Only GitHub API) + استقبال أحداث ORBIT Sensor عند تفعيله بموافقة.'
    );
  }

  return {
    id: input.codeName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    codeName: input.codeName.toUpperCase(),
    nameAr: input.nameAr,
    description: input.description,
    owner: isNonGithub ? 'Local/External' : input.owner || 'ProfAlfailakawi',
    repoName: isNonGithub ? input.codeName.toLowerCase() : input.repoName,
    repoUrl: isNonGithub
      ? 'N/A (Non-GitHub Application)'
      : `https://github.com/${input.owner || 'ProfAlfailakawi'}/${input.repoName}`,
    defaultBranch: input.defaultBranch || 'main',
    techStack: inferredTech,
    runtimeMode: input.runtimeMode,
    environments: isLocal ? ['local-workstation'] : ['production', 'staging'],
    productionUrl: isLocal ? null : input.productionUrl || null,
    productionUrlVerified: false,
    apiServices: isLocal ? ['Local IPC / Audio Engine'] : ['REST API', 'Auth Guard'],
    databasesAndIntegrations: ['Configured Without Storing Secrets'],
    sensitiveFunctions: ['حفظ البيانات الأساسية', 'المصادقة والجلسات'],
    healthStatus: isLocal ? 'Local / Not Running' : 'Unknown',
    lifecycleState: 'active',
    dataIntegrity: 'Not Configured',
    monitoringCoveragePct: 35,
    monitoringBoundaries: boundaries,
    connectionStatus: isLocal ? 'Local Session Telemetry' : 'Pending Credentials',
    connectionVerified: false,
    lastVerifiedEvidence: 'بانتظار فحص الاتصال الأولي والتحقق من المصادر',
    lastVerifiedTimestamp: now,
    fourState: {
      ciPassed: null,
      deploymentSucceeded: null,
      siteReachable: null,
      userJourneyHealthy: null,
    },
    releaseShield: 'Insufficient Evidence',
    releaseConfidencePct: 0,
    existingSystems: [],
    ecgMetrics: [
      {
        id: `ecg-${input.codeName.toLowerCase()}-1`,
        nameAr: 'نسبة نجاح العمليات الأساسية',
        nameEn: 'Core Operation Success',
        currentValue: 99.2,
        baselineValue: 99.0,
        unit: '%',
        measurementWindow: 'آخر 24 ساعة',
        sampleSize: 120,
        confidenceLevel: 'Medium',
        isAnomalous: false,
        dataIntegrity: 'Demo',
        sparkline: [99.1, 99.2, 99.0, 99.3, 99.2, 99.2],
      },
    ],
    journeys: [
      {
        id: `jrn-${input.codeName.toLowerCase()}-1`,
        appId: input.codeName.toUpperCase(),
        name: 'الرحلة الأساسية للمستخدم',
        category: 'Core Flow',
        overallSuccessRate: 98.5,
        sampleCount: 85,
        lastVerified: now,
        dataIntegrity: 'Demo',
        steps: [
          {
            stepNumber: 1,
            name: 'فتح الواجهة الأساسية',
            completionRate: 100,
            dropOffRate: 0,
            silentFailureSuspected: false,
            status: 'Nominal',
            notes: 'استجابة طبيعية',
          },
          {
            stepNumber: 2,
            name: 'تنفيذ العملية وحفظ النتيجة',
            completionRate: 98.5,
            dropOffRate: 1.5,
            silentFailureSuspected: false,
            status: 'Nominal',
            notes: 'تم التحقق من اكتمال العملية',
          },
        ],
      },
    ],
    featuresDna: [
      {
        id: `dna-${input.codeName.toLowerCase()}-1`,
        appId: input.codeName.toUpperCase(),
        featureName: 'الوحدة الأساسية للبرنامج',
        purpose: input.description,
        usagePath: '/main -> action -> confirm',
        relatedFiles: ['src/App.tsx'],
        protectingTests: ['smoke.test.ts'],
        sensitivity: 'High',
        lastVerifiedSuccess: now,
        recentAffectingChanges: [],
        status: 'Verified',
      },
    ],
    recentRuns: [],
    recentCommits: [],
    createdAt: now,
    isCustomAdded: true,
  };
}

export function verifyPlatformConnection(
  platform: PlatformRecord,
  evidence?: { repositoryReachable: boolean; checkedAt?: string }
): PlatformRecord {
  // A repository metadata response proves repository access, NOT production health.
  // Without external evidence we MUST NOT infer CI, deploy, site uptime or user journeys.
  const isGitHub = platform.runtimeMode === 'github-web' || platform.runtimeMode === 'github-local';
  if (!isGitHub || !evidence?.repositoryReachable) {
    return {
      ...platform,
      connectionVerified: false,
      connectionStatus: 'Pending Credentials',
      dataIntegrity: 'Not Configured',
      monitoringCoveragePct: 0,
      healthStatus: platform.runtimeMode === 'local-only' ? 'Local / Not Running' : 'Monitoring Gap',
      fourState: { ciPassed: null, deploymentSucceeded: null, siteReachable: null, userJourneyHealthy: null },
      releaseShield: 'Insufficient Evidence',
      releaseConfidencePct: 0,
      lastVerifiedEvidence: '',
      lastVerifiedTimestamp: '',
    };
  }

  return {
    ...platform,
    connectionVerified: true,
    connectionStatus: 'Connected (Read-Only)',
    dataIntegrity: 'Live',
    monitoringCoveragePct: 0,
    healthStatus: 'Monitoring Gap',
    fourState: { ciPassed: null, deploymentSucceeded: null, siteReachable: null, userJourneyHealthy: null },
    releaseShield: 'Insufficient Evidence',
    releaseConfidencePct: 0,
    lastVerifiedEvidence: 'GitHub REST repository metadata read succeeded; production monitoring not verified.',
    lastVerifiedTimestamp: evidence.checkedAt || new Date().toISOString(),
  };
}

export function transitionPlatformLifecycle(
  platforms: PlatformRecord[],
  targetId: string,
  nextLifecycle: PlatformLifecycleState
): PlatformRecord[] {
  return platforms.map((p) => {
    if (p.id !== targetId && p.codeName !== targetId) return p;

    const connectionStatus: PlatformRecord['connectionStatus'] =
      nextLifecycle === 'paused'
        ? 'Paused'
        : nextLifecycle === 'unlinked'
        ? 'Unlinked'
        : p.runtimeMode === 'github-local' || p.runtimeMode === 'local-only'
        ? 'Local Session Telemetry'
        : p.connectionVerified
        ? 'Connected (Read-Only)'
        : 'Pending Credentials';

    const healthStatus = evaluatePlatformHealth({
      lifecycleState: nextLifecycle,
      runtimeMode: p.runtimeMode,
      connectionVerified: p.connectionVerified,
      monitoringCoveragePct: p.monitoringCoveragePct,
      fourState: p.fourState,
      activeIncidentSeverities: [],
      isLocalSessionActive: p.runtimeMode === 'github-local' ? false : undefined,
    });

    return {
      ...p,
      lifecycleState: nextLifecycle,
      connectionStatus,
      healthStatus,
    };
  });
}

export function purgePlatformHistory(
  targetAppId: string,
  confirmationToken: string,
  state: {
    events: RadarEvent[];
    incidents: IncidentCaseFile[];
    alerts: AlertNotification[];
  }
): {
  purged: boolean;
  events: RadarEvent[];
  incidents: IncidentCaseFile[];
  alerts: AlertNotification[];
} {
  const expectedToken = `CONFIRM-PURGE-${targetAppId.toUpperCase()}`;
  if (confirmationToken.trim().toUpperCase() !== expectedToken) {
    return { purged: false, ...state };
  }

  return {
    purged: true,
    events: state.events.filter(
      (e) => e.appId.toUpperCase() !== targetAppId.toUpperCase()
    ),
    incidents: state.incidents.filter(
      (i) => i.appId.toUpperCase() !== targetAppId.toUpperCase()
    ),
    alerts: state.alerts.filter(
      (a) => a.appId.toUpperCase() !== targetAppId.toUpperCase()
    ),
  };
}

/* ============================================================================
 * 10. SECTION 19: SELF-LEARNING ENGINEERING MEMORY GUARD
 * "لا تجعل النظام يتعلم من استنتاجات غير مؤكدة باعتبارها حقائق"
 * ============================================================================ */

export function upsertVerifiedEngineeringMemory(
  existingMemory: Array<{
    id: string;
    appId: string;
    incidentId: string;
    problemTitle: string;
    confirmedRootCause: string;
    disprovenHypotheses: string[];
    verifiedFixSummary: string;
    preventionTestAdded: string;
    lessonsLearned: string;
    recurringPatternTag: string;
    recordedAt: string;
    verifiedBy: string;
  }>,
  payload: {
    id?: string;
    appId: string;
    incidentId: string;
    problemTitle: string;
    confirmedRootCause: string;
    disprovenHypotheses: string[];
    verifiedFixSummary: string;
    preventionTestAdded: string;
    lessonsLearned: string;
    recurringPatternTag: string;
    isConfirmedByEvidence: boolean;
  }
): {
  accepted: boolean;
  reason?: string;
  memory: typeof existingMemory;
} {
  if (!payload.isConfirmedByEvidence) {
    return {
      accepted: false,
      reason:
        'رفض الحفظ كحقيقة هندسية (Section 19): لا يجوز للنظام التعلم من استنتاجات أو فرضيات غير مؤكدة بالدليل التقني.',
      memory: existingMemory,
    };
  }
  if (!payload.confirmedRootCause.trim() || !payload.preventionTestAdded.trim()) {
    return {
      accepted: false,
      reason: 'يجب توثيق السبب الجذري المؤكد واسم الاختبار الوقائي قبل اعتماد السجل في الذاكرة الهندسية.',
      memory: existingMemory,
    };
  }

  const sanitizedCause = sanitizeTelemetryPayload(payload.confirmedRootCause).sanitized;
  const sanitizedFix = sanitizeTelemetryPayload(payload.verifiedFixSummary).sanitized;
  const now = new Date().toISOString();

  if (payload.id && existingMemory.some((m) => m.id === payload.id)) {
    const updated = existingMemory.map((m) =>
      m.id === payload.id
        ? {
            ...m,
            appId: payload.appId,
            incidentId: payload.incidentId,
            problemTitle: payload.problemTitle.trim(),
            confirmedRootCause: sanitizedCause,
            disprovenHypotheses: payload.disprovenHypotheses,
            verifiedFixSummary: sanitizedFix,
            preventionTestAdded: payload.preventionTestAdded.trim(),
            lessonsLearned: payload.lessonsLearned.trim(),
            recurringPatternTag: payload.recurringPatternTag.trim() || 'General',
            recordedAt: now,
          }
        : m
    );
    return { accepted: true, memory: updated };
  }

  const newEntry = {
    id: `MEM-${Date.now().toString(36).toUpperCase()}`,
    appId: payload.appId,
    incidentId: payload.incidentId || 'MANUAL-AUDIT',
    problemTitle: payload.problemTitle.trim(),
    confirmedRootCause: sanitizedCause,
    disprovenHypotheses: payload.disprovenHypotheses,
    verifiedFixSummary: sanitizedFix,
    preventionTestAdded: payload.preventionTestAdded.trim(),
    lessonsLearned: payload.lessonsLearned.trim(),
    recurringPatternTag: payload.recurringPatternTag.trim() || 'Verified Pattern',
    recordedAt: now,
    verifiedBy: 'ProfAlfailakawi',
  };

  return {
    accepted: true,
    memory: [newEntry, ...existingMemory],
  };
}
