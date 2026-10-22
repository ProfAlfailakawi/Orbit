export type DataIntegrityState =
  | 'Live'
  | 'Cached'
  | 'Demo'
  | 'Unavailable'
  | 'Not Configured';

export type AppHealthStatus =
  | 'Healthy'
  | 'Degraded'
  | 'Incident'
  | 'Offline'
  | 'Unknown'
  | 'Monitoring Gap'
  | 'Local / Not Running'
  | 'Paused'
  | 'Archived';

export type AppRuntimeMode =
  | 'github-web'
  | 'github-local'
  | 'non-github-web'
  | 'local-only';

export type PlatformLifecycleState =
  | 'active'
  | 'paused'
  | 'archived'
  | 'unlinked';

export type EventCategory =
  | 'Critical Failure'
  | 'Functional Error'
  | 'Performance Degradation'
  | 'Security Signal'
  | 'User-Visible Error'
  | 'Silent Failure'
  | 'Expected / Normal Event'
  | 'Warning'
  | 'Unknown / Needs Investigation';

export type AlertSeverity =
  | 'Critical'
  | 'High'
  | 'Medium'
  | 'Low'
  | 'Informational';

export type IncidentStatus =
  | 'Detected'
  | 'Triaged'
  | 'Investigating'
  | 'Action Proposed'
  | 'Fix In Progress'
  | 'Verification'
  | 'Resolved'
  | 'Reopened'
  | 'False Positive'
  | 'Expected Behavior'
  | 'Monitoring Gap'
  | "Won't Fix";

export type ObservabilityEye =
  | 'Eye 1: Client Experience'
  | 'Eye 2: Server & Infrastructure'
  | 'Eye 3: Code & Deployment';

export type ReleaseShieldRating =
  | 'Ready'
  | 'Needs Review'
  | 'High Risk'
  | 'Insufficient Evidence';

export type ImplementationStatus =
  | 'Implemented & Tested'
  | 'Implemented but Not Tested'
  | 'Needs Credentials'
  | 'Needs External Integration'
  | 'Requires Approval'
  | 'Planned'
  | 'Blocked';

export interface FourStateSeparation {
  ciPassed: boolean | null;
  deploymentSucceeded: boolean | null;
  siteReachable: boolean | null;
  userJourneyHealthy: boolean | null;
}

export interface ExistingSystemAudit {
  systemName: string;
  locationInRepo: string;
  purpose: string;
  verificationStatus:
    | 'Verified Active'
    | 'Partial Coverage'
    | 'Needs Sensor Bridge'
    | 'Read-Only Linked';
  notes: string;
}

export interface DigitalEcgMetric {
  id: string;
  nameAr: string;
  nameEn: string;
  currentValue: number;
  baselineValue: number;
  unit: string;
  measurementWindow: string;
  sampleSize: number;
  confidenceLevel: 'High' | 'Medium' | 'Low' | 'Insufficient Data';
  isAnomalous: boolean;
  anomalyReason?: string;
  dataIntegrity: DataIntegrityState;
  sparkline: number[];
}

export interface CustomerJourneyStep {
  stepNumber: number;
  name: string;
  completionRate: number;
  dropOffRate: number;
  silentFailureSuspected: boolean;
  status: 'Nominal' | 'Degraded' | 'Drop-off Detected';
  notes: string;
}

export interface CustomerJourneyFlow {
  id: string;
  appId: string;
  name: string;
  category: string;
  overallSuccessRate: number;
  sampleCount: number;
  lastVerified: string;
  dataIntegrity: DataIntegrityState;
  steps: CustomerJourneyStep[];
}

export interface FeatureDnaRecord {
  id: string;
  appId: string;
  featureName: string;
  purpose: string;
  usagePath: string;
  relatedFiles: string[];
  protectingTests: string[];
  sensitivity: 'Critical' | 'High' | 'Standard';
  lastVerifiedSuccess: string;
  recentAffectingChanges: string[];
  status: 'Verified' | 'Untested' | 'Regression Risk' | 'Broken';
}

