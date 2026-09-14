# Student Materials Phase 1 — Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a canonical student materials store and a compact Documents page that shows every class-associated material, supports selection, and downloads selected materials as one class-organized ZIP.

**Architecture:** Keep the existing tracker and `tracker_data` intact, but introduce a normalized `study_materials` table as the canonical index for study sources. Add a focused browser module (`study-materials.js`) and stylesheet (`study-materials.css`) injected by the existing wrapper `index.html`. Normalize existing Google Classroom, Omi, and tracker-state materials into `study_materials`; binary files remain private in Supabase Storage. ZIP download is handled by a Supabase Edge Function so private storage objects and generated text/reference files can be packaged without loading all binaries into the browser.

**Tech Stack:** Static HTML/JavaScript on GitHub Pages, Supabase Auth/Postgres/Storage/Edge Functions, Node 24 test tooling with Vitest + jsdom, JSZip in the Edge Function.

**Spec:** `docs/superpowers/specs/2026-09-13-student-materials-outline-workflow-design.md`

## Global Constraints

- A student's Documents page includes every material associated with the student's classes, regardless of source.
- Material sources include Google Classroom, manually uploaded files, existing tracker/test files, Omi transcripts, other class transcripts, Classroom posts/materials, link-only resources, and future supported sources.
- Documents are grouped by class.
- Rows are intentionally compact, targeting approximately 28–36 px on desktop.
- Selection controls are Select All, Select None, and class-level selection.
- Download Selected produces one ZIP organized by class folders.
- Non-binary items are materialized as `.txt` representations; link-only items get reference `.txt` files rather than being dropped.
- Supabase Storage remains private.
- Row-level access is restricted to the owning authenticated tracker user.
- Existing tracker/class/test/Classroom/Omi functionality must continue to work.
- No Google password or browser-session credential may be stored in Supabase.

---

## File Structure

- Create `study-materials-core.js` — pure normalization, deduplication key, row sorting, and ZIP request helpers. No DOM access.
- Create `study-materials.js` — UI installation, active student/class discovery, source synchronization, Documents rendering, selection state, and ZIP action.
- Create `study-materials.css` — dense Documents layout and responsive rules.
- Modify `index.html` — inject `study-materials.css`, `study-materials-core.js`, and `study-materials.js` into the tracker iframe after the base page loads.
- Create `supabase/migrations/20260913_study_materials.sql` — schema, constraints, indexes, RLS, and updated-at trigger.
- Create `supabase/functions/study-materials-download/index.ts` — authenticated ZIP generator.
- Create `package.json` — minimal Vitest test harness.
- Create `tests/study-materials-core.test.js` — unit coverage for normalization, deduplication, grouping/sorting, and ZIP payload building.
- Create `tests/study-materials-ui.test.js` — browser-like tests for selection and compact grouped rendering.

---

### Task 1: Add the pure material normalization layer and tests

**Files:**
- Create: `package.json`
- Create: `study-materials-core.js`
- Create: `tests/study-materials-core.test.js`

**Interfaces:**
- Consumes: raw Google Classroom material objects, Omi session rows, tracker class/test file objects.
- Produces:
  - `normalizeGoogleMaterial({ trackerUserId, studentKey, classId, className, courseId, item }) -> StudyMaterialInput[]`
  - `normalizeOmiSession({ trackerUserId, studentKey, session }) -> StudyMaterialInput`
  - `normalizeTrackerFile({ trackerUserId, studentKey, classId, className, file, sourceContext }) -> StudyMaterialInput`
  - `stableMaterialSourceId(parts) -> string`
  - `groupMaterialsByClass(materials) -> Array<{classId,className,materials}>`
  - `buildZipRequest(materialIds) -> {material_ids:string[]}`

- [ ] **Step 1: Create the Vitest harness**

Create `package.json`:

