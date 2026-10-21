import test from 'node:test';
import assert from 'node:assert/strict';
import {
 evaluateTruthEvidence, buildPrivacySafeTimeline, buildSharedDependencyAdvisory,
 rankPostReleaseChecks, buildRepairIntelligenceAddendum, classifyReadOnlyProbe,
} from './guardian.ts';
import { inspectRepositoryCapabilities } from './engine.ts';
import type { IncidentCaseFile, PlatformRecord } from './types.ts';

const app=(codeName:string, integrations:string[]=[]):PlatformRecord=>({
 ...inspectRepositoryCapabilities({owner:'ProfAlfailakawi',repoName:codeName.toLowerCase(),codeName,nameAr:codeName,description:'Test',runtimeMode:'github-web'}),
 apiServices:integrations,databasesAndIntegrations:[],lifecycleState:'active',
});
const incident=(live=true):IncidentCaseFile=>({
 incidentId:'INC-T',fingerprint:'FPT',appId:'ONE',title:'T',summary:'T',category:'Silent Failure',severity:'High',
 status:'Detected',technicallyVerified:false,firstSeen:'',lastSeen:'',occurrenceCount:1,affectedSessions:1,impactScope:'',
 confirmedEvidence:[],probableHypotheses:[],falsifiedHypotheses:[],relatedReleases:[],suspectedCommitSha:'',
 suspectedFiles:[],reproductionSteps:[],requiredTests:[],proposedActions:[],allowedModificationScope:[],
 acceptanceCriteria:[],confidenceScore:0,eyeLayer:'Eye 1: Client Experience',
 dataIntegrity:live?'Live':'Demo',blackBoxFrames:[],history:[],
});
test('explicit contradictory server truth only, unknown remains unknown',()=>{
 assert.equal(evaluateTruthEvidence({uiReportedSuccess:true}).verdict,'unknown');
 assert.equal(evaluateTruthEvidence({uiReportedSuccess:true,serverRecordConfirmed:null}).verdict,'unknown');
 assert.equal(evaluateTruthEvidence({uiReportedSuccess:false,serverRecordConfirmed:false}).verdict,'unknown');
 assert.equal(evaluateTruthEvidence({uiReportedSuccess:true,serverRecordConfirmed:true}).verdict,'confirmed');
 assert.equal(evaluateTruthEvidence({uiReportedSuccess:true,serverRecordConfirmed:false}).verdict,'contradiction');
});
test('timelines retain only allowlisted metadata and at most eight frames',()=>{
 const privateText='secret person@example.com user typed password';
 const raw=Array.from({length:20},()=>({kind:'ui_action',operation:'save.submit',outcome:'failure',domText:privateText,typedValue:privateText,url:'https://private.test/xyz',cookie:'private'}));
 const frames=buildPrivacySafeTimeline(raw,{correlationId:'C-1',releaseVersion:'v1',operationName:'save.submit'});
 assert.equal(frames.length,8);
 assert.equal(frames[0].redactedFieldsCount,4);
 assert.ok(!JSON.stringify(frames).includes(privateText));
 assert.ok(!JSON.stringify(frames).includes('https://private.test'));
 assert.deepEqual(buildPrivacySafeTimeline({}, {correlationId:'',releaseVersion:'',operationName:'x'}),[]);
});
test('related app warnings use declared dependencies only and never demo',()=>{
 const fleet=[app('ONE',['shared-alert-provider']),app('TWO',['shared-alert-provider']),app('THREE',['other-service'])];
 assert.deepEqual(buildSharedDependencyAdvisory(incident(),fleet)?.potentiallyAffectedAppIds,['TWO']);
 assert.equal(buildSharedDependencyAdvisory(incident(false),fleet),null);
 assert.equal(buildSharedDependencyAdvisory(incident(),[app('ONE'),app('TWO')]),null);
});
test('recent change risk unknown until verified commits exist',()=>{
 const p=app('ONE');
 assert.equal(rankPostReleaseChecks(p).risk,'unknown');
 p.recentCommits=[{sha:'abcdef01234567890',author:'',message:'',timestamp:'',branch:'main',changedFiles:[],riskLevel:'High',dataIntegrity:'Live'}];
 assert.equal(rankPostReleaseChecks(p).risk,'review');
 assert.match(rankPostReleaseChecks(p).basis,/temporal association only/);
});
test('repair brief is clear about hypotheses and no autonomous changes',()=>{
 const p=app('ONE',['same-service']);
 const copy=buildRepairIntelligenceAddendum(incident(),p,[p,app('TWO',['same-service'])]);
 assert.match(copy,/UNVERIFIED/);
 assert.match(copy,/NOT a screen recording/);
 assert.match(copy,/Do not automatically change/);
});
test('read only probes do not confuse unverified and reachable',()=>{
 assert.equal(classifyReadOnlyProbe(null),'unverified');
 assert.equal(classifyReadOnlyProbe(200,false,true),'failed');
 assert.equal(classifyReadOnlyProbe(200,true,true),'reachable');
 assert.equal(classifyReadOnlyProbe(503,true,true),'failed');
});
