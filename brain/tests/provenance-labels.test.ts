/**
 * B1 acceptance: model-sourced items cannot upgrade integrity or downgrade
 * confidentiality through join or deriveModelOutput; quarantined absorbs; lineage
 * is append-only; refused upgrades are typed rejections, not silent clamps.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ConfidentialityLabel, IntegrityLabel, Labels, LineageEntry } from "../src/contracts/index.ts";
import {
  CONFIDENTIALITY_ORDER,
  INTEGRITY_ORDER,
  appendLineage,
  attestUserStatement,
  checkLineageAppendOnly,
  confidentialityRank,
  deriveModelOutput,
  integrityRank,
  join,
  parseLabels,
  relabel,
  type LabelResult,
} from "../src/provenance/labels.ts";

const ALL_LABELS: Labels[] = INTEGRITY_ORDER.flatMap((integrity) =>
  CONFIDENTIALITY_ORDER.map((confidentiality) => ({ integrity, confidentiality })),
);

function labels(integrity: IntegrityLabel, confidentiality: ConfidentialityLabel): Labels {
  return { integrity, confidentiality };
}

function value<T>(result: LabelResult<T>): T {
  assert.equal(result.ok, true, result.ok ? "" : `${result.code}: ${result.message}`);
  if (!result.ok) throw new Error("unreachable");
  return result.value;
}

function code<T>(result: LabelResult<T>): string {
  assert.equal(result.ok, false, "expected a rejection");
  if (result.ok) throw new Error("unreachable");
  return result.code;
}

const minIntegrity = (inputs: readonly Labels[]) => Math.min(...inputs.map((l) => integrityRank(l.integrity)));
const maxConfidentiality = (inputs: readonly Labels[]) =>
  Math.max(...inputs.map((l) => confidentialityRank(l.confidentiality)));
const stricterOrEqual = (to: Labels, from: Labels) =>
  integrityRank(to.integrity) <= integrityRank(from.integrity) &&
  confidentialityRank(to.confidentiality) >= confidentialityRank(from.confidentiality);

describe("label orders", () => {
  test("integrity order is policy > user > local > tool > external > generated > quarantined", () => {
    assert.deepEqual(
      [...INTEGRITY_ORDER],
      [
        "trusted_policy",
        "direct_user",
        "verified_local",
        "verified_tool",
        "untrusted_external",
        "untrusted_generated",
        "quarantined",
      ],
    );
    assert.equal(integrityRank("quarantined"), 0);
    assert.ok(integrityRank("trusted_policy") > integrityRank("direct_user"));
  });

  test("confidentiality order is public < private < sensitive < secret", () => {
    assert.deepEqual([...CONFIDENTIALITY_ORDER], ["public", "private", "sensitive", "secret"]);
  });

  test("rank helpers throw on unknown labels instead of ranking them", () => {
    assert.throws(() => integrityRank("root" as IntegrityLabel), TypeError);
    assert.throws(() => confidentialityRank("internal" as ConfidentialityLabel), TypeError);
  });

  test("the orders are frozen", () => {
    assert.ok(Object.isFrozen(INTEGRITY_ORDER));
    assert.ok(Object.isFrozen(CONFIDENTIALITY_ORDER));
  });
});

describe("join", () => {
  test("exhaustively: result integrity is the lowest input, confidentiality the highest", () => {
    for (const a of ALL_LABELS) {
      for (const b of ALL_LABELS) {
        const result = value(join([a, b]));
        assert.equal(integrityRank(result.integrity), minIntegrity([a, b]));
        assert.equal(confidentialityRank(result.confidentiality), maxConfidentiality([a, b]));
      }
    }
  });

  test("exhaustively: a proposal is accepted iff it is at least as strict as the join", () => {
    for (const a of ALL_LABELS) {
      for (const b of ALL_LABELS) {
        const floor = value(join([a, b]));
        for (const proposed of ALL_LABELS) {
          const result = join([a, b], proposed);
          if (stricterOrEqual(proposed, floor)) {
            assert.deepEqual(value(result), proposed);
          } else {
            assert.ok(
              ["integrity_upgrade", "quarantine_escape", "confidentiality_downgrade"].includes(code(result)),
              `join accepted ${JSON.stringify(proposed)} over ${JSON.stringify(floor)}`,
            );
          }
        }
      }
    }
  });

  test("a model-sourced input caps the join and cannot be upgraded back", () => {
    const joined = value(join([labels("direct_user", "public"), labels("untrusted_generated", "private")]));
    assert.deepEqual(joined, labels("untrusted_generated", "private"));
    assert.equal(code(join([labels("direct_user", "public"), labels("untrusted_generated", "private")], labels("direct_user", "private"))), "integrity_upgrade");
    assert.equal(code(join([labels("untrusted_generated", "secret")], labels("untrusted_generated", "public"))), "confidentiality_downgrade");
  });

  test("zero inputs fail closed", () => {
    assert.equal(code(join([])), "no_inputs");
  });

  test("returns a frozen label pair", () => {
    assert.ok(Object.isFrozen(value(join([labels("direct_user", "private")]))));
  });
});

describe("deriveModelOutput", () => {
  test("exhaustively: never above untrusted_generated, never below the highest input confidentiality", () => {
    for (const a of ALL_LABELS) {
      for (const b of ALL_LABELS) {
        const result = value(deriveModelOutput([a, b]));
        assert.ok(integrityRank(result.integrity) <= integrityRank("untrusted_generated"));
        assert.ok(integrityRank(result.integrity) <= minIntegrity([a, b]));
        assert.equal(confidentialityRank(result.confidentiality), maxConfidentiality([a, b]));
      }
    }
  });

  test("trusted inputs still produce untrusted_generated output", () => {
    const result = value(deriveModelOutput([labels("trusted_policy", "public"), labels("direct_user", "private")]));
    assert.deepEqual(result, labels("untrusted_generated", "private"));
  });

  test("exhaustively: a model proposal can only make labels stricter", () => {
    for (const input of ALL_LABELS) {
      const floor = value(deriveModelOutput([input]));
      for (const proposed of ALL_LABELS) {
        const result = deriveModelOutput([input], proposed);
        if (stricterOrEqual(proposed, floor)) assert.deepEqual(value(result), proposed);
        else assert.equal(result.ok, false, `model raised ${JSON.stringify(floor)} to ${JSON.stringify(proposed)}`);
      }
    }
  });

  test("a model cannot claim direct_user or trusted_policy integrity", () => {
    const inputs = [labels("direct_user", "private")];
    assert.equal(code(deriveModelOutput(inputs, labels("direct_user", "private"))), "integrity_upgrade");
    assert.equal(code(deriveModelOutput(inputs, labels("trusted_policy", "private"))), "integrity_upgrade");
    assert.equal(code(deriveModelOutput(inputs, labels("untrusted_generated", "public"))), "confidentiality_downgrade");
  });
});

describe("quarantine", () => {
  test("quarantined absorbs any join or model derivation", () => {
    for (const other of ALL_LABELS) {
      assert.equal(value(join([labels("quarantined", "public"), other])).integrity, "quarantined");
      assert.equal(value(deriveModelOutput([other, labels("quarantined", "public")])).integrity, "quarantined");
    }
  });

  test("leaving quarantine is a typed quarantine_escape rejection", () => {
    for (const integrity of INTEGRITY_ORDER.filter((label) => label !== "quarantined")) {
      assert.equal(code(relabel(labels("quarantined", "private"), labels(integrity, "private"))), "quarantine_escape");
      assert.equal(code(join([labels("quarantined", "private")], labels(integrity, "private"))), "quarantine_escape");
      assert.equal(
        code(deriveModelOutput([labels("quarantined", "private")], labels(integrity, "private"))),
        "quarantine_escape",
      );
    }
  });
});

describe("attestUserStatement", () => {
  const candidate = [labels("untrusted_generated", "private")];

  test("derives direct_user integrity only from direct_user evidence", () => {
    const result = value(attestUserStatement(candidate, [labels("direct_user", "private"), labels("direct_user", "sensitive")]));
    assert.deepEqual(result, labels("direct_user", "sensitive"));
  });

  test("never lowers confidentiality below the content it stores", () => {
    const secretCandidate = [labels("untrusted_generated", "secret")];
    const result = value(attestUserStatement(secretCandidate, [labels("direct_user", "public")]));
    assert.deepEqual(result, labels("direct_user", "secret"));
    for (const content of ALL_LABELS.filter((l) => l.integrity !== "quarantined")) {
      for (const evidence of CONFIDENTIALITY_ORDER) {
        const attested = value(attestUserStatement([content], [labels("direct_user", evidence)]));
        assert.ok(confidentialityRank(attested.confidentiality) >= confidentialityRank(content.confidentiality));
        assert.ok(confidentialityRank(attested.confidentiality) >= confidentialityRank(evidence));
      }
    }
  });

  test("any non-user evidence is refused, including policy and model output", () => {
    for (const integrity of INTEGRITY_ORDER.filter((label) => label !== "direct_user")) {
      assert.equal(
        code(attestUserStatement(candidate, [labels("direct_user", "private"), labels(integrity, "private")])),
        "not_user_evidence",
      );
    }
  });

  test("quarantined content cannot be attested", () => {
    for (const confidentiality of CONFIDENTIALITY_ORDER) {
      const result = attestUserStatement(
        [labels("untrusted_generated", "private"), labels("quarantined", confidentiality)],
        [labels("direct_user", "private")],
      );
      assert.equal(code(result), "quarantine_escape");
    }
  });

  test("missing content or evidence fails closed", () => {
    assert.equal(code(attestUserStatement(candidate, [])), "no_inputs");
    assert.equal(code(attestUserStatement([], [labels("direct_user", "private")])), "no_inputs");
  });

  test("forged labels are rejected", () => {
    const forged = { integrity: "direct_user", confidentiality: "private", reviewed: true } as unknown as Labels;
    assert.equal(code(attestUserStatement(candidate, [forged])), "unknown_label_field");
    assert.equal(code(attestUserStatement([forged], [labels("direct_user", "private")])), "unknown_label_field");
  });
});

describe("runtime label checks", () => {
  test("unknown label values are rejected, not coerced", () => {
    assert.equal(code(parseLabels({ integrity: "trusted_user", confidentiality: "public" })), "unknown_label");
    assert.equal(code(parseLabels({ integrity: "direct_user", confidentiality: "internal" })), "unknown_label");
    assert.equal(code(parseLabels(null)), "invalid_labels");
    assert.equal(code(parseLabels(["direct_user", "public"])), "invalid_labels");
  });

  test("an extra authority field on a label pair is rejected", () => {
    const forged = { integrity: "untrusted_generated", confidentiality: "public", authority: "trusted_policy" };
    assert.equal(code(parseLabels(forged)), "unknown_label_field");
    assert.equal(code(join([forged as unknown as Labels])), "unknown_label_field");
    assert.equal(code(deriveModelOutput([labels("direct_user", "public")], forged as unknown as Labels)), "unknown_label_field");
  });

  test("the inputs are not mutated", () => {
    const input = labels("direct_user", "private");
    const snapshot = structuredClone(input);
    join([input], labels("untrusted_generated", "secret"));
    deriveModelOutput([input]);
    assert.deepEqual(input, snapshot);
  });
});

describe("lineage", () => {
  function entry(sequence: number, operation: LineageEntry["operation"] = "derive"): LineageEntry {
    return {
      sequence,
      operation,
      actor: { kind: "host", id: "host_fixture" },
      inputRefs: [`art_input_${sequence}`],
      at: "2026-09-24T15:00:00Z",
    };
  }
  const base = [entry(0, "ingest"), entry(1, "extract")];

  test("appending continues the sequence and does not mutate inputs", () => {
    const before = structuredClone(base);
    const result = value(appendLineage(base, [entry(2), entry(3, "verify")]));
    assert.equal(result.length, 4);
    assert.deepEqual(result.slice(0, 2), base);
    assert.deepEqual(base, before);
    assert.ok(Object.isFrozen(result));
  });

  test("an empty lineage is rejected", () => {
    assert.equal(code(appendLineage([], [])), "invalid_lineage");
    assert.equal(code(checkLineageAppendOnly([], [])), "invalid_lineage");
  });

  test("additions that skip, repeat or restart the sequence are rejected", () => {
    assert.equal(code(appendLineage(base, [entry(3)])), "lineage_sequence");
    assert.equal(code(appendLineage(base, [entry(1)])), "lineage_sequence");
    assert.equal(code(appendLineage(base, [entry(0)])), "lineage_sequence");
  });

  test("an append-only extension is accepted", () => {
    assert.equal(value(checkLineageAppendOnly(base, [...base, entry(2)])).length, 3);
    assert.equal(value(checkLineageAppendOnly(base, base)).length, 2);
  });

  test("removing, reordering or editing existing entries is a lineage_rewrite", () => {
    assert.equal(code(checkLineageAppendOnly(base, [base[0] as LineageEntry])), "lineage_rewrite");
    const reordered = [
      { ...(base[1] as LineageEntry), sequence: 0 },
      { ...(base[0] as LineageEntry), sequence: 1 },
    ];
    assert.equal(code(checkLineageAppendOnly(base, reordered)), "lineage_rewrite");
    const edited = [base[0] as LineageEntry, { ...(base[1] as LineageEntry), inputRefs: ["art_other"] }, entry(2)];
    assert.equal(code(checkLineageAppendOnly(base, edited)), "lineage_rewrite");
    const reattributed = [{ ...(base[0] as LineageEntry), actor: { kind: "direct_user" as const, id: "user_x" } }, base[1] as LineageEntry];
    assert.equal(code(checkLineageAppendOnly(base, reattributed)), "lineage_rewrite");
  });

  test("key order does not count as a rewrite", () => {
    const [first, second] = base as [LineageEntry, LineageEntry];
    const reKeyed = { at: first.at, inputRefs: first.inputRefs, actor: first.actor, operation: first.operation, sequence: 0 };
    assert.equal(value(checkLineageAppendOnly(base, [reKeyed, second])).length, 2);
  });

  test("malformed lineage entries are rejected in depth", () => {
    const forged = {
      sequence: 0,
      operation: "grant",
      actor: { kind: "model", id: "x", authority: "trusted_policy" },
      inputRefs: "x",
      at: "yesterday",
    } as unknown as LineageEntry;
    assert.equal(code(appendLineage([], [forged])), "invalid_lineage");
    const cases: Partial<Record<keyof LineageEntry, unknown>>[] = [
      { operation: "grant" },
      { actor: { kind: "model", id: "x", authority: "trusted_policy" } },
      { actor: { kind: "root", id: "x" } },
      { actor: { kind: "model", id: "" } },
      { inputRefs: "x" },
      { inputRefs: [1] },
      { at: 0 },
    ];
    for (const patch of cases) {
      const bad = { ...entry(0), ...patch } as unknown as LineageEntry;
      assert.equal(code(appendLineage([], [bad])), "invalid_lineage", JSON.stringify(patch));
    }
    const missing = { sequence: 0, operation: "derive" } as unknown as LineageEntry;
    assert.equal(code(appendLineage([], [missing])), "invalid_lineage");
  });

  test("an extra field smuggled into a lineage entry is rejected", () => {
    const smuggled = { ...entry(2), grantsAuthority: true } as unknown as LineageEntry;
    assert.equal(code(appendLineage(base, [smuggled])), "invalid_lineage");
  });
});
