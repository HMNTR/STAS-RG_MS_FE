import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PICKET_AUTO_VALIDATED_SUCCESS_MESSAGE,
  getDuplicatePicketTaskAssignments,
  getManualPicketSchedulePayloads,
  getManualPicketTaskPayload,
  getPicketSubmissionErrorMessage,
  getPicketTaskConflict,
  getPicketScheduleGeneratePayload,
  getPicketAssignmentStatus,
  getPicketHolidayFromTodayResponse,
  hasPicketPhotoSubmission,
  isPicketHolidayResponse,
  mapPicketAssignment,
  mapPicketHoliday,
  mapPicketLeaveRequest,
  mapPicketSubmission,
  mapPicketSubmissionResult,
  mapPicketStudentDay,
  mapPicketTask,
  mapPicketTodayAssignment,
  filterActivePicketStudents,
  isAlumniStudent,
  shouldDisablePicketSubmissionSubmit,
  shouldRequirePicketPhoto,
  validatePicketPhoto,
} from "../../src/app/lib/picket";

test("mapPicketTask reads snake_case task fields", () => {
  assert.deepEqual(mapPicketTask({
    task_id: "T1",
    task_name: "Sapu ruang lab",
    description: "Area depan",
    is_active: true,
  }), {
    id: "T1",
    name: "Sapu ruang lab",
    description: "Area depan",
    active: true,
  });
});

test("mapPicketAssignment normalizes assignment and submission aliases", () => {
  assert.deepEqual(mapPicketAssignment({
    schedule_id: "SCH1",
    assignment_id: "A1",
    schedule_date: "2026-05-24",
    day_id: 0,
    day_name: "Minggu",
    student_id: "M1",
    student_name: "Ilham",
    task_name: "Bersihkan meja",
    has_submission: true,
    submission_id: "S1",
  }), {
    id: "SCH1",
    scheduleId: "SCH1",
    assignmentId: "A1",
    date: "2026-05-24",
    scheduleDate: "2026-05-24",
    dayId: 0,
    dayName: "Minggu",
    studentId: "M1",
    studentName: "Ilham",
    studentInitials: "IL",
    nim: null,
    taskId: null,
    taskName: "Bersihkan meja",
    taskDescription: null,
    status: "Dijadwalkan",
    notes: null,
    submissionStatus: null,
    leaveStatus: null,
    submitted: true,
    autoCompletedByWfh: false,
    autoLeaveType: null,
    autoLeaveRequestId: null,
    submissionId: "S1",
    photoUrl: null,
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null,
    isHoliday: false,
    isExempt: false,
    holiday: null,
  });
});

test("WFH on a picket day maps auto-completion aliases without treating it as a photo submission", () => {
  const snake = mapPicketAssignment({
    schedule_id: "SCH-WFH-1",
    assignment_id: "ASN-WFH-1",
    schedule_date: "2026-08-14",
    task_name: "Bersihkan lab",
    submitted: true,
    status: "Selesai",
    auto_completed_by_wfh: true,
    auto_leave_type: "wfh",
    auto_leave_request_id: "LEAVE-WFH-1",
    submission_id: null,
    submission_status: null,
    photo_url: null,
  });
  const camel = mapPicketAssignment({
    scheduleId: "SCH-WFH-2",
    scheduleDate: "2026-08-21",
    taskName: "Rapikan meja",
    submitted: true,
    status: "Selesai",
    autoCompletedByWfh: true,
    autoLeaveType: "wfh",
    autoLeaveRequestId: "LEAVE-WFH-2",
  });

  assert.equal(snake.autoCompletedByWfh, true);
  assert.equal(snake.autoLeaveType, "wfh");
  assert.equal(snake.autoLeaveRequestId, "LEAVE-WFH-1");
  assert.equal(camel.autoCompletedByWfh, true);
  assert.equal(camel.autoLeaveType, "wfh");
  assert.equal(camel.autoLeaveRequestId, "LEAVE-WFH-2");
  assert.equal(getPicketAssignmentStatus(snake), "Selesai Otomatis — WFH");
  assert.equal(hasPicketPhotoSubmission(snake), false);
  assert.equal(shouldRequirePicketPhoto(snake), false);
});

