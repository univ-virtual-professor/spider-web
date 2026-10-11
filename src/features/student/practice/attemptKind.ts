// Decides whether an attempt gets the unproctored practice chrome or the proctored live-test
// chrome. Pulled out as a small pure function so the decision — and its fail-safe default — is
// testable on its own, separate from StudentCBTAttempt.tsx's Firestore-fetching code.
//
// Security note: `from_dpp`/`dpp` tests are batch-targeted and an educator can set an `examMode`
// of "desktop"/"both" and a `proctoringConfig` on the batch assignment (AssignAndScheduleDialog).
// A dpp-type test with such an assignment must still get the proctored live chrome — only a
// personalized test (private, never batch-assigned) or a dpp-type test with a plain, unproctored
// web assignment is actually unproctored practice. Any case this function can't positively
// confirm as practice must resolve to "live" — including a missing/failed assignment fetch,
// which is why the caller should keep "live" as its default kind until this has been called with
// real assignment data.

export type ExamMode = "web" | "desktop" | "both" | null | undefined;

export type ProctoringConfigInput =
  | {
      faceDetection?: boolean | null;
      phoneDetection?: boolean | null;
      eyeGaze?: boolean | null;
      photoCapture?: boolean | null;
    }
  | null
  | undefined;

export type AttemptKindInput = {
  /** The test doc's raw `type` field. */
  testType: string | null | undefined;
  /** Whether a matching batchAssignment doc was found and successfully read. */
  assignmentLoaded: boolean;
  /** Whether the batchAssignment fetch itself failed (network/permission error, etc). */
  assignmentFailed: boolean;
  /** examMode from the matching batchAssignment, if one was loaded. */
  examMode?: ExamMode;
  /** proctoringConfig from the matching batchAssignment, if one was loaded. */
  proctoringConfig?: ProctoringConfigInput;
};

export type AttemptKind = "live" | "practice";

const BATCH_TARGETED_PRACTICE_TYPES = new Set(["from_dpp", "dpp"]);

function hasAnyDetectionEnabled(config: ProctoringConfigInput): boolean {
  if (!config) return false;
  return Boolean(
    config.faceDetection || config.phoneDetection || config.eyeGaze || config.photoCapture
  );
}

export function decideAttemptKind(input: AttemptKindInput): AttemptKind {
  const type = String(input.testType || "");

  // Personalized ("Practice for Me") tests are private to the generating student and are never
  // batch-assigned, so there is no assignment/proctoring overlay to check.
  if (type === "personalized") return "practice";

  if (!BATCH_TARGETED_PRACTICE_TYPES.has(type)) return "live";

  // From here on, type is from_dpp/dpp — batch-targeted, so the assignment overlay governs it.
  if (input.assignmentFailed || !input.assignmentLoaded) return "live";

  if (input.examMode && input.examMode !== "web") return "live";

  if (hasAnyDetectionEnabled(input.proctoringConfig)) return "live";

  return "practice";
}
