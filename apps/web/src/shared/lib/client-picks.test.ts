import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_CLIENTS, picksOf, submittedSelections } from "./client-picks";

const session = (
  id: string,
  clientName: string,
  picked: string[],
  status = "SUBMITTED",
  submittedAt: string | null = "2026-11-20T10:00:00Z",
) => ({
  id,
  clientName,
  status,
  submittedAt,
  pickedPhotoIds: picked,
});

describe("client picks, kept per client", () => {
  const sessions = [
    session("maria", "Maria (mama)", ["c", "d"], "SUBMITTED", "2026-11-21T10:00:00Z"),
    session("ana", " Ana & Mihai ", ["a", "b", "c"], "SUBMITTED", "2026-11-20T10:00:00Z"),
    session("open", "Still choosing", ["x"], "OPEN", null),
  ];

  it("lists only sent selections, in the order they arrived, with tidy names", () => {
    const selections = submittedSelections(sessions);
    assert.deepEqual(
      selections.map((selection) => [selection.sessionId, selection.clientName]),
      [
        ["ana", "Ana & Mihai"],
        ["maria", "Maria (mama)"],
      ],
    );
  });

  it("marks one client's picks only, when one is chosen", () => {
    const selections = submittedSelections(sessions);
    assert.deepEqual([...picksOf(selections, "maria")].sort(), ["c", "d"]);
    assert.deepEqual([...picksOf(selections, "ana")].sort(), ["a", "b", "c"]);
  });

  it("marks everyone's together for all clients, or when the chosen link is gone", () => {
    const selections = submittedSelections(sessions);
    assert.deepEqual([...picksOf(selections, ALL_CLIENTS)].sort(), ["a", "b", "c", "d"]);
    assert.deepEqual([...picksOf(selections, "revoked-link")].sort(), ["a", "b", "c", "d"]);
  });
});