test("attendance picketToday wrapper preserves an auto-completed WFH assignment", () => {
  const item = mapPicketTodayAssignment({
    assignment: {
      status: "Selesai",
      submitted: true,
      autoCompletedByWfh: true,
      auto_completed_by_wfh: true,
      autoLeaveType: "wfh",
      auto_leave_type: "wfh",
      autoLeaveRequestId: "LR-WFH-ATTENDANCE-1",
      auto_leave_request_id: "LR-WFH-ATTENDANCE-1",
      leaveStatus: "Disetujui",
      leave_status: "Disetujui",
      submissionId: null,
      photoUrl: null,
    },
  });

  assert.ok(item);
  assert.equal(item.autoCompletedByWfh, true);
  assert.equal(item.autoLeaveType, "wfh");
  assert.equal(item.autoLeaveRequestId, "LR-WFH-ATTENDANCE-1");
  assert.equal(item.leaveStatus, "Disetujui");
  assert.equal(shouldRequirePicketPhoto(item), false);
});

test("WFH outside a picket day keeps today's assignment empty", () => {
  assert.equal(mapPicketTodayAssignment({
    assignment: null,
    approvedLeave: {
      type: "wfh",
      date: "2026-08-14",
    },
  }), null);
});

test("ordinary picket photo submission keeps the Terkirim behavior", () => {
  const item = mapPicketAssignment({
    schedule_id: "SCH-PHOTO-1",
    schedule_date: "2026-08-14",
    task_name: "Bersihkan lab",
    submitted: true,
    submission_status: "Terkirim",
    submission_id: "SUB-PHOTO-1",
    photo_url: "/uploads/piket/photo-1.jpg",
  });

  assert.equal(item.autoCompletedByWfh, false);
  assert.equal(hasPicketPhotoSubmission(item), true);
  assert.equal(shouldRequirePicketPhoto(item), false);
  assert.equal(getPicketAssignmentStatus(item), "Terkirim");
  assert.equal(getPicketAssignmentStatus(mapPicketAssignment({
    schedule_id: "SCH-PHOTO-2",
    task_name: "Rapikan lab",
    submitted: true,
  })), "Terkirim");
});

test("approved non-WFH picket leave does not require a photo", () => {
  const item = mapPicketAssignment({
    schedule_id: "SCH-LEAVE-1",
    schedule_date: "2026-08-14",
    task_name: "Bersihkan lab",
    leave_status: "Disetujui",
    submitted: false,
  });

  assert.equal(item.autoCompletedByWfh, false);
  assert.equal(hasPicketPhotoSubmission(item), false);
  assert.equal(shouldRequirePicketPhoto(item), false);
  assert.equal(getPicketAssignmentStatus(item), "Dijadwalkan");
});

test("mapPicketAssignment normalizes holiday and exemption aliases", () => {
  const item = mapPicketAssignment({
    schedule_id: "SCH-HOL-1",
    schedule_date: "2026-08-17",
    is_holiday: true,
    is_exempt: true,
    holiday: {
      holiday_id: "PKT-HOL-1",
      date: "2026-08-17",
      holiday_name: "Hari Kemerdekaan",
      notes: "Piket diliburkan",
    },
  });

  assert.equal(item.isHoliday, true);
  assert.equal(item.isExempt, true);
  assert.deepEqual(item.holiday, {
    id: "PKT-HOL-1",
    date: "2026-08-17",
    name: "Hari Kemerdekaan",
    notes: "Piket diliburkan",
    source: "picket",
    editable: true,
  });
});

test("mapPicketHoliday marks system work holidays as read-only picket holidays", () => {
  assert.deepEqual(mapPicketHoliday({
    id: "system:2026-08-17",
    date: "2026-08-17",
    name: "Hari Kemerdekaan",
    source: "system",
  }), {
    id: "system:2026-08-17",
    date: "2026-08-17",
    name: "Hari Kemerdekaan",
    notes: null,
    source: "system",
    editable: false,
  });
});

test("picket holiday helpers read top-level today response", () => {
  const response = {
    assignment: null,
    isHoliday: true,
    isExempt: true,
    holiday: {
      id: "PKT-HOL-2",
      date: "2026-08-17",
      name: "Hari Kemerdekaan",
    },
  };

  assert.equal(isPicketHolidayResponse(response), true);
  assert.deepEqual(getPicketHolidayFromTodayResponse(response), mapPicketHoliday(response.holiday));
});

