# GEMINI / ANTIGRAVITY — Execute Phase 2B: Frontend Sprint Summary

Backend Phase 2A has completed successfully.

## Verified backend capabilities

Backend Scrum V2 now supports:

- Sprint Summary
- Review Meeting
- Review attendees
- Member Evaluation (scores 1–10)
- Historical Sprint aggregate based on `research_sprint_task_assignments`
- Division historical metrics
- Member contribution metrics
- Task outcome decisions:
  - `carry_over`
  - `backlog`
  - `cancelled`
- Transactional/idempotent Sprint finalization
- Concurrent finalize protection
- Carry-over target ledger without duplication
- Cancelled task history using `cancelled_at` / `cancelled_by`
- Closed Sprint read-only behavior
- Business error codes using `SCRUM_*`

Backend lifecycle remains:

```text
planning -> active -> review -> closed
```

Phase 1 frontend core is already complete and verified.

---

# Safety

Modify the **frontend repository only**.

Do NOT:

```text
deploy production
change production API URL
change secrets
modify backend source
implement GitHub integration
add a new UI framework
rewrite unrelated modules
commit automatically
use git add .
```

Use the existing frontend branch:

```text
feature/scrum-v2
```

If already active, do not recreate it.

---

# Before editing

Inspect:

```text
src/app/components/pages/operator/ScrumPlanning.tsx
src/app/components/organisms/SharedBoardView.tsx
src/app/components/pages/mahasiswa/ScrumBoard.tsx
src/app/components/templates/OperatorLayout.tsx
src/app/components/templates/DosenLayout.tsx
src/app/routes.tsx
src/app/lib/api.ts
src/app/lib/scrum.ts
package.json
```

Run baseline:

```bash
npm test
npm run build
git status --short
git diff --check
```

Record baseline. Do not stage anything.

---

# Important backend contract verification

Before implementing UI, verify the real backend response shape against the local Phase 2A backend.

Preferred endpoint:

```text
GET /api/research/:projectId/sprints/:sprintId/summary
```

Do not hardcode response fields purely from this specification if the actual backend returns slightly different casing or wrapper objects.

Normalize API fields in one frontend helper module.

If backend source is not mounted in the Antigravity workspace, inspect actual local API responses instead.

Do not modify backend to fit frontend.

---

# Goal

Change the current manager Scrum experience so that the main Scrum page becomes a real **Sprint Summary / Sprint Review workspace**, while existing Sprint Planning remains available on a separate route.

Final manager flow:

```text
Sprint Planning
      ↓
Active Sprint
      ↓
Akhiri Sprint
      ↓
Review
      ↓
Sprint Summary
      ├─ Overview
      ├─ Hasil
      ├─ Rapat
      ├─ Evaluasi Anggota
      └─ Carry Over
      ↓
Finalize
      ↓
Closed Sprint History
```

---

# Part A — New Sprint Summary page

Create a dedicated component rather than expanding `ScrumPlanning.tsx` excessively.

Recommended:

```text
src/app/components/pages/operator/SprintSummary.tsx
```

Optionally create reusable child components under a Scrum-specific folder if useful.

Dosen may reuse the same Summary page if the existing shared-role pattern permits.

---

# Part B — Navigation / routes

Manager routes should become:

```text
/operator/scrum
=> Sprint Summary

/operator/scrum/planning
=> existing ScrumPlanning

/dosen/scrum
=> Sprint Summary

/dosen/scrum/planning
=> existing ScrumPlanning
```

Do NOT delete `ScrumPlanning.tsx`.

Update sidebar/menu label from:

```text
Scrum & Sprint
```

to:

```text
Sprint Summary
```

Provide a clear action from Summary:

```text
Buka Sprint Planning
```

Also add an action from Planning:

```text
Buka Sprint Summary
```

Do not change:

```text
/mahasiswa/scrum
```

Students do not receive the manager Summary/evaluation workspace.

---

# Part C — Project and Sprint selection

At the top of Sprint Summary show:

```text
Project selector
Sprint selector/history
Sprint status badge
Sprint period
Sprint goal
```

Prefer default selection order:

```text
1. review Sprint if one exists
2. latest closed Sprint
3. active Sprint
4. latest planning Sprint
```

Suggested status labels:

```text
planning -> PLANNING
active   -> ACTIVE
review   -> MENUNGGU REVIEW
closed   -> CLOSED
```

---

# Part D — Summary sections

Use internal tabs:

