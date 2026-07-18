import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createDailyReadingWithDiagnostics,
  PROMPT_VERSION,
} from "@/lib/daily-reading";
import type { ModelValidationIssueKind, ReadingAttemptDiagnostic } from "@/lib/daily-reading";
import { LIVE_PROMPT_CASES } from "./fixtures/live-cases";

const runLive = process.env.RUN_PROMPT_LIVE === "1";

it.skipIf(!runLive)("evaluates five explicit ECNU cases and records diagnostics only", async () => {
  const metrics: Array<{
    caseId: string;
    errorCode: string;
    issueKinds: ModelValidationIssueKind[];
    calls: number;
    durationMs: number;
  }> = [];

  for (const fixture of LIVE_PROMPT_CASES) {
    const attempts: ReadingAttemptDiagnostic[] = [];
    const startedAt = Date.now();
    try {
      const { reading, diagnostics } = await createDailyReadingWithDiagnostics(fixture.request, {
        onAttempt: (attempt) => attempts.push(attempt),
      });

      // A demo result means no ECNU provider was exercised, so it fails a live run.
      expect(reading.source, fixture.id).toBe("model");
      expect(reading.provider, fixture.id).toBe("ECNU");
      expect(reading.model, fixture.id).toBe("ecnu-max");
      expect(reading.promptVersion, fixture.id).toBe(PROMPT_VERSION);
      expect(reading.dailyStyle.outfits.map((outfit) => outfit.scene), fixture.id)
        .toEqual(fixture.request.profile.scenes);

      const allowedIds = new Set(fixture.request.wardrobe.filter((item) => item.enabled).map((item) => item.id));
      for (const outfit of reading.dailyStyle.outfits) {
        expect(outfit.wardrobeItemIds.every((id) => allowedIds.has(id)), fixture.id).toBe(true);
        if (allowedIds.size === 0 || fixture.expectedMissingScenes?.includes(outfit.scene)) {
          expect(outfit.missingPieces.length, fixture.id).toBeGreaterThan(0);
        }
      }

      if (fixture.forbiddenColorAliases) {
        const paletteNames = [
          ...reading.dailyStyle.primaryColors,
          ...reading.dailyStyle.supportingColors,
          ...reading.dailyStyle.useSparinglyColors,
        ].map((color) => color.name).join("|");
        expect(paletteNames, fixture.id).not.toMatch(fixture.forbiddenColorAliases);
      }

      if (fixture.forbiddenProseAliases) {
        const generatedProse = JSON.stringify({
          profileNarrative: reading.profileNarrative,
          dailyStyle: reading.dailyStyle,
        });
        expect(generatedProse, fixture.id).not.toMatch(fixture.forbiddenProseAliases);
      }

      expect(diagnostics.upstreamCalls, fixture.id).toBeGreaterThanOrEqual(1);
      expect(diagnostics.upstreamCalls, fixture.id).toBeLessThanOrEqual(3);
      metrics.push({
        caseId: fixture.id,
        errorCode: "NONE",
        issueKinds: [...new Set(attempts.flatMap((attempt) => attempt.issueKinds))],
        calls: diagnostics.upstreamCalls,
        durationMs: diagnostics.durationMs,
      });
    } catch (error) {
      const candidateCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      const errorCode = /^[A-Z][A-Z0-9_]{1,63}$/.test(candidateCode) ? candidateCode : "LIVE_ASSERTION_FAILED";
      metrics.push({
        caseId: fixture.id,
        errorCode,
        issueKinds: [...new Set(attempts.flatMap((attempt) => attempt.issueKinds))],
        calls: attempts.at(-1)?.upstreamCalls ?? 0,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
    }
  }

  expect(metrics).toHaveLength(5);
  // Deliberately record only bounded diagnostics: never raw issues, prompts, or outputs.
  console.info("PROMPT_LIVE_METRICS", JSON.stringify(metrics));
  expect(metrics.filter((item) => item.errorCode === "NONE")).toHaveLength(5);
}, 130_000);