test("mapPicketLeaveRequest reads replacement schedule aliases", () => {
  const camel = mapPicketLeaveRequest({
    id: "LV-1",
    tanggal: "2026-05-24",
    alasan: "Sakit",
    replacementScheduleId: "SCH-RPL-1",
    replacementDate: "2026-05-26",
  });
  const snake = mapPicketLeaveRequest({
    id: "LV-2",
    date: "2026-05-25",
    reason: "Kegiatan kampus",
    replacement_schedule_id: "SCH-RPL-2",
    replacement_date: "2026-05-27",
  });

  assert.equal(camel.reason, "Sakit");
  assert.equal(camel.replacementScheduleId, "SCH-RPL-1");
  assert.equal(camel.replacementDate, "2026-05-26");
  assert.equal(snake.replacementScheduleId, "SCH-RPL-2");
  assert.equal(snake.replacementDate, "2026-05-27");
});

test("mapPicketLeaveRequest preserves historical picket leave statuses", () => {
  for (const status of ["Menunggu", "Disetujui", "Ditolak"]) {
    assert.equal(mapPicketLeaveRequest({ id: `LV-${status}`, status }).status, status);
  }
});

test("new picket leave remains pending without a replacement schedule", () => {
  const item = mapPicketLeaveRequest({
    id: "LV-PENDING-1",
    status: "Menunggu",
    replacementScheduleId: null,
    replacementDate: null,
  });

  assert.equal(item.status, "Menunggu");
  assert.equal(item.replacementScheduleId, null);
  assert.equal(item.replacementDate, null);
});

test("picket submission submit stays disabled while uploading or without a photo", () => {
  assert.equal(shouldDisablePicketSubmissionSubmit(true, true), true);
  assert.equal(shouldDisablePicketSubmissionSubmit(false, false), true);
  assert.equal(shouldDisablePicketSubmissionSubmit(false, true), false);
});

test("picket submission errors use backend messages for supported HTTP statuses", () => {
  for (const status of [400, 409, 422, 500]) {
    assert.equal(getPicketSubmissionErrorMessage({ status, body: { message: `Backend ${status}` } }), `Backend ${status}`);
  }
  assert.equal(getPicketSubmissionErrorMessage(new TypeError("Failed to fetch")), "Gagal mengirim bukti piket. Silakan coba lagi.");
});