```text
[ Overview ]
[ Hasil ]
[ Rapat ]
[ Evaluasi Anggota ]
[ Carry Over ]
```

Keep styling consistent with existing STAS-RG Tailwind/card design. Do not visually clone Jira.

---

# Part E — Overview

Render authoritative backend aggregate.

Show:

```text
Sprint Goal
Period
Planned Story Points
Completed Story Points
Completed Tasks
Unfinished Tasks
Achievement %
```

Do not recompute authoritative metrics independently if backend provides them.

Render dynamic Division Results using backend historical snapshots, including `Belum Ada Divisi` when present.

---

# Part F — Hasil / Results

Render backend historical lists:

## Completed Work

Group by Division when possible. Show task title, Story Points, final status, progress.

## Unfinished Work

Show task title, Division, status, SP, progress, and current outcome decision.

### Summary narrative

Manager can edit only while Sprint is `review`:

```text
Ringkasan Sprint
Capaian / Achievements
Challenges
Lessons Learned
Rencana / Improvement Sprint Berikutnya
```

Use explicit `Simpan Ringkasan` button for V1.

Closed Sprint => read-only.

---

# Part G — Review Meeting

While Sprint is `review`, show form:

```text
Tanggal Rapat
Waktu
Lokasi
Meeting Link
Pemimpin Rapat
Peserta
Agenda
Catatan Rapat
Keputusan Rapat
```

Use actual Project members. Participants use multi-select/checklist.

Closed => read-only.

---

# Part H — Member Evaluation

Backend determines required evaluated members. Do not reconstruct this list independently if backend provides it.

For each member show contribution evidence:

```text
Assigned Tasks
Completed Tasks
Planned SP
Completed SP
Carry Over
```

Then score fields:

```text
Task Completion   1–10
Quality           1–10
Timeliness        1–10
Collaboration     1–10
Initiative        1–10
```

Overall is read-only and must use backend-calculated value.

Notes are required.

Closed Sprint => read-only.

---

# Part I — Carry Over

Show only unfinished source-Sprint tasks.

Decision options:

```text
Pindahkan ke Sprint Berikutnya -> carry_over
Kembalikan ke Product Backlog -> backlog
Batalkan -> cancelled
```

For `carry_over`, show target Sprint selector from backend planning targets.

Do not offer active/review/closed/source Sprint as target.

Saving a decision must NOT remove the task from source Summary before Finalize.

Show decision badges such as:

```text
Akan dipindahkan ke Sprint 9
Kembali ke Backlog
Dibatalkan
```

---

# Part J — Finalization readiness

Use backend:

```text
canFinalize
finalizationErrors
```

Treat backend `canFinalize` as authoritative.

Show readiness checklist, for example:

```text
Ringkasan Sprint       ✓
Rapat Review           ✓
Evaluasi Anggota       6 / 6
Keputusan Task         3 / 3
```

---

# Part K — Finalize Sprint

Primary Review action:

```text
Finalize Sprint
```

Suggested confirmation:

```text
Finalisasi akan menutup Sprint ini dan menerapkan keputusan task yang belum selesai. Task carry-over akan dipindahkan ke Sprint target, task backlog akan dikembalikan ke Product Backlog, dan task yang dibatalkan tetap tersimpan di histori. Tindakan ini tidak dapat dibuka kembali pada versi saat ini.
```

Call actual backend endpoint:

```text
POST /research/:projectId/sprints/:sprintId/finalize
```

Handle success, already-finalized conflict, and `SCRUM_*` business errors.

After success:
1. reload Summary aggregate;
2. Sprint becomes `closed`;
3. page becomes read-only;
4. show finalizedBy/finalizedAt if provided.

Do not offer Reopen.

---

# Part L — Closed Sprint history

Closed Sprint remains fully readable:

```text
Overview
Results
Meeting
Evaluations
Carry-over outcomes
Finalization info
```

Disable all editing.

For a legacy closed Sprint without Summary row, show graceful text:

```text
Sprint ini diselesaikan sebelum fitur Sprint Summary diterapkan.
```

Do not crash.

---

# Part M — Active / Planning Sprint behavior

If selected Sprint is `active`:

```text
Sprint masih berjalan. Summary dapat diisi setelah Sprint diakhiri dan masuk tahap Review.
```

If selected Sprint is `planning`:

```text
Sprint belum dimulai.
```

No Review forms in either state.

---

# Part N — Integrate with ScrumPlanning

For `review` Sprint:

