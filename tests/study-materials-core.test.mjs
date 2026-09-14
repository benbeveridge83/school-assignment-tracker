import test from 'node:test';
import assert from 'node:assert/strict';
await import('../study-materials-core.js');
const {normalizeGoogleMaterial,normalizeOmiSession,normalizeTrackerFile,groupMaterialsByClass,buildZipRequest}=globalThis.StudyMaterialsCore;

test('maps stored Google Classroom attachment to tracker owner',()=>{
 const rows=normalizeGoogleMaterial({trackerUserId:'27772610-bfed-4987-93b0-087c4fc8364c',studentKey:'carter',classId:'gc-ODc0MzU3NTQ4NDMw',className:'26-27 APGO 4th Period Fall',courseId:'ODc0MzU3NTQ4NDMw',item:{id:'material-1',title:'Unit 1 Notes',description:'Constitutional underpinnings',materials:[{type:'PDF',title:'Unit 1 Notes',url:'https://signed.example/file.pdf',originalUrl:'https://docs.google.com/presentation/d/abc',storageBucket:'classroom-files',storagePath:'source-owner/carter/course/unit1.pdf',contentType:'application/pdf',scrapeId:'stored-unit1',captureStatus:'stored'}]}});
 assert.equal(rows.length,1);assert.equal(rows[0].owner_user_id,'27772610-bfed-4987-93b0-087c4fc8364c');assert.equal(rows[0].student_key,'carter');assert.equal(rows[0].class_id,'gc-ODc0MzU3NTQ4NDMw');assert.equal(rows[0].source_type,'google_classroom');assert.equal(rows[0].storage_bucket,'classroom-files');assert.equal(rows[0].capture_status,'stored');assert.match(rows[0].source_id,/^gc:ODc0MzU3NTQ4NDMw:/);
});

test('Google source id is stable when same original URL upgrades from link-only to stored',()=>{
 const base={trackerUserId:'u1',studentKey:'carter',classId:'c1',className:'Class',courseId:'course'};
 const link=normalizeGoogleMaterial({...base,item:{id:'m1',title:'Notes',materials:[{title:'Notes',url:'https://docs.google.com/document/d/abc',originalUrl:'https://docs.google.com/document/d/abc',captureStatus:'link_only',scrapeId:'link-123'}]}})[0];
 const stored=normalizeGoogleMaterial({...base,item:{id:'m1',title:'Notes',materials:[{title:'Notes',url:'https://signed.example/x',originalUrl:'https://docs.google.com/document/d/abc',captureStatus:'stored',scrapeId:'stored-999',storageBucket:'classroom-files',storagePath:'u/c/file.pdf'}]}})[0];
 assert.equal(link.source_id,stored.source_id);assert.equal(link.capture_status,'link_only');assert.equal(stored.capture_status,'stored');
});

test('maps Omi class session to transcript content',()=>{
 const row=normalizeOmiSession({trackerUserId:'u1',studentKey:'carter',session:{id:'s1',tracker_class_id:'debate',class_name:'Debate I',session_date:'2026-09-09',teacher_transcript:'Teacher explanation',raw_transcript:'Complete transcript',scheduled_start:'2026-09-09T15:00:00Z'}});
 assert.equal(row.source_type,'omi');assert.equal(row.material_kind,'transcript');assert.equal(row.capture_status,'transcript');assert.equal(row.metadata.teacher_transcript,'Teacher explanation');
});

test('creates stable source id for tracker file',()=>{
 const a=normalizeTrackerFile({trackerUserId:'u1',studentKey:'carter',classId:'lit',className:'AP Lit Pd 6',file:{name:'Essay Rubric.pdf',url:'https://example/rubric.pdf'},sourceContext:'class-file'});
 const b=normalizeTrackerFile({trackerUserId:'u1',studentKey:'carter',classId:'lit',className:'AP Lit Pd 6',file:{name:'Essay Rubric.pdf',url:'https://example/rubric.pdf'},sourceContext:'class-file'});
 assert.equal(a.source_id,b.source_id);
});

test('groups and sorts by class then title',()=>{
 const grouped=groupMaterialsByClass([{class_id:'b',class_name_snapshot:'Debate I',title:'Terms'},{class_id:'a',class_name_snapshot:'AP Lit Pd 6',title:'Zeta'},{class_id:'a',class_name_snapshot:'AP Lit Pd 6',title:'Alpha'}]);
 assert.deepEqual(grouped.map(x=>x.className),['AP Lit Pd 6','Debate I']);assert.deepEqual(grouped[0].materials.map(x=>x.title),['Alpha','Zeta']);
});

test('builds unique ZIP request',()=>{assert.deepEqual(buildZipRequest(['a','b','a']),{material_ids:['a','b']});});
