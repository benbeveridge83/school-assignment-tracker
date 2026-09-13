# Student Materials + Outline Workflow Design

Date: 2026-09-13
Project: School Assignment Tracker

## Classification

Architectural change. This adds three connected subsystems to the existing tracker: a unified student materials library, an outline generation/editor workflow, and outline-derived quiz/flashcard generation.

## Goal

Create one coherent study-material pipeline for each student. Every piece of class-associated content should be discoverable in one place, selectable, downloadable, extractable, and usable to build source-cited study outlines. Each outline belongs to exactly one class. Saved outlines become the canonical source for quiz and flashcard generation.

## Product Decisions

- A student's Documents page includes every material associated with the student's classes, regardless of source.
- Material sources include Google Classroom, manually uploaded files, existing tracker/test files, Omi transcripts, other class transcripts, Classroom posts/materials, link-only resources, and future supported sources.
- Documents are grouped by class.
- Rows are intentionally compact: one line where possible, with checkbox, filename/title, type/source, short description, capture/status, and actions inline.
- Documents page controls include Select All, Select None, and Download Selected.
- Download Selected produces one ZIP file. ZIP contents are organized into class folders.
- Non-file content such as transcripts, posts, or link-only content is materialized into a downloadable text or PDF representation so selected content is never silently omitted.
- Outline Builder operates on one class at a time. Cross-class outlines are not allowed.
- Outline Builder can use any materials associated with that class.
- Images, screenshots, scanned PDFs, and image-based slides/PDF pages are processed with OCR/vision extraction.
- Generated outlines remove navigation noise, boilerplate, duplicate content, and obvious fluff, but do not intentionally omit unique substantive information.
- Duplicate substantive information from multiple sources is merged into one organized location while preserving every unique detail.
- Merged outline sections carry multiple source references when appropriate.
- Source references should be as specific as the extraction permits: source title plus page, slide, timestamp, post date, or section locator.
- Outlines are editable in a document-style viewer and can be saved as revised versions.
- Saved outlines are grouped by class on an Outlines page.
- Quizzes and flashcards are generated from saved outlines, not directly from arbitrary raw files. Regeneration after outline edits is supported.

## Approaches Considered

### A. Continue storing everything inside `tracker_data` JSON and add more UI to the existing monolithic HTML

Rejected as the primary design. It is fast initially but would make file indexing, outline versions, source citations, extraction status, ZIP generation, and future source integrations increasingly fragile. Large JSON rewrites also create unnecessary synchronization risk.

### B. Build a separate study-material application beside the tracker

Rejected. It would duplicate students/classes/authentication and fragment the user experience. Materials should remain part of the existing tracker.

### C. Recommended: normalized Supabase study-material subsystem integrated into the tracker

Use the existing tracker identity/class model for presentation, while introducing normalized tables for materials, extracted content, outlines, citations, and generated study assets. Existing `tracker_data` remains compatible for current features, but the new subsystem becomes the canonical store for study materials and outlines.

This is the selected approach.

## Navigation

Add three primary tracker destinations for the selected student:

1. **Documents**
2. **Outline Builder**
3. **Outlines**

Quiz and Flashcard actions live on the Outlines page and may also deep-link to existing quiz/study experiences.

## Documents Page

### Layout

The page shows all current classes for the selected student. Each class is a compact section:

- Class heading with material count.
- Dense table/list beneath it.
- No card-per-document layout.
- Default row target: approximately 28-36 px tall on desktop, slightly larger on mobile.

Recommended columns:

- checkbox
- title / filename
- type
- source
- short description
- status
- actions

The description should remain inline and truncate with a tooltip/expand affordance rather than increasing row height.

### Material states

Each material receives a normalized status such as:

- Stored file
- Text captured
- OCR extracted
- Transcript
- Link only
- Extraction pending
- Extraction failed

A link-only item remains visible and selectable. If its content can later be captured, its record is upgraded rather than duplicated.

### Selection

- Select All selects all visible materials across classes.
- Select None clears all selections.
- Class-level selection checkbox is available in each class heading.
- Filters do not destroy current selections unless explicitly cleared.

### Download Selected

A ZIP job gathers selected materials and produces:

```
Student Name - Materials.zip
  /AP Government/
    Unit 1 Notes.pdf
    Omi Transcript - 2026-09-09.txt
    Classroom Post - Quiz Instructions.pdf
  /AP Literature/
    ...
```

For stored binary files, include the stored copy. For transcripts/posts/text-only materials, generate a `.txt` or `.pdf` representation with source metadata. For link-only resources whose content is unavailable, include a small `.txt` reference file containing the title, source URL, description, and status rather than silently dropping the item.

## Unified Material Model

Create a canonical material record per class-associated item.

Recommended fields:

- `id`
- `owner_user_id`
- `student_key`
- `class_id`
- `class_name_snapshot`
- `title`
- `description`
- `source_type`
- `source_id`
- `original_url`
- `storage_bucket`
- `storage_path`
- `mime_type`
- `material_kind`
- `capture_status`
- `captured_at`
- `source_created_at`
- `metadata jsonb`
- timestamps

`source_type` examples: `google_classroom`, `manual_upload`, `omi`, `tracker`, `class_transcript`, `canvas`, `generated_reference`.

Deduplication keys should prefer stable upstream IDs when available, otherwise a source-aware fingerprint based on class, URL/storage path, normalized title, and content hash.

## Content Extraction Pipeline

Every material can have zero or more extracted content blocks.

### Text-native files

Extract text from PDFs, DOCX, PPTX, XLSX/CSV where practical, plain text, and HTML/text sources. Preserve locators such as page, slide, sheet, section, or paragraph index.

### Images and scanned documents

Use OCR/vision extraction. Each extracted block records a locator such as page number or image identifier and preserves enough context to support citations.

### Slides

Extract both native slide text and visible text from slide images where necessary. Preserve slide number.

### Transcripts

Preserve timestamps when available. Transcript extraction should separate substantive class content from obvious recorder/system noise, but should not summarize away unique instructional content.

### Extraction record

Recommended fields:

- `id`
- `material_id`
- `sequence_no`
- `locator_type`
- `locator_value`
- `text`
- `content_hash`
- `extraction_method`
- `extraction_status`
- `metadata jsonb`

Extraction is idempotent: unchanged materials should not be reprocessed unnecessarily.

## Outline Builder

### Class constraint

The user first selects exactly one class. Only materials for that class appear in the builder.

### Material picker

Use the same dense row presentation as Documents, with checkboxes and source/status indicators. Include:

- Select All
- Select None
- optional source/type filters
- selected material count
- Create Outline

### Outline generation behavior

The generator receives the extracted content blocks for the selected materials plus their source metadata.

Requirements:

1. Preserve all unique substantive information.
2. Remove duplicated passages, navigation text, login/footer boilerplate, repeated headers, and obvious non-study noise.
3. Merge duplicate concepts into one logical place.
4. Preserve differences, exceptions, examples, definitions, dates, names, formulas, quotations needed for study, teacher-specific instructions, and other unique details.
5. Organize hierarchically using headings and nested bullets.
6. Never invent unsupported facts.
7. Attach source references to each substantive section/bullet at the smallest practical scope.
8. When multiple sources support a merged statement, cite all relevant sources.
9. Mark conflicts instead of silently choosing one source over another.

### Citation format

Human-readable inline references, for example:

- `[Unit 1 Notes, p. 4]`
- `[Supreme Court Cases Poster, slide 7]`
- `[Omi transcript, Sep. 9, 10:22 AM]`
- `[Classroom post, Sep. 6]`

Internally, each citation also stores structured references to `material_id` and extraction block IDs so the UI can open the source later.

## Outline Editor

After generation, open the outline in a document-style editor/viewer.

Capabilities:

- edit text directly
- add/delete/reorder headings and bullets
- preserve citations while editing
- click a citation to open source detail when possible
- save
- Save As New Version
- rename outline
- export/download outline as PDF and/or DOCX in a later implementation phase if practical

Autosave may be added, but explicit Save remains visible.

## Outline Storage

Recommended `study_outlines` fields:

- `id`
- `owner_user_id`
- `student_key`
- `class_id`
- `title`
- `status`
- `current_version`
- `created_at`
- `updated_at`

Recommended `study_outline_versions` fields:

- `id`
- `outline_id`
- `version_no`
- `content_json`
- `content_text`
- `created_at`

Recommended `study_outline_citations` fields:

- `id`
- `outline_version_id`
- `outline_node_id`
- `material_id`
- `content_block_id`
- `display_label`
- `locator`

The structured `content_json` is canonical for editing; `content_text` is a searchable/export-friendly rendering.

## Outlines Page

Group saved outlines by class. Each outline row/card shows:

- title
- class
- last updated
- version
- source count
- Edit
- Download/Export
- Create Quiz
- Create Flashcards

Keep this page denser than a card-heavy dashboard, but outlines may have slightly taller rows than individual documents.

## Quiz + Flashcard Generation

Generated study tools are derived from a specific outline version.

Recommended shared record fields:

- `id`
- `outline_id`
- `outline_version_id`
- `type` (`quiz` or `flashcards`)
- `content_json`
- `created_at`
- `updated_at`

When the outline changes, existing quizzes/flashcards remain tied to the version they came from and display a `Source outline has changed` indicator with a Regenerate action.

Quiz questions and flashcards should maintain source traceability where practical, using the outline's citations.

## Data Flow