```json
{
  "name": "school-assignment-tracker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "jsdom": "^26.1.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Write failing normalization tests**

Create `tests/study-materials-core.test.js` with cases that prove:

```js
import { describe, it, expect } from 'vitest';
import {
  normalizeGoogleMaterial,
  normalizeOmiSession,
  normalizeTrackerFile,
  groupMaterialsByClass,
  buildZipRequest
} from '../study-materials-core.js';

describe('study material normalization', () => {
  it('maps a stored Google Classroom attachment to the tracker owner', () => {
    const rows = normalizeGoogleMaterial({
      trackerUserId: '27772610-bfed-4987-93b0-087c4fc8364c',
      studentKey: 'carter',
      classId: 'gc-ODc0MzU3NTQ4NDMw',
      className: '26-27 APGO 4th Period Fall',
      courseId: 'ODc0MzU3NTQ4NDMw',
      item: {
        id: 'material-1',
        title: 'Unit 1 Notes',
        description: 'Constitutional underpinnings',
        materials: [{
          type: 'PDF',
          title: 'Unit 1 Notes',
          url: 'https://signed.example/file.pdf',
          originalUrl: 'https://docs.google.com/presentation/d/abc',
          storageBucket: 'classroom-files',
          storagePath: 'source-owner/carter/course/unit1.pdf',
          contentType: 'application/pdf',
          scrapeId: 'stored-unit1',
          captureStatus: 'stored'
        }]
      }
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      owner_user_id: '27772610-bfed-4987-93b0-087c4fc8364c',
      student_key: 'carter',
      class_id: 'gc-ODc0MzU3NTQ4NDMw',
      source_type: 'google_classroom',
      source_id: 'gc:ODc0MzU3NTQ4NDMw:stored-unit1',
      storage_bucket: 'classroom-files',
      capture_status: 'stored'
    });
  });

  it('maps an Omi class session to transcript content', () => {
    const row = normalizeOmiSession({
      trackerUserId: 'u1',
      studentKey: 'carter',
      session: {
        id: 's1',
        tracker_class_id: 'debate',
        class_name: 'Debate I',
        session_date: '2026-09-09',
        teacher_transcript: 'Teacher explanation',
        raw_transcript: 'Complete transcript',
        scheduled_start: '2026-09-09T15:00:00Z'
      }
    });
    expect(row.source_type).toBe('omi');
    expect(row.material_kind).toBe('transcript');
    expect(row.capture_status).toBe('text_captured');
    expect(row.metadata.teacher_transcript).toBe('Teacher explanation');
  });

  it('creates a stable source id for a tracker-uploaded file', () => {
    const row = normalizeTrackerFile({
      trackerUserId: 'u1',
      studentKey: 'carter',
      classId: 'lit',
      className: 'AP Lit Pd 6',
      file: { name: 'Essay Rubric.pdf', url: 'https://example/rubric.pdf' },
      sourceContext: 'class-file'
    });
    expect(row.source_id).toBe('tracker:lit:class-file:https://example/rubric.pdf');
  });

  it('groups and sorts by class name while preserving material order by title', () => {
    const grouped = groupMaterialsByClass([
      { class_id:'b', class_name_snapshot:'Debate I', title:'Terms' },
      { class_id:'a', class_name_snapshot:'AP Lit Pd 6', title:'Zeta' },
      { class_id:'a', class_name_snapshot:'AP Lit Pd 6', title:'Alpha' }
    ]);
    expect(grouped.map(x => x.className)).toEqual(['AP Lit Pd 6','Debate I']);
    expect(grouped[0].materials.map(x => x.title)).toEqual(['Alpha','Zeta']);
  });

  it('builds a unique ZIP request', () => {
    expect(buildZipRequest(['a','b','a'])).toEqual({ material_ids:['a','b'] });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm install
npm test -- tests/study-materials-core.test.js
```

Expected: FAIL because `study-materials-core.js` does not exist.

- [ ] **Step 4: Implement the normalization functions**

Create `study-materials-core.js` with deterministic, DOM-free functions. Google items may contain several attachments; return one normalized row per attachment. Omi material text remains in `metadata.raw_transcript` / `metadata.teacher_transcript` for Phase 1 download representation. Tracker file records preserve `url`, `storage_bucket`, and `storage_path` when present.

Required normalized shape:

```js
{
  owner_user_id,
  student_key,
  class_id,
  class_name_snapshot,
  title,
  description,
  source_type,
  source_id,
  original_url,
  storage_bucket,
  storage_path,
  mime_type,
  material_kind,
  capture_status,
  captured_at,
  source_created_at,
  metadata
}
```

Use exact capture states: `stored`, `text_captured`, `transcript`, `link_only`, `extraction_pending`, `extraction_failed`, `file_unavailable`.

- [ ] **Step 5: Run the unit tests**

Run:

```bash
npm test -- tests/study-materials-core.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json study-materials-core.js tests/study-materials-core.test.js
git commit -m "feat: add study material normalization core"
```

---

### Task 2: Create canonical `study_materials` schema and RLS

**Files:**
- Create: `supabase/migrations/20260913_study_materials.sql`

**Interfaces:**
- Consumes: authenticated Supabase user id and normalized material rows.
- Produces: `public.study_materials` with owner-scoped CRUD and a stable source uniqueness constraint.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260913_study_materials.sql`:

```sql
create extension if not exists pgcrypto;

create table if not exists public.study_materials (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  student_key text not null,
  class_id text not null,
  class_name_snapshot text not null default '',
  title text not null,
  description text not null default '',
  source_type text not null,
  source_id text not null,
  original_url text,
  storage_bucket text,
  storage_path text,
  mime_type text,
  material_kind text not null default 'resource',
  capture_status text not null default 'link_only',
  captured_at timestamptz,
  source_created_at timestamptz,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_materials_capture_status_check check (
    capture_status in ('stored','text_captured','transcript','link_only','extraction_pending','extraction_failed','file_unavailable')
  ),
  constraint study_materials_source_unique unique (owner_user_id, student_key, class_id, source_type, source_id)
);

create index if not exists study_materials_student_class_idx
  on public.study_materials(owner_user_id, student_key, class_id, class_name_snapshot, title);

create index if not exists study_materials_source_idx
  on public.study_materials(source_type, source_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists study_materials_touch_updated_at on public.study_materials;
create trigger study_materials_touch_updated_at
before update on public.study_materials
for each row execute function public.touch_updated_at();

alter table public.study_materials enable row level security;

drop policy if exists study_materials_select_own on public.study_materials;
create policy study_materials_select_own on public.study_materials
for select to authenticated
using (owner_user_id = auth.uid());

drop policy if exists study_materials_insert_own on public.study_materials;
create policy study_materials_insert_own on public.study_materials
for insert to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists study_materials_update_own on public.study_materials;
create policy study_materials_update_own on public.study_materials
for update to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists study_materials_delete_own on public.study_materials;
create policy study_materials_delete_own on public.study_materials
for delete to authenticated
using (owner_user_id = auth.uid());
```

- [ ] **Step 2: Apply the migration to the connected Supabase project**

Apply exactly the SQL above to project `oboyynqbwgrplqjkobup` using the Supabase migration action.

- [ ] **Step 3: Verify RLS with owner and non-owner identities**

Run owner-scoped SQL/service-role verification for the schema and then browser-level tests with two authenticated users. Expected behavior: each user sees only rows where `owner_user_id = auth.uid()`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260913_study_materials.sql
git commit -m "feat: add canonical study materials schema"
```

---

### Task 3: Synchronize Google Classroom, Omi, and existing tracker materials into `study_materials`

**Files:**
- Create: `study-materials.js`
- Modify: `tests/study-materials-core.test.js`

**Interfaces:**
- Consumes:
  - `classroom_student_profile_links` to map scraper owner/student key to the tracker auth owner.
  - latest `google_classroom_scrapes` payload per course.
  - `omi_class_sessions` rows for the active tracker user/student.
  - current `tracker_data` class/test files.
- Produces: idempotent upserts into `study_materials` on the unique key `(owner_user_id, student_key, class_id, source_type, source_id)`.

- [ ] **Step 1: Add tests for source-id stability and duplicate upgrades**

Extend `tests/study-materials-core.test.js` so a Google item that changes from `link_only` to `stored` retains the same `source_id` when it has the same `scrapeId`/original URL, allowing upsert to upgrade instead of duplicate.

- [ ] **Step 2: Implement `syncStudyMaterials()` in `study-materials.js`**

The browser module must:

1. obtain the existing authenticated Supabase session;
2. determine the selected kid (`studentKey`) and active semester/classes from the tracker state;
3. query `classroom_student_profile_links` where `tracker_user_id = currentUser.id` and `student_key = studentKey`;
4. query the latest relevant `google_classroom_scrapes` rows for the linked scrape owner;
5. normalize `payload.courseWorkMaterials || payload.materials || []` and `payload.courseWork || payload.classwork || []` attachments;
6. query `omi_class_sessions` where `owner_user_id = currentUser.id` and `tracker_kid_id = selectedKid.id`;
7. normalize every Omi session with non-empty `raw_transcript` or `teacher_transcript`;
8. walk the active semester class/test state for manual/class files and normalize every file with a stable URL/storage/id;
9. upsert normalized rows using `onConflict: 'owner_user_id,student_key,class_id,source_type,source_id'`;
10. never delete rows merely because one source was temporarily unavailable.

Use batched upserts of at most 250 rows.

- [ ] **Step 3: Add a status callback**

`syncStudyMaterials({ onStatus })` emits compact states such as `Syncing Classroom…`, `Syncing Omi transcripts…`, `Syncing uploaded files…`, `Materials current` so the Documents page can show progress without blocking the app.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add study-materials.js tests/study-materials-core.test.js
git commit -m "feat: sync class sources into study materials"
```

---

### Task 4: Build the compact Documents UI

**Files:**
- Create: `study-materials.css`
- Modify: `study-materials.js`
- Create: `tests/study-materials-ui.test.js`

**Interfaces:**
- Consumes: `study_materials` rows for the active user/student.
- Produces: injected `Documents` workspace button and grouped compact rows with persistent in-memory selection state.

- [ ] **Step 1: Write failing jsdom selection tests**

Create `tests/study-materials-ui.test.js` covering:

```js
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { createSelectionModel, renderMaterialRowsHtml } from '../study-materials.js';

describe('Documents selection', () => {
  it('select all and select none affect all visible ids', () => {
    const model = createSelectionModel();
    model.selectAll(['a','b','c']);
    expect(model.values()).toEqual(['a','b','c']);
    model.selectNone();
    expect(model.values()).toEqual([]);
  });

  it('renders one compact row per material with description inline', () => {
    const html = renderMaterialRowsHtml([{
      id:'m1', title:'Unit 1 Notes', description:'Constitutional underpinnings',
      source_type:'google_classroom', material_kind:'resource', capture_status:'stored'
    }], new Set());
    const dom = new JSDOM(`<div>${html}</div>`);
    const row = dom.window.document.querySelector('.study-material-row');
    expect(row).toBeTruthy();
    expect(row.textContent).toContain('Unit 1 Notes');
    expect(row.textContent).toContain('Constitutional underpinnings');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/study-materials-ui.test.js
```

Expected: FAIL until the exported UI helpers exist.

- [ ] **Step 3: Implement the Documents workspace**

`study-materials.js` installs a `Documents` button in the existing `.workspace-switch`. On click it replaces `#app` with:

- student/semester header using current tracker selection;
- controls: `Select All`, `Select None`, `Download Selected`, `Refresh Materials`;
- selected-count text;
- one section per class;
- class checkbox + class name + count;
- rows with checkbox, title, type, source, inline description, status, and `Open` action.

No individual document card containers. Each row must remain a single grid row unless the mobile breakpoint forces wrapping.

- [ ] **Step 4: Create dense CSS**

`study-materials.css` must use these desktop row targets:

```css
.study-material-row{
  min-height:30px;
  display:grid;
  grid-template-columns:24px minmax(220px,2.2fr) 90px 120px minmax(180px,2fr) 120px 60px;
  align-items:center;
  gap:7px;
  padding:2px 8px;
  border-top:1px solid #e4e4e7;
  font-size:12px;
}
.study-material-desc{
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
```

At widths below 720 px, hide the separate source/type columns behind compact badges and allow a two-line maximum.

- [ ] **Step 5: Implement Open behavior**

Opening a material uses, in priority order:

1. a fresh signed URL created from `storage_bucket/storage_path`;
2. `original_url`;
3. a text preview modal for Omi/transcript/text-only material from metadata.

Never persist long-lived signed URLs as the canonical record.

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add study-materials.js study-materials.css tests/study-materials-ui.test.js
git commit -m "feat: add compact student Documents workspace"
```

---

### Task 5: Add authenticated ZIP download

**Files:**
- Create: `supabase/functions/study-materials-download/index.ts`
- Modify: `study-materials.js`
- Modify: `tests/study-materials-core.test.js`

**Interfaces:**
- Consumes: POST body `{ material_ids: string[] }` plus Supabase bearer token.
- Produces: `application/zip` binary with one folder per class.

- [ ] **Step 1: Add ZIP manifest unit cases**

Test that selected stored files keep their filename; transcript/text-only materials become `.txt`; link-only materials become ` - reference.txt`; duplicate filenames within the same class gain ` (2)`, ` (3)` suffixes.

- [ ] **Step 2: Implement the Edge Function authentication and lookup**

The function must:

1. require `Authorization: Bearer <jwt>`;
2. create a user-scoped Supabase client from the request token;
3. select `study_materials` rows where `id in (...)`; RLS enforces ownership;
4. return `403/404` if no authorized materials match;
5. sanitize class folder and filename characters `[<>:"/\\|?*]` to `_`.

- [ ] **Step 3: Implement ZIP assembly using JSZip**

Use:

```ts
import JSZip from 'npm:jszip@3.10.1';
```

For each material:

- if `storage_bucket` + `storage_path` exist, download the private object using a service-role storage client only after the user-scoped query has proven ownership;
- for `omi`/`transcript`/`text_captured`, write UTF-8 text containing title, class, source, date, and the best available transcript/content metadata;
- for `link_only`, write a UTF-8 reference file with title, description, original URL, and status;
- if a binary download fails, include a ` - unavailable.txt` file describing the failed source rather than silently omitting it.

Return headers:

```ts
{
  'Content-Type': 'application/zip',
  'Content-Disposition': `attachment; filename="${studentKey}-materials.zip"`,
  'Cache-Control': 'no-store'
}
```

- [ ] **Step 4: Wire Download Selected in `study-materials.js`**

POST selected ids to `/functions/v1/study-materials-download`, read the response blob, and trigger one browser download. Disable the button while running and show `Preparing ZIP…`.

- [ ] **Step 5: Deploy and smoke-test the function**

Test a mix of Carter APGO stored files plus an Omi transcript/link-only item. Verify one ZIP downloads and folders are grouped by class.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/study-materials-download/index.ts study-materials.js tests/study-materials-core.test.js
git commit -m "feat: download selected study materials as zip"
```

---

### Task 6: Inject the Documents subsystem through the existing v4 wrapper

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: tracker iframe DOM after `tracker-v3.9-base.html` loads.
- Produces: CSS + core + UI modules loaded after the existing Omi scripts.

- [ ] **Step 1: Add `addStylesheet()` to the wrapper**

Implement a helper parallel to `addScript()` that inserts a `<link rel="stylesheet">` into the iframe document and resolves on load.

- [ ] **Step 2: Load the new assets after Omi**

After existing Omi injection, load in this order:

```js
await addStylesheet(doc,'./study-materials.css?v=20260913-1','studyMaterialsCss');
await addScript(doc,'./study-materials-core.js?v=20260913-1','studyMaterialsCoreScript');
await addScript(doc,'./study-materials.js?v=20260913-1','studyMaterialsScript');
```

Because the injected files execute as classic browser scripts, `study-materials-core.js` must expose its browser API on `window.StudyMaterialsCore` in addition to ES-module exports used by Vitest.

- [ ] **Step 3: Bump the wrapper version label**

Change page title/badge copy from v4.0 to v4.1 and update iframe cache-busting query so browsers receive the new wrapper.

- [ ] **Step 4: Regression smoke test**

Verify these existing workspace buttons still open correctly: Assignments/Tracker, Canvas, Classroom, Omi Classes, Rewards. Then verify Documents opens and can return to those workspaces.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: load Documents workspace in tracker wrapper"
```

---

### Task 7: Backfill Carter and verify Phase 1 acceptance criteria

**Files:**
- No new source file required; use migration/data actions and test evidence.

**Interfaces:**
- Consumes: current Carter tracker user `27772610-bfed-4987-93b0-087c4fc8364c`, student key `carter`, the existing scraper-owner mapping in `classroom_student_profile_links`, existing Omi sessions, and current tracker state.
- Produces: canonical rows visible on Carter's Documents page.

- [ ] **Step 1: Run `syncStudyMaterials()` while signed in as Carter**

Expected: existing Google Classroom stored files are upserted under Carter's tracker owner id, not the scraper owner id.

- [ ] **Step 2: Verify source coverage in SQL**

Run a grouped count:

```sql
select class_name_snapshot, source_type, capture_status, count(*)
from public.study_materials
where owner_user_id = '27772610-bfed-4987-93b0-087c4fc8364c'::uuid
  and student_key = 'carter'
group by class_name_snapshot, source_type, capture_status
order by class_name_snapshot, source_type, capture_status;
```

Expected: APGO/Alvin Classroom files are present; Omi transcript rows appear when sessions exist; any existing manual tracker files appear under their class.

- [ ] **Step 3: Verify compact Documents behavior**

Confirm:

- every active class is shown even if it currently has zero materials;
- material rows are approximately 30 px high on desktop;
- descriptions are inline, not placed in separate blocks;
- Select All and Select None work;
- class-level checkbox works;
- Open works for a private stored file without redirecting to an inaccessible Google account;
- Download Selected produces one ZIP organized by class;
- text/transcript/link-only selections create files in the ZIP rather than disappearing.

- [ ] **Step 4: Run full tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Record Phase 1 completion**

Update the implementation plan checkboxes for completed tasks and commit only if plan tracking is being maintained in git.

---

## Self-Review

### Spec coverage for this phase

- Canonical normalized material model: Tasks 1–3.
- Existing Google Classroom, Omi, uploaded/tracker source ingestion: Task 3.
- Compact grouped Documents page: Task 4.
- Select All / Select None / class selection: Task 4.
- Private stored-file opening: Task 4.
- ZIP download grouped by class: Task 5.
- Transcript/link-only generated representations: Task 5.
- RLS/private Storage boundary: Tasks 2 and 5.
- Existing content migration/backfill and idempotency: Tasks 3 and 7.
- Regression protection for existing tracker workspaces: Task 6.

### Deferred deliberately to separate approved-spec plans

These are not omitted from the approved design; they are separate implementation plans because they are independently testable subsystems:

1. Phase 2 — extraction pipeline: PDF/DOCX/PPTX/XLSX extraction, OCR/vision, transcript block normalization, content hashes, extraction status/retry.
2. Phase 3 — one-class Outline Builder, source-cited generation, deduplication preserving unique information, editor, versions.
3. Phase 4 — Outlines library plus quiz/flashcard generation tied to outline versions.

No placeholder or ambiguous implementation step remains in Phase 1.
