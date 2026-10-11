import { describe, it, expect } from "vitest";
import { decideAttemptKind } from "./attemptKind";

describe("decideAttemptKind", () => {
  it("personalized tests are always practice, regardless of assignment state", () => {
    expect(
      decideAttemptKind({
        testType: "personalized",
        assignmentLoaded: false,
        assignmentFailed: false,
      })
    ).toBe("practice");
  });

  it("from_dpp/dpp with a loaded web assignment and no proctoring is practice", () => {
    expect(
      decideAttemptKind({
        testType: "from_dpp",
        assignmentLoaded: true,
        assignmentFailed: false,
        examMode: "web",
      })
    ).toBe("practice");

    expect(
      decideAttemptKind({
        testType: "dpp",
        assignmentLoaded: true,
        assignmentFailed: false,
        examMode: undefined,
        proctoringConfig: null,
      })
    ).toBe("practice");
  });

  it("from_dpp/dpp with examMode desktop or both is live", () => {
    expect(
      decideAttemptKind({
        testType: "from_dpp",
        assignmentLoaded: true,
        assignmentFailed: false,
        examMode: "desktop",
      })
    ).toBe("live");

    expect(
      decideAttemptKind({
        testType: "dpp",
        assignmentLoaded: true,
        assignmentFailed: false,
        examMode: "both",
      })
    ).toBe("live");
  });

  it("from_dpp/dpp with any proctoring detection enabled is live", () => {
    expect(
      decideAttemptKind({
        testType: "from_dpp",
        assignmentLoaded: true,
        assignmentFailed: false,
        examMode: "web",
        proctoringConfig: { faceDetection: true },
      })
    ).toBe("live");

    expect(
      decideAttemptKind({
        testType: "from_dpp",
        assignmentLoaded: true,
        assignmentFailed: false,
        examMode: "web",
        proctoringConfig: { phoneDetection: true },
      })
    ).toBe("live");

    expect(
      decideAttemptKind({
        testType: "from_dpp",
        assignmentLoaded: true,
        assignmentFailed: false,
        examMode: "web",
        proctoringConfig: { eyeGaze: true },
      })
    ).toBe("live");

    expect(
      decideAttemptKind({
        testType: "from_dpp",
        assignmentLoaded: true,
        assignmentFailed: false,
        examMode: "web",
        proctoringConfig: { photoCapture: true },
      })
    ).toBe("live");
  });

  it("from_dpp/dpp with every detection explicitly disabled is practice", () => {
    expect(
      decideAttemptKind({
        testType: "from_dpp",
        assignmentLoaded: true,
        assignmentFailed: false,
        examMode: "web",
        proctoringConfig: {
          faceDetection: false,
          phoneDetection: false,
          eyeGaze: false,
          photoCapture: false,
        },
      })
    ).toBe("practice");
  });

  it("a missing or failed assignment fetch for a dpp-type test is live, fail-safe", () => {
    expect(
      decideAttemptKind({
        testType: "from_dpp",
        assignmentLoaded: false,
        assignmentFailed: false,
      })
    ).toBe("live");

    expect(
      decideAttemptKind({
        testType: "dpp",
        assignmentLoaded: false,
        assignmentFailed: true,
      })
    ).toBe("live");

    expect(
      decideAttemptKind({
        testType: "from_dpp",
        assignmentLoaded: true,
        assignmentFailed: true,
        examMode: "web",
      })
    ).toBe("live");
  });

  it("an unknown or missing test type is live", () => {
    expect(
      decideAttemptKind({
        testType: undefined,
        assignmentLoaded: false,
        assignmentFailed: false,
      })
    ).toBe("live");

    expect(
      decideAttemptKind({
        testType: "weekly_test",
        assignmentLoaded: true,
        assignmentFailed: false,
        examMode: "web",
      })
    ).toBe("live");
  });
});