```text
Buka Summary
```

For `closed` Sprint:

```text
Lihat Summary
```

For `planning`:

```text
Mulai Sprint
```

For `active`:

```text
Akhiri Sprint
```

Do not duplicate Summary forms inside Planning.

---

# Part O — Integrate with SharedBoardView

When Project has no active Sprint but has a Review Sprint, existing Review banner should include:

```text
Buka Sprint Summary
```

Route to the correct role path.

---

# Part P — API normalization helper

Prefer creating/extending:

```text
src/app/lib/scrumSummary.ts
```

Normalize:
- camelCase / snake_case
- Summary aggregate
- Evaluation fields
- Division results
- Meeting fields
- Outcome fields
- `SCRUM_*` business errors

Do not scatter compatibility logic across components.

---

# Part Q — Loading / empty / error states

Implement clean states:

```text
Loading Summary...
No Sprint available
No completed work
No unfinished tasks
No evaluations required
No planning Sprint available for carry-over
Legacy closed Sprint without Summary
```

If no Planning target exists, explain:

```text
Buat Sprint Planning berikutnya terlebih dahulu.
```

Backlog/cancel remain available.

Display backend human-readable error messages; never display raw stack traces.

---

# Part R — Permissions

Manager/Dosen/Operator according to existing role model may edit Review artifacts when backend permits.

Students do not get the manager Summary route or controls.

Backend remains security authority.

---

# Part S — Tests

Use existing frontend test infrastructure.

Add focused tests for:
- Summary normalization
- Sprint default selection
- Evaluation validation
- Overall display handling
- Carry-over target view model
- Finalization readiness
- Legacy closed Sprint handling
- `SCRUM_*` error normalization

Do not add a new framework/dependency.

Run:

```bash
npm test
npm run build
```

---

# Manual acceptance scenarios

1. Review Sprint opens by default.
2. Overview metrics match backend exactly.
3. Summary save persists after reload.
4. Meeting + attendees persist after reload.
5. Evaluation `8,9,8,9,8` displays backend overall `8.4`.
6. Missing evaluation blocks Finalize.
7. Carry-over/backlog/cancel decisions remain visible before Finalize.
8. Finalize changes Sprint to closed/read-only.
9. Carried task remains visible in source Sprint history after moving to target Sprint.
10. Legacy closed Sprint without Summary does not crash.
11. After source Sprint closed, next Planning Sprint can be started from Planning.

---

# Acceptance Gate

Report PASS/FAIL:

```text
[ ] Summary route operator PASS
[ ] Summary route dosen PASS
[ ] Planning route preserved PASS
[ ] review Sprint default selection PASS
[ ] Overview aggregate PASS
[ ] Division historical results PASS
[ ] completed/unfinished work PASS
[ ] Summary save PASS
[ ] Meeting save/attendees PASS
[ ] Evaluation 1–10 PASS
[ ] notes-required validation PASS
[ ] backend Overall display PASS
[ ] contribution metrics PASS
[ ] Carry Over decision PASS
[ ] Planning target selection PASS
[ ] source task remains visible before Finalize PASS
[ ] readiness checklist PASS
[ ] backend canFinalize authoritative PASS
[ ] Finalize PASS
[ ] Closed read-only PASS
[ ] finalized info PASS
[ ] legacy closed Sprint graceful PASS
[ ] SharedBoard Review link PASS
[ ] ScrumPlanning Summary link PASS
[ ] Student route unaffected PASS
[ ] SCRUM_* error handling PASS
[ ] loading/empty states PASS
[ ] frontend tests PASS
[ ] frontend build PASS
[ ] git diff --check PASS
[ ] intended files only PASS
```

Any required FAIL => `PHASE 2B NOT COMPLETE`.

Do not proceed to GitHub integration.

---

# Git Safety

Do not commit automatically and do not use `git add .`.

At completion:

```bash
git status --short
git diff --check
```

List exact changed/new files.

---

# Required final report

```text
PHASE 2B FRONTEND SUMMARY RESULT

Files Changed
Routes / Navigation
Sprint Selection
Overview
Historical Division Results
Results
Review Meeting
Member Evaluation
Carry Over
Finalize
Closed Sprint History
Legacy Compatibility
Permissions
Error Handling
Tests
Git Safety
Acceptance Gate
Decision: PHASE 2B COMPLETE / NOT COMPLETE
Known Limitations
Next Step: STOP. Do not begin GitHub integration automatically.
```