test("submission review is removed while leave approval remains available", () => {
  const studentPicketSource = readFileSync(join(process.cwd(), "src/app/components/pages/mahasiswa/Piket.tsx"), "utf8");
  const submissionHistorySource = readFileSync(join(process.cwd(), "src/app/components/pages/mahasiswa/PicketHistory.tsx"), "utf8");
  const operatorPicketSource = readFileSync(join(process.cwd(), "src/app/components/pages/operator/PiketOperator.tsx"), "utf8");
  const submissionSectionSource = operatorPicketSource.split("Riwayat Submission Piket")[1]?.split("Pengajuan Izin Piket")[0] || "";

  assert.doesNotMatch(operatorPicketSource, /picket\/submissions\/[^\s`"']+\/review/);
  assert.doesNotMatch(operatorPicketSource, /reviewSubmission|markProblemAndBlock/);
  assert.doesNotMatch(submissionSectionSource, /<button/);
  assert.match(operatorPicketSource, />\s*Setujui\s*</);
  assert.match(operatorPicketSource, />\s*Tolak\s*</);
  assert.match(operatorPicketSource, /picket\/leave-requests\/\$\{encodeURIComponent\(request\.id\)\}\/status/);
  assert.match(studentPicketSource, /PICKET_AUTO_VALIDATED_SUCCESS_MESSAGE/);
  assert.match(studentPicketSource, /shouldDisablePicketSubmissionSubmit\(saving, Boolean\(photoFile\)\)/);
  assert.doesNotMatch(submissionHistorySource, /Menunggu review operator/);
  assert.match(submissionHistorySource, /<option value="Terkirim">Terkirim<\/option>/);
  assert.match(submissionHistorySource, /<option value="Valid">Valid<\/option>/);
  assert.match(submissionHistorySource, /<option value="Bermasalah">Bermasalah<\/option>/);
});

test("mapPicketStudentDay normalizes fixed weekday response", () => {
  assert.deepEqual(mapPicketStudentDay({
    student_id: "STD-1",
    student_name: "Alya",
    nim: "12345",
    day_id: 4,
    day_name: "Kamis",
    effective_from: "2026-08-11",
  }), {
    studentId: "STD-1",
    studentName: "Alya",
    nim: "12345",
    dayId: 4,
    dayName: "Kamis",
    assignedBy: null,
    assignedAt: null,
    effectiveFrom: "2026-08-11",
  });
});

test("mapPicketAssignment reads submission review fields", () => {
  const item = mapPicketAssignment({
    schedule_id: "SCH2",
    student_id: "M2",
    task_name: "Rapikan lab",
    submission_id: "SUB2",
    submission_status: "Valid",
    reviewed_at: "2026-06-15T08:21:44.488Z",
    reviewed_by: "OP1",
    review_note: "Foto sudah sesuai",
  });

  assert.equal(item.reviewedAt, "2026-06-15T08:21:44.488Z");
  assert.equal(item.reviewedBy, "OP1");
  assert.equal(item.reviewNote, "Foto sudah sesuai");
});

test("mapPicketSubmission reads approval endpoint response", () => {
  assert.deepEqual(mapPicketSubmission({
    id: "SUB-1",
    scheduleId: "SCH-1",
    assignmentId: "ASN-1",
    studentId: "STD-1",
    studentName: "Alya",
    nim: "12345",
    taskName: "Bersihkan lab",
    date: "2026-08-17",
    photoUrl: "/uploads/piket/sub-1.jpg",
    submittedAt: "2026-08-17T01:00:00.000Z",
    status: "Terkirim",
    reviewNote: null,
  }), {
    id: "SUB-1",
    scheduleId: "SCH-1",
    assignmentId: "ASN-1",
    date: "2026-08-17",
    studentId: "STD-1",
    studentName: "Alya",
    studentInitials: "AL",
    nim: "12345",
    taskName: "Bersihkan lab",
    photoUrl: "https://ms-api.stas-rg.com/uploads/piket/sub-1.jpg",
    submittedAt: "2026-08-17T01:00:00.000Z",
    status: "Terkirim",
    reviewedAt: null,
    reviewNote: null,
  });
});

test("mapPicketSubmissionResult reads nested submission response", () => {
  assert.deepEqual(mapPicketSubmissionResult({
    submission: {
      submission_id: "SUB1",
      review_status: "Terkirim",
      photo_url: "/uploads/piket.jpg",
      submitted_at: "2026-06-11T03:00:00.000Z",
    },
  }), {
    id: "SUB1",
    status: "Terkirim",
    assignmentStatus: null,
    photoUrl: "https://ms-api.stas-rg.com/uploads/piket.jpg",
    submittedAt: "2026-06-11T03:00:00.000Z",
    reviewedAt: null,
    reviewNote: null,
  });
});

test("automatic submission response maps Valid submission and Selesai assignment statuses", () => {
  const result = mapPicketSubmissionResult({
    submissionStatus: "Valid",
    submission: {
      id: "SUB-AUTO-1",
      status: "Valid",
      reviewedAt: "2026-09-08T02:00:00.000Z",
      reviewNote: "Divalidasi otomatis oleh sistem.",
    },
    assignment: {
      status: "Selesai",
    },
  });

  assert.equal(result.status, "Valid");
  assert.equal(result.assignmentStatus, "Selesai");
  assert.equal(result.reviewedAt, "2026-09-08T02:00:00.000Z");
  assert.equal(result.reviewNote, "Divalidasi otomatis oleh sistem.");
  assert.equal(PICKET_AUTO_VALIDATED_SUCCESS_MESSAGE, "Piket berhasil diselesaikan dan divalidasi otomatis.");
  assert.equal(getPicketAssignmentStatus(mapPicketAssignment({
    schedule_id: "SCH-AUTO-1",
    status: result.assignmentStatus,
    submitted: true,
    submission_status: result.status,
  })), "Selesai");
});

test("historical submission statuses remain mapped", () => {
  for (const status of ["Terkirim", "Valid", "Bermasalah"]) {
    assert.equal(mapPicketSubmission({ id: `SUB-${status}`, status }).status, status);
  }
});

test("validatePicketPhoto rejects oversized images", () => {
  const file = { type: "image/png", size: 9 * 1024 * 1024 } as File;
  assert.match(validatePicketPhoto(file) || "", /maksimal 5 MB/);
});

test("validatePicketPhoto accepts extension fallback when mime type is empty", () => {
  const file = { name: "bukti-piket.JPG", type: "", size: 128 } as File;
  assert.equal(validatePicketPhoto(file), null);
});

test("validatePicketPhoto rejects unsupported image formats", () => {
  const file = { name: "bukti-piket.heic", type: "image/heic", size: 128 } as File;
  assert.match(validatePicketPhoto(file) || "", /JPG, PNG, atau WEBP/);
});

test("getPicketScheduleGeneratePayload delegates fixed-day selection to backend", () => {
  const payload = getPicketScheduleGeneratePayload("2026-06-08", {
    peoplePerDay: 2,
    randomizeEnabled: true,
    weeklySchedule: [{ dayOfWeek: 1, studentIds: ["S1", "S2"] }],
  });

  assert.deepEqual(payload, { date: "2026-06-08" });
});

test("getManualPicketSchedulePayloads creates one manual schedule payload per unique student", () => {
  const payloads = getManualPicketSchedulePayloads({
    scheduleDate: "2026-06-10",
    studentIds: ["S1", "S2", "S1", "", " S3 "],
    taskId: "T1",
    status: "Ditugaskan",
    notes: "  Piket pengganti  ",
  });

  assert.deepEqual(payloads, [
    { scheduleDate: "2026-06-10", studentId: "S1", taskId: "T1", status: "Ditugaskan", notes: "Piket pengganti" },
    { scheduleDate: "2026-06-10", studentId: "S2", taskId: "T1", status: "Ditugaskan", notes: "Piket pengganti" },
    { scheduleDate: "2026-06-10", studentId: "S3", taskId: "T1", status: "Ditugaskan", notes: "Piket pengganti" },
  ]);
});

test("getManualPicketSchedulePayloads defaults status and keeps notes nullable", () => {
  assert.deepEqual(getManualPicketSchedulePayloads({
    scheduleDate: "2026-06-10",
    studentIds: ["S1"],
    taskId: "T1",
  }), [
    { scheduleDate: "2026-06-10", studentId: "S1", taskId: "T1", status: "Ditugaskan", notes: null },
  ]);
});

test("getManualPicketTaskPayload trims manual task input", () => {
  assert.deepEqual(getManualPicketTaskPayload({
    name: "  Rapihkan barang ruang depan  ",
    description: "  Setelah jam piket selesai  ",
  }), {
    name: "Rapihkan barang ruang depan",
    description: "Setelah jam piket selesai",
    active: true,
  });
});

test("getPicketTaskConflict finds a task already assigned on the same date", () => {
  const assignments = [
    mapPicketAssignment({
      schedule_id: "SCH-1",
      schedule_date: "2026-06-10",
      student_id: "S1",
      student_name: "Ani",
      task_id: "T1",
      task_name: "Bersihkan meja lab",
    }),
  ];

  assert.equal(getPicketTaskConflict(assignments, {
    scheduleDate: "2026-06-10",
    taskId: "T1",
    taskName: "Bersihkan meja lab",
  })?.studentId, "S1");
  assert.equal(getPicketTaskConflict(assignments, {
    scheduleDate: "2026-06-11",
    taskId: "T1",
    taskName: "Bersihkan meja lab",
  }), null);
});

test("getPicketTaskConflict ignores the schedule being edited and normalizes task names", () => {
  const assignments = [
    mapPicketAssignment({
      schedule_id: "SCH-1",
      schedule_date: "2026-06-10",
      student_id: "S1",
      task_id: "T1",
      task_name: "Bersihkan   Meja Lab",
    }),
  ];

  assert.equal(getPicketTaskConflict(assignments, {
    scheduleDate: "2026-06-10",
    taskName: "  bersihkan meja lab ",
    excludeScheduleId: "SCH-1",
  }), null);
  assert.equal(getPicketTaskConflict(assignments, {
    scheduleDate: "2026-06-10",
    taskName: "  bersihkan meja lab ",
  })?.scheduleId, "SCH-1");
});

test("getDuplicatePicketTaskAssignments groups duplicate tasks per date", () => {
  const assignments = [
    mapPicketAssignment({ schedule_id: "SCH-1", schedule_date: "2026-06-10", student_id: "S1", task_id: "T1", task_name: "Sapu Lab" }),
    mapPicketAssignment({ schedule_id: "SCH-2", schedule_date: "2026-06-10", student_id: "S2", task_id: "T1", task_name: "Sapu Lab" }),
    mapPicketAssignment({ schedule_id: "SCH-3", schedule_date: "2026-06-11", student_id: "S3", task_id: "T1", task_name: "Sapu Lab" }),
  ];

  const groups = getDuplicatePicketTaskAssignments(assignments);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((item) => item.scheduleId), ["SCH-1", "SCH-2"]);
});

test("isAlumniStudent correctly detects alumni across casing, aliases, and boolean flags", () => {
  assert.equal(isAlumniStudent(null), false);
  assert.equal(isAlumniStudent(undefined), false);
  assert.equal(isAlumniStudent({ status: "Aktif" }), false);
  assert.equal(isAlumniStudent({ status: "Cuti" }), false);
  assert.equal(isAlumniStudent({ status: "Alumni" }), true);
  assert.equal(isAlumniStudent({ status: "alumni" }), true);
  assert.equal(isAlumniStudent({ status: "Lulus" }), true);
  assert.equal(isAlumniStudent({ student_status: "Alumni" }), true);
  assert.equal(isAlumniStudent({ studentStatus: "Alumni" }), true);
  assert.equal(isAlumniStudent({ user_status: "Alumni" }), true);
  assert.equal(isAlumniStudent({ is_alumni: true }), true);
  assert.equal(isAlumniStudent({ isAlumni: true }), true);
  assert.equal(isAlumniStudent({ is_alumni: false, status: "Aktif" }), false);
});

test("filterActivePicketStudents removes alumni students from active lists", () => {
  const students = [
    { id: "S1", name: "Budi", status: "Aktif" },
    { id: "S2", name: "Siti", status: "Alumni" },
    { id: "S3", name: "Agus", status: "Lulus" },
    { id: "S4", name: "Dewi", isAlumni: true },
    { id: "S5", name: "Rian", status: "Aktif" },
  ];

  const active = filterActivePicketStudents(students);
  assert.deepEqual(active.map((s) => s.id), ["S1", "S5"]);
});

test("mapPicketTodayAssignment marks isExempt true for alumni students", () => {
  const assignment = mapPicketTodayAssignment({
    assignment: {
      schedule_id: "SCH-99",
      task_name: "Lap Kaca",
      date: "2026-09-22",
      student_id: "S-ALUMNI",
      student_name: "Alumni Mahasiswa",
      status: "Alumni",
    },
  });

  assert.ok(assignment);
  assert.equal(assignment?.isExempt, true);
  assert.equal(shouldRequirePicketPhoto(assignment), false);
});

test("UI modules properly enforce alumni picket deactivation", () => {
  const piketOperatorSource = readFileSync(
    join(process.cwd(), "src/app/components/pages/operator/PiketOperator.tsx"),
    "utf8"
  );
  const piketMahasiswaSource = readFileSync(
    join(process.cwd(), "src/app/components/pages/mahasiswa/Piket.tsx"),
    "utf8"
  );
  const dashboardSource = readFileSync(
    join(process.cwd(), "src/app/components/pages/mahasiswa/Dashboard.tsx"),
    "utf8"
  );
  const attendanceSource = readFileSync(
    join(process.cwd(), "src/app/components/pages/mahasiswa/Attendance.tsx"),
    "utf8"
  );

  // PiketOperator: Uses activeStudents and prevents manual scheduling of alumni
  assert.match(piketOperatorSource, /filterActivePicketStudents\(students\)/);
  assert.match(piketOperatorSource, /activeStudents\.map/);
  assert.match(piketOperatorSource, /Mahasiswa berstatus Alumni tidak dapat dijadwalkan piket/);

  // Piket (Mahasiswa): Checks isAlumniStudent, displays alumni banner, and guards submissions
  assert.match(piketMahasiswaSource, /isAlumniStudent\(user\)/);
  assert.match(piketMahasiswaSource, /Status Anda: Alumni STAS-RG/);
  assert.match(piketMahasiswaSource, /Mahasiswa berstatus Alumni dibebaskan dari seluruh kewajiban piket/);

  // Dashboard: Picket card is hidden for alumni
  assert.match(dashboardSource, /!isAlumni && \(todayPicket \|\| todayPicketHoliday\)/);

  // Attendance: Alumni are exempted from requiring picket photos before checkout
  assert.match(attendanceSource, /if \(isAlumni\) return false;/);
  assert.match(attendanceSource, /!isAlumni && shouldRequirePicketPhoto/);

  // Layout: Alumni sidebar hides the Piket menu
  const layoutSource = readFileSync(
    join(process.cwd(), "src/app/components/templates/Layout.tsx"),
    "utf8"
  );
  assert.match(layoutSource, /\{ name: "Piket", path: "\/picket", icon: ClipboardCheck, alumniHidden: true \}/);
  assert.match(layoutSource, /isAlumniStudent\(user\)/);

  // PiketOperator: Alumni are excluded from missingAssignments and get Bebas Tugas status
  assert.match(piketOperatorSource, /alumniStudentIds\.has\(item\.studentId\)/);
  assert.match(piketOperatorSource, /Bebas Tugas \(Alumni\)/);
});

