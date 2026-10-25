import test from 'node:test';
import assert from 'node:assert/strict';
await import('../study-materials-core.js');

globalThis.window = {
  StudyMaterialsCore: globalThis.StudyMaterialsCore,
  supabase: null
};
globalThis.document = {
  readyState: 'loading',
  addEventListener(){},
  querySelector(){ return null; },
  querySelectorAll(){ return []; },
  getElementById(){ return null; }
};
globalThis.localStorage = { getItem(){ return '{}'; } };

await import('../study-materials.js');
const { createSelectionModel, renderMaterialRowsHtml } = globalThis.window.StudyMaterials;

test('select all and select none affect visible ids',()=>{
  const model=createSelectionModel();
  model.selectAll(['a','b','c']);
  assert.deepEqual(model.values(),['a','b','c']);
  model.selectNone();
  assert.deepEqual(model.values(),[]);
});

test('compact row renders title and description inline',()=>{
  const html=renderMaterialRowsHtml([{
    id:'m1',
    title:'Unit 1 Notes',
    description:'Constitutional underpinnings',
    source_type:'google_classroom',
    material_kind:'pdf',
    capture_status:'stored'
  }],new Set());
  assert.match(html,/study-material-row/);
  assert.match(html,/Unit 1 Notes/);
  assert.match(html,/Constitutional underpinnings/);
  assert.ok(html.indexOf('Unit 1 Notes') < html.indexOf('Constitutional underpinnings'));
});