1. Scrapers/uploads/transcript integrations create or update canonical material records.
2. Binary files live in Supabase Storage; metadata lives in normalized tables.
3. Extraction pipeline creates locator-aware text blocks.
4. Documents page reads canonical material records.
5. Download Selected resolves selected records into a ZIP.
6. Outline Builder reads one class's material records and extraction blocks.
7. Outline generation consolidates content while preserving unique information and citations.
8. User edits and saves outline versions.
9. Quizzes/flashcards are generated from a selected saved outline version.

## Migration of Existing Content

Existing content must be imported rather than abandoned.

Initial migration sources:

- latest `google_classroom_scrapes` records
- `classroom-files` Storage objects
- materials currently embedded in `tracker_data`
- manually uploaded test/class files already represented in tracker state
- Omi transcript records/data

Migration should be idempotent and source-aware to prevent duplicates.

## Security and Access

- Continue using Supabase Auth identity boundaries.
- Material metadata and outline tables require row-level security keyed to the owning authenticated user.
- Storage remains private.
- File downloads use authenticated/signed access, not public buckets.
- Do not store Google passwords or session credentials in Supabase.
- Scraper browser profiles remain local to the user's machine.

## Error Handling

- A failed extraction does not hide the material; show `Extraction failed` with retry.
- A missing binary file does not delete metadata; show `File unavailable`.
- A link-only resource remains selectable and receives a reference-file representation in ZIP downloads.
- Outline generation records which selected materials failed extraction and shows them before final generation so missing content is never silently ignored.
- Outline generation failures preserve the selection and allow retry.
- ZIP generation reports skipped/failed items explicitly if any remain unresolved.

## Performance

- Do not load every binary file when rendering Documents.
- Query metadata first; fetch content only for download/extraction/preview.
- Paginate or virtualize only if the student's material count grows enough to require it; dense grouped lists are preferred initially.
- Extraction results are cached by content hash.
- Outline generation consumes extracted text blocks, not raw binaries, after initial processing.

## UI Integration Strategy

The current `tracker-v3.9-base.html` is already large. New study-material behavior should not be added as another large inline subsystem if avoidable.

Preferred implementation:

- add lightweight navigation hooks to the tracker
- create a dedicated `study-materials.js` module for Documents, Outline Builder, Outlines, selection state, and API calls
- create a focused stylesheet or scoped CSS block for dense material rows
- use Supabase tables/storage for persistence
- keep existing class/test tracker features functioning during migration

If GitHub Pages module loading constraints make module separation awkward, use one external script loaded by the tracker rather than embedding thousands of new lines in the base HTML.

## Initial Build Phases

### Phase 1 — Canonical materials + Documents page

- schema/RLS
- material migration/import
- compact grouped Documents UI
- selection controls
- stored-file opening
- ZIP download including generated text/PDF representations

### Phase 2 — Extraction

- text-native extraction
- OCR/vision extraction
- transcript normalization
- extraction status UI

### Phase 3 — Outline Builder + editor

- one-class material selection
- source-cited generation
- deduplication preserving unique information
- editable viewer
- versioned saving

### Phase 4 — Outlines + study generation

- saved outline library
- quiz generation
- flashcard generation
- stale-version/regenerate indicators

## Acceptance Criteria

### Documents

- User can select a student and see every associated material grouped by class.
- Rows are compact and source/type/description/status are visible inline.
- Select All and Select None work.
- Download Selected produces one ZIP organized by class.
- Non-binary materials are included as generated downloadable representations.

### Outline Builder

- User can select exactly one class.
- User can select any subset of that class's materials.
- OCR/vision-extracted sources can participate.
- Generated outline preserves all unique substantive information while consolidating duplicates.
- Every substantive section has traceable source references.

### Outlines

- Outline can be edited and saved.
- Versions are retained.
- Saved outlines are visible by class.
- Quiz and flashcard generation uses a specific saved outline version.

## Testing Strategy

- Unit-test material normalization and deduplication logic.
- Unit-test citation label generation and source merging.
- Unit-test ZIP manifest generation, including transcript/link-only fallbacks.
- Integration-test Supabase RLS using two different user identities.
- Integration-test migration idempotency.
- Browser-test Documents selection behavior and dense row layout.
- Browser-test one-class-only Outline Builder constraint.
- Regression-test existing tracker class/test workflows, Classroom synchronization, and Omi integration.
- Use representative files: text PDF, scanned PDF, DOCX, slide deck, image, transcript, Classroom post, and link-only material.

## Non-Goals for the First Build

- Cross-class outlines.
- Public sharing/community features.
- Collaborative multi-user outline editing.
- Sophisticated semantic search across all students.
- Replacing the existing tracker entirely.

## Implementation Principle

The new workflow should make `class material -> extracted content -> cited outline -> quiz/flashcards` one traceable pipeline. Raw source material remains intact; generated artifacts never replace the source, and every derived study item should remain traceable back to the material used to create it.
