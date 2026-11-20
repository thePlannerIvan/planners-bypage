# Architecture

## Purpose and overview

Planners Bypage owns the realization of research or proposal judgments. It turns a saved Storyline (`.planners/storyline.md`), a working Storyline formed from supplied materials, or a non-PPT material package received from PPT Hell into complete page content that can be handed to PPT production.

## Modules

| Module | Unique owner | Interface | Does not do |
|---|---|---|---|
| Handoff intake | This Skill | Upstream memory, source index, `.planners/storyline.md`, document contract | Does not silently change upstream direction |
| Content realization | This Skill | Page-level content tasks and full argument expansion | Does not reduce a Storyline to a summary |
| By-page document | This Skill | `.planners/by-page.md` (`planners-doc/2`: `#` chapter, `##` page, three `###` body sections, trailing quotes as sources) | Does not decide PPT layout or template |
| Sources and fact binding | This Skill | Page-end quote blocks (the sources area) + `.planners/fact-audit.json` | Does not rewrite audit conclusions into the body |
| Images | This Skill + `planners-review-core` | Markdown references + derived `by-page.assets.json` (`doc-assets/1`) | Does not claim file bytes prove visual correctness |
| Review and handoff | `planners-review-core` owns the workbench; this Skill owns content | `doc-workbench.mjs` block editing, tasks, locks, conflicts | Does not ask Validator to judge rhetorical quality |

## Entry paths

- Proposal handoff: read `.planners/storyline.md`, run `scripts/import-storyline-doc.mjs`, then expand each page's claim and supports into the four sections.
- PPT Hell material intake: receive a non-PPT source package when PPT Hell needs content understanding before visual production; form the working structure here and return the completed By-page.
- Standalone: form a working structure from the supplied materials when no upstream Storyline exists.

The three paths share the same content realization and delivery responsibility after the structure is understood.

## Seams

The shared path/ownership interface is `references/content-handoff.md`. Proposal hands over its preserved memory, source index, `.planners/storyline.md` and document contract. Bypage uses `scripts/import-storyline-doc.mjs` to preserve page identity, claims and sources, then writes `.planners/by-page.md`. The old `adapt-proposal-architecture.mjs` and `page-architecture.json` remain only for existing JSON projects.

`scripts/validate-bypage-doc.mjs` is the only Bypage validator: it calls `planners-review-core/scripts/validate-doc.mjs` for structure, reuses `lib/doc-blocks.mjs` for pages and blocks, and delegates image registration to `validate-doc-assets.mjs`. There is no second parser.

`planners-review-core` owns the document workbench: block anchors, save, locks, pending review and block-level tasks. This Skill owns what to write and how sources and the fact audit bind to the current document. `review-inbox.mjs` and the per-page review builders are legacy-only.

## Scope boundary

By-page decides what the audience needs to see and how the argument should be expressed in content. `$planners-ppt-hell` decides layout, slots, cropping and PPTX implementation. Validators check mechanical and authenticity properties; they do not decide whether the story is sufficiently developed.

The current `build-reviewed-copy.mjs` / `production-export.mjs` path still reads the legacy per-page draft. Connecting `.planners/by-page.md` to the PPT Hell importer is a separate ticket; until it lands, handoff must name the actual available production route.

## Retired behavior

`SKILL.md` owns the five-step workflow. The duplicate `WORKFLOW.md`, eight stage instructions and local writing/language rulebooks were retired; writing uses `slide-copy` and optional `storytelling`. Legacy Storyline/sample review CLIs remain for existing project continuation and regression compatibility, not as required entry gates. Fact-check independence and agent reuse belong to `planners-fact-check`, not Review Core.

New projects no longer start from `page-architecture.json`, no longer use the per-page `bypage-draft.md` frontmatter as the working document, and no longer put audit markers in the body. Page numbers are not written into the document; identity is chapter + order + title.