export interface GitHubActionRunSummary {
  id: string;
  workflowName: string;
  branch: string;
  commitSha: string;
  commitMessage: string;
  status: 'success' | 'failure' | 'cancelled' | 'warning_masked' | 'in_progress';
  hasSubJobWarning: boolean;
  warningDetails?: string;
  durationSec: number;
  timestamp: string;
  dataIntegrity: DataIntegrityState;
}

export interface CommitRecord {
  sha: string;
  author: string;
  message: string;
  timestamp: string;
  branch: string;
  changedFiles: string[];
  riskLevel: 'Low' | 'Medium' | 'High' | 'Unknown';
  dataIntegrity: DataIntegrityState;
}

export interface PlatformRecord {
  id: string;
  codeName: string;
  nameAr: string;
  description: string;
  owner: string;
  repoName: string;
  repoUrl: string;
  defaultBranch: string;
  techStack: string[];
  runtimeMode: AppRuntimeMode;
  environments: string[];
  productionUrl: string | null;
  productionUrlVerified: boolean;
  apiServices: string[];
  databasesAndIntegrations: string[];
  sensitiveFunctions: string[];
  healthStatus: AppHealthStatus;
  lifecycleState: PlatformLifecycleState;
  dataIntegrity: DataIntegrityState;
  monitoringCoveragePct: number;
  monitoringBoundaries: string[];
  connectionStatus:
    | 'Connected (Read-Only)'
    | 'Local Session Telemetry'
    | 'Webhook Ready'
    | 'Pending Credentials'
    | 'Unavailable'
    | 'Paused'
    | 'Unlinked';
  connectionVerified: boolean;
  lastVerifiedEvidence: string;
  lastVerifiedTimestamp: string;
  fourState: FourStateSeparation;
  releaseShield: ReleaseShieldRating;
  releaseConfidencePct: number;
  existingSystems: ExistingSystemAudit[];
  ecgMetrics: DigitalEcgMetric[];
  journeys: CustomerJourneyFlow[];
  featuresDna: FeatureDnaRecord[];
  recentRuns: GitHubActionRunSummary[];
  recentCommits: CommitRecord[];
  /** Problems the automatic site visit found on the public page (e.g. a broken app file), plain Arabic. */
  siteProblems?: string[];
  siteCheckedAt?: string;
  /** Last real-browser visit (daily robot visitor). */
  /** Errors that several real visitors hit, reported by the program's own browser sensor. */
  sensorProblems?: string[];
  sensorCheckedAt?: string;
  /** What those visitors did just before the error (privacy-safe: tags and paths only) and where it threw. */
  sensorEvidence?: Array<{ text: string; page: string; visitors: number; stack: string[]; steps: string[] }>;
  /** `sensor`: whether the robot found the ORBIT sensor script on the program's pages (undefined = not checked). */
  browserVisit?: { at: string; ok: boolean; problems: string[]; warnings?: string[]; hash?: string; sensor?: 'installed' | 'absent' };
  /** Last time the sensor's daily self-test note (sent by the robot through the program's own page) reached ORBIT. */
  sensorProbeAt?: string;
  /** Errors in the program's own server logs (Cloud Run), grouped by message; checked every watch when a log source is configured. */
  serverErrors?: Array<{ text: string; count: number; lastAt: string; /** Cloud Run revision that logged it: a new revision that fails to start serves no visitors. */ revision?: string }>;
  serverLogsCheckedAt?: string;
  /** Why the log source could not be read (no permission, wrong project), so a silent gap is never mistaken for "no errors". */
  serverLogsIssue?: string;
  /** Speed before the newest commit, to tell whether that release made the site slower. */
  releaseWatch?: { sha: string; at: string; beforeMs?: number };
  /** When each problem first showed, newest last (capped); the weekly report is built from it. */
  problemLog?: Array<{ at: string; text: string }>;
  /** Response time and page size of each watch visit, newest last; used to notice a slow drift before an outage. */
  vitals?: Array<{ at: string; ms: number; bytes: number }>;
  /** Security certificate of the program's site (checked about once a day). */
  certExpiresAt?: string;
  certProblem?: string;
  certCheckedAt?: string;
  /** When the program's domain name must be renewed (RDAP), checked about weekly. */
  domainExpiresAt?: string;
  domainCheckedAt?: string;
  /** Last time the site visit found the program healthy, to tell whether a problem started after a commit. */
  siteLastOkAt?: string;
  branchHeads?: Array<{ name: string; sha: string }>;
  createdAt: string;
  isCustomAdded?: boolean;
}

