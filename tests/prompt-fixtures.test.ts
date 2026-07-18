import { describe, expect, it } from "vitest";
import {
  dailyReadingModelOutputSchema,
  dailyReadingRequestV4Schema,
  validateModelOutput,
} from "@/lib/schemas";
import type { DailyReadingRequestV4 } from "@/lib/types";
import { PROMPT_FIXTURES } from "./fixtures/prompt-cases";
import { makeModelOutput } from "./fixtures/factories";

describe("20-case synthetic prompt evaluation fixture", () => {
  it("contains exactly 20 uniquely named, synthetic cases", () => {
    expect(PROMPT_FIXTURES).toHaveLength(20);
    expect(new Set(PROMPT_FIXTURES.map((fixture) => fixture.id)).size).toBe(20);
    expect(JSON.stringify(PROMPT_FIXTURES)).not.toContain("真实姓名");
  });

  it.each(PROMPT_FIXTURES)("$id request validity matches its declared boundary", (fixture) => {
    expect(dailyReadingRequestV4Schema.safeParse(fixture.request).success).toBe(fixture.requestValid);
  });

  it.each(PROMPT_FIXTURES.filter((fixture) => fixture.requestValid))(
    "$id has a first-pass-valid strict output without invented wardrobe IDs",
    (fixture) => {
      const parsedRequest = dailyReadingRequestV4Schema.parse(fixture.request) as DailyReadingRequestV4;
      const output = makeModelOutput(parsedRequest.profile.scenes);
      output.dailyStyle.outfits.forEach((outfit) => {
        const match = parsedRequest.wardrobe.find((candidate) => candidate.enabled && candidate.scenes.includes(outfit.scene));
        outfit.wardrobeItemIds = match ? [match.id] : [];
        outfit.missingPieces = match
          ? ["一件与上装配套的合成下装"]
          : [`一件适合${outfit.scene}的合成基础单品`];
      });
      expect(dailyReadingModelOutputSchema.safeParse(output).success).toBe(true);
      expect(validateModelOutput(output, parsedRequest.profile, parsedRequest.wardrobe)).toMatchObject({ success: true });
      const outputText = JSON.stringify(output);
      for (const ungroundedDetail of ["Nike", "Gucci", "羊毛", "丝绸", "真皮", "棉质"]) {
        if (!JSON.stringify(parsedRequest.wardrobe).includes(ungroundedDetail)) {
          expect(outputText).not.toContain(ungroundedDetail);
        }
      }
    },
  );
});
