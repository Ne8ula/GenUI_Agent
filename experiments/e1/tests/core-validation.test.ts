import { describe, expect, it } from "vitest";
import { E1Controller, type ModelProposal } from "../src/core";

interface MutableEntity {
  id: string;
  primitive: string;
  dataRefs: string[];
  unit: string;
  anchor: { targetId: string; x: number; y: number };
  count?: number;
  [key: string]: unknown;
}

interface MutableProposal {
  schemaVersion: string;
  responseId: string;
  baseRevision: number;
  evidenceRefs: string[];
  intent: string;
  entities: MutableEntity[];
  phaseRecipe: { id: string; durationMs: number; elementBudget: number };
  [key: string]: unknown;
}

function proposalFor(controller: E1Controller): MutableProposal {
  const proposal = controller.proposeScore();
  if (!proposal) throw new Error("Expected a ready authored proposal");
  return structuredClone(proposal) as unknown as MutableProposal;
}

function issueCodes(controller: E1Controller, candidate: unknown) {
  return controller.acceptScore(candidate).issues.map((issue) => issue.code);
}

function readyController(): E1Controller {
  const controller = new E1Controller();
  controller.request();
  return controller;
}

describe("closed Draft 2020-12 proposal validation", () => {
  it("accepts the positive deterministic authored proposal", () => {
    const controller = readyController();
    const proposal = controller.proposeScore();
    const before = controller.getSnapshot();

    const decision = controller.acceptScore(proposal);
    expect(decision).toEqual({
      accepted: true,
      revision: before.revision + 1,
      fallback: "none",
      issues: [],
    });
    expect(controller.getSnapshot().scoreStatus).toEqual({
      state: "active",
      origin: "accepted-proposal",
    });
  });

  it.each(["complete", "missing-cloud"] as const)("round-trips every authored state for %s", (variant) => {
    for (const recipe of ["part-and-relate", "withdraw-and-reanchor"] as const) {
      for (const reduced of [false, true]) {
        for (const plain of [false, true]) {
          const controller = new E1Controller();
          controller.request("NYC", variant);
          controller.select("15:00");
          controller.move("15:00", { x: 0.72, y: 0.5 });
          controller.pin("15:00", true);
          controller.compare();
          controller.setRecipe(recipe);
          controller.setReducedMotion(reduced);
          controller.setPlain(plain);
          const anchors = controller.getSnapshot().anchors;

          expect(controller.acceptScore(controller.proposeScore()).accepted).toBe(true);
          expect(controller.getSnapshot().anchors).toEqual(anchors);
          expect(controller.getSnapshot()).toMatchObject({ plain, reducedMotion: reduced, recipe });
        }
      }
    }
  });

  it.each([
    ["unknown field", (proposal: MutableProposal) => { proposal.unknown = true; }, "structure"],
    ["authority field", (proposal: MutableProposal) => { proposal.permission = "admin"; }, "prohibited-field"],
    ["trusted envelope", (proposal: MutableProposal) => { proposal.trustedEnvelope = {}; }, "prohibited-field"],
    ["raw shader", (proposal: MutableProposal) => { proposal.entities[0].shader = "void main(){}"; }, "prohibited-field"],
    ["raw code", (proposal: MutableProposal) => { proposal.entities[0].code = "eval(input)"; }, "prohibited-field"],
    ["raw HTML", (proposal: MutableProposal) => { proposal.entities[0].html = "<script/>"; }, "prohibited-field"],
  ])("rejects %s without replacing the authored fallback", (_label, mutate, expectedCode) => {
    const controller = readyController();
    const authored = controller.getSnapshot().activeScore;
    const proposal = proposalFor(controller);
    mutate(proposal);

    const decision = controller.acceptScore(proposal);
    expect(decision.accepted).toBe(false);
    expect(decision.fallback).toBe("retained-authored-score");
    expect(decision.issues.map((item) => item.code)).toContain(expectedCode);
    expect(controller.getSnapshot().activeScore).toBe(authored);
  });

  it("rejects foreign, unlisted, unused, and explicitly unavailable evidence", () => {
    const foreignController = readyController();
    const foreign = proposalFor(foreignController);
    foreign.evidenceRefs[0] = "W-BOS-01:r1:12:00:temperature";
    expect(issueCodes(foreignController, foreign)).toContain("structure");

    const unlistedController = readyController();
    const unlisted = proposalFor(unlistedController);
    const field = unlisted.entities.find((entity) => entity.primitive === "dither-field");
    if (!field) throw new Error("Expected dither field");
    field.dataRefs = ["W-NYC-01:r1:09:00:temperature"];
    field.anchor.targetId = "09:00";
    expect(issueCodes(unlistedController, unlisted)).toContain("unlisted-evidence");

    const unusedController = readyController();
    const unused = proposalFor(unusedController);
    unused.evidenceRefs.push("W-NYC-01:r1:09:00:wind");
    expect(issueCodes(unusedController, unused)).toContain("unused-evidence");

    const missingController = new E1Controller();
    missingController.request("NYC", "missing-cloud");
    const missing = proposalFor(missingController);
    missing.evidenceRefs.push("W-NYC-01:r1:12:00:cloudCover");
    missing.entities.push({
      id: "occlusion:primary",
      primitive: "occlusion-layer",
      dataRefs: ["W-NYC-01:r1:12:00:cloudCover"],
      unit: "%",
      anchor: { targetId: "12:00", x: 0.5, y: 0.4 },
      count: 160,
    });
    missing.phaseRecipe.elementBudget += 160;
    expect(issueCodes(missingController, missing)).toContain("unavailable-evidence");
  });

  it("rejects bad units, invalid anchors, and attempts to move host-controlled geometry", () => {
    const unitController = readyController();
    const wrongUnit = proposalFor(unitController);
    const field = wrongUnit.entities.find((entity) => entity.primitive === "dither-field");
    if (!field) throw new Error("Expected dither field");
    field.unit = "%";
    expect(issueCodes(unitController, wrongUnit)).toContain("unit-mismatch");

    const anchorController = readyController();
    const invalidAnchor = proposalFor(anchorController);
    invalidAnchor.entities[0].anchor.x = 1.1;
    expect(issueCodes(anchorController, invalidAnchor)).toContain("structure");

    const mismatchController = readyController();
    const mismatchedAnchor = proposalFor(mismatchController);
    mismatchedAnchor.entities[0].anchor.targetId = "09:00";
    expect(issueCodes(mismatchController, mismatchedAnchor)).toContain("anchor-mismatch");

    const pinnedController = readyController();
    pinnedController.move("12:00", { x: 0.7, y: 0.2 });
    pinnedController.pin("12:00", true);
    const pinnedConflict = proposalFor(pinnedController);
    for (const entity of pinnedConflict.entities) {
      if (entity.anchor.targetId === "12:00") entity.anchor.x = 0.71;
    }
    expect(issueCodes(pinnedController, pinnedConflict)).toContain("anchor-conflict");
    expect(pinnedController.getSnapshot().anchors["12:00"]).toMatchObject({
      x: 0.7,
      y: 0.2,
      pinned: true,
      userMoved: true,
    });
  });

  it("rejects element, recipe, duration, and count-budget incompatibilities", () => {
    const hostBudgetController = readyController();
    const hostBudget = proposalFor(hostBudgetController);
    const field = hostBudget.entities.find((entity) => entity.primitive === "dither-field");
    if (!field) throw new Error("Expected dither field");
    field.count = 2200;
    hostBudget.phaseRecipe.elementBudget = 2360;
    const hostCodes = issueCodes(hostBudgetController, hostBudget);
    expect(hostCodes).toContain("element-budget");
    expect(hostCodes).toContain("recipe-budget");

    const countController = readyController();
    const countMismatch = proposalFor(countController);
    countMismatch.phaseRecipe.elementBudget = 100;
    expect(issueCodes(countController, countMismatch)).toContain("element-budget");

    const durationController = readyController();
    const tooLong = proposalFor(durationController);
    tooLong.phaseRecipe.durationMs = 1500;
    expect(issueCodes(durationController, tooLong)).toContain("duration-budget");
  });

  it("rejects stale revisions, recipe conflicts, motion conflicts, and comparison incompatibility", () => {
    const staleController = readyController();
    const stale = proposalFor(staleController);
    stale.baseRevision -= 1;
    expect(issueCodes(staleController, stale)).toContain("stale-base");

    const recipeController = readyController();
    const wrongRecipe = proposalFor(recipeController);
    wrongRecipe.phaseRecipe.id = "withdraw-and-reanchor";
    expect(issueCodes(recipeController, wrongRecipe)).toContain("recipe-mismatch");

    const motionController = readyController();
    motionController.setReducedMotion(true);
    const moving = proposalFor(motionController);
    moving.phaseRecipe.durationMs = 200;
    expect(issueCodes(motionController, moving)).toContain("motion-mismatch");

    const comparisonController = readyController();
    const mismatched = proposalFor(comparisonController);
    mismatched.intent = "invite-comparison";
    expect(issueCodes(comparisonController, mismatched)).toContain("comparison-mismatch");
  });

  it("rejects non-JSON, cyclic, and fabricated delayed inputs without throwing", () => {
    const controller = readyController();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(issueCodes(controller, cyclic)).toContain("structure");
    expect(controller.acceptScore({ value: Number.NaN }).accepted).toBe(false);
    expect(controller.deliverDelayedPatch({ id: "delayed:1" }).accepted).toBe(false);
  });

  it("keeps authored proposals bounded and model-proposal shaped", () => {
    const controller = readyController();
    controller.select("15:00");
    controller.compare();
    const proposal = controller.proposeScore() as Readonly<ModelProposal>;
    const elementCount = proposal.entities.reduce((sum, entity) => sum + (entity.count ?? 0), 0);

    expect(proposal.schemaVersion).toBe("e1.response-score-proposal/1");
    expect(proposal.intent).toBe("invite-comparison");
    expect(proposal.entities).toHaveLength(4);
    expect(proposal.phaseRecipe.elementBudget).toBe(elementCount);
    expect(elementCount).toBeLessThanOrEqual(2000);
    expect(proposal.entities.filter((entity) => entity.count !== undefined)).toHaveLength(2);
  });
});