export interface BlackBoxFrame {
  frameId: string;
  timestamp: string;
  appVersion: string;
  operationName: string;
  requestType: 'HTTP' | 'UI_ACTION' | 'DB_QUERY' | 'JOB_EXEC' | 'AUTH' | 'STATE_CHANGE';
  statusCode: string;
  correlationId: string;
  outcome: 'Success' | 'Silent Failure' | 'Exception' | 'Timeout';
  sanitizedPayloadSummary: string;
  redactedFieldsCount: number;
}

export interface RadarEvent {
  eventId: string;
  appId: string;
  environment: 'production' | 'staging' | 'local' | 'canary-sandbox';
  eventType: EventCategory;
  severity: AlertSeverity;
  timestamp: string;
  releaseVersion: string;
  commitSha: string;
  browserOs: string;
  operationName: string;
  errorCode: string;
  safeErrorMessage: string;
  sanitizedStackTrace: string;
  correlationId: string;
  traceId: string;
  firstSeen: string;
  lastSeen: string;
  occurrenceCount: number;
  affectedSessions: number;
  detectionSource:
    | 'ORBIT Sensor'
    | 'GitHub Actions'
    | 'Synthetic Canary'
    | 'Silent Failure Detector'
    | 'Existing App Radar'
    | 'API Health Probe';
  eyeLayer: ObservabilityEye;
  evidenceLinks: string[];
  incidentStatus: IncidentStatus;
  confidenceLevel:
    | 'Confirmed (95%+)'
    | 'Strong Evidence (80%)'
    | 'Hypothesis (55%)'
    | 'Needs Investigation';
  fingerprint: string;
  dataIntegrity: DataIntegrityState;
  sanitizedRedactions: number;
}

export interface IncidentHistoryLog {
  timestamp: string;
  actor: string;
  fromStatus: IncidentStatus | 'New';
  toStatus: IncidentStatus;
  note: string;
  isTechnicalVerification: boolean;
}

export interface IncidentCaseFile {
  incidentId: string;
  fingerprint: string;
  appId: string;
  title: string;
  summary: string;
  category: EventCategory;
  severity: AlertSeverity;
  status: IncidentStatus;
  technicallyVerified: boolean;
  firstSeen: string;
  lastSeen: string;
  occurrenceCount: number;
  affectedSessions: number;
  impactScope: string;
  confirmedEvidence: string[];
  probableHypotheses: string[];
  falsifiedHypotheses: string[];
  relatedReleases: string[];
  suspectedCommitSha: string;
  suspectedFiles: string[];
  reproductionSteps: string[];
  requiredTests: string[];
  proposedActions: string[];
  allowedModificationScope: string[];
  acceptanceCriteria: string[];
  confidenceScore: number;
  eyeLayer: ObservabilityEye;
  dataIntegrity: DataIntegrityState;
  blackBoxFrames: BlackBoxFrame[];
  history: IncidentHistoryLog[];
}

export interface SilentFailureSignal {
  id: string;
  appId: string;
  patternType:
    | 'Fake Success Toast without DB Commit'
    | 'HTTP 200 with Functional Error Payload'
    | 'Missed Scheduled Cron Job'
    | 'Workflow Success with Dropped Notification'
    | 'Deployed Version Drift from HEAD'
    | 'Sudden Drop in Core Operation Volume';
  operationName: string;
  detectedAt: string;
  evidenceSummary: string;
  expectedOutcome: string;
  actualOutcome: string;
  confidence: 'High' | 'Medium';
  dataIntegrity: DataIntegrityState;
}

