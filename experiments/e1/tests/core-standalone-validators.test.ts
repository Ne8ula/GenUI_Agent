import { describe, expect, it } from "vitest";
import completeFixture from "../fixtures/w-nyc-01.json";
import { E1Controller } from "../src/core";
import {
  validateModelProposal,
  validateWeatherFixture,
} from "../src/core/generated/validators.js";

describe("generated standalone validators", () => {
  it("loads the bundled fixture without an Ajv compiler at runtime", () => {
    expect(validateWeatherFixture(completeFixture)).toBe(true);
    expect(validateWeatherFixture.errors).toBeNull();

    const withUnknownField = structuredClone(completeFixture) as typeof completeFixture & {
      unexpected?: string;
    };
    withUnknownField.unexpected = "closed schema";

    expect(validateWeatherFixture(withUnknownField)).toBe(false);
    expect(validateWeatherFixture.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ keyword: "additionalProperties" })]),
    );
  });

  it("preserves all-errors validation for generated model proposals", () => {
    const controller = new E1Controller();
    controller.request();
    const proposal = controller.proposeScore();
    if (!proposal) throw new Error("Expected a ready authored proposal");

    expect(validateModelProposal(proposal)).toBe(true);
    expect(validateModelProposal.errors).toBeNull();

    const invalid = structuredClone(proposal) as unknown as {
      unexpected?: boolean;
      entities: Array<{ anchor: { x: number } }>;
    };
    invalid.unexpected = true;
    invalid.entities[0].anchor.x = 2;

    expect(validateModelProposal(invalid)).toBe(false);
    expect(validateModelProposal.errors?.map((error) => error.keyword)).toEqual(
      expect.arrayContaining(["additionalProperties", "maximum"]),
    );
  });
});