export interface ChangeImpactAnalysis {
  id: string;
  appId: string;
  commitSha: string;
  commitMessage: string;
  author: string;
  timestamp: string;
  changedFiles: string[];
  affectedDependencies: string[];
  affectedFeatures: string[];
  sensitiveRisks: string[];
  recommendedTests: string[];
  preChangeErrorRate: number;
  postChangeErrorRate: number;
  correlationType:
    | 'Confirmed Causal'
    | 'Temporal Correlation Only'
    | 'No Adverse Impact';
  releaseShieldVerdict: ReleaseShieldRating;
}

export interface CrossAppPattern {
  id: string;
  title: string;
  sharedDependencyOrPattern: string;
  originAppId: string;
  potentiallyAffectedAppIds: string[];
  riskDescription: string;
  recommendedVerificationPerApp: string;
  status: 'Active Advisory' | 'Verified Safe' | 'Needs Inspection';
}

export interface EngineeringMemoryEntry {
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
}

export interface InnovationOpportunity {
  id: string;
  appId: string | 'ALL_FLEET';
  title: string;
  category:
    | 'UX & Flow Simplification'
    | 'Performance Optimization'
    | 'Accessibility'
    | 'Code Deduplication'
    | 'Test Coverage'
    | 'Cost Reduction'
    | 'Architecture & Security'
    | 'Deprecated Feature Cleanup';
  evidenceBasis: string;
  impactScore: number;
  effortScore: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  confidenceLevel: 'High' | 'Medium';
  estimatedBenefit: string;
}

export interface AlertNotification {
  id: string;
  incidentId?: string;
  appId: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  createdAt: string;
  deliveryStatus:
    | 'Dispatched In-App'
    | 'Provider Accepted'
    | 'Suppressed (Dedup)'
    | 'Quiet Hours Queued';
  acknowledgedByOperator: boolean;
  escalationLevel: number;
}

export interface SelfHealthMetrics {
  overallStatus: 'Operational' | 'Monitoring Unconfirmed' | 'Degraded';
  heartbeatTimestamp: string;
  lastSuccessfulIngestion: string;
  eventProcessingDelayMs: number;
  failedJobsCount: number;
  sensorConnectivityCount: number;
  missingTelemetryApps: string[];
  alertDeliveryStatus: 'Nominal' | 'Delayed';
  storageUsageMb: number;
  storageQuotaMb: number;
  githubApiRemaining: number;
  githubApiLimit: number;
  backgroundJobHealth: 'Healthy' | 'Warning';
  fleetMonitoringCoveragePct: number;
  independentWatchdogStatus: 'Verified' | 'Stale';
}

export interface CanaryTestStep {
  step: string;
  passed: boolean;
  latencyMs: number;
  detail: string;
}

export interface CanaryTestResult {
  runId: string;
  timestamp: string;
  overallPassed: boolean;
  generatedEventId: string;
  correlatedIncidentId: string;
  steps: CanaryTestStep[];
}

export interface CostGuardMetrics {
  monthlyCostUsd: number;
  ingestedEventsCount: number;
  ingestedEventsLimit: number;
  deduplicatedSavedEvents: number;
  storageUsedMb: number;
  storageFreeTierMb: number;
  githubApiCallsToday: number;
  githubApiDailyQuota: number;
  aiDiagnosisCallsCount: number;
  aiDiagnosisMode: 'On-Demand Only (Deterministic First)';
  paidServicesActive: boolean;
  retentionDays: number;
  quotaWarnings: string[];
}

export interface DiscoveredRepoCandidate {
  owner: string;
  repoName: string;
  codeName: string;
  description: string;
  detectedTechStack: string[];
  defaultBranch: string;
  detectedWorkflows: string[];
  runtimeMode: AppRuntimeMode;
  requiresApproval: boolean;
}

export interface AcceptanceCriterionResult {
  id: string;
  sectionRef: string;
  titleAr: string;
  verificationMethod: string;
  status: 'Pass' | 'Fail' | 'Not Tested';
  evidenceDetail: string;
}

export interface FeatureMatrixItem {
  id: string;
  phase:
    | 'Phase 1'
    | 'Phase 2'
    | 'Phase 3'
    | 'Phase 4'
    | 'Phase 5'
    | 'Phase 6 (Dynamic Fleet)';
  featureNameAr: string;
  featureNameEn: string;
  status: ImplementationStatus;
  notes: string;
}
