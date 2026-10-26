import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProjectType } from "@albumflow/contracts";
import { shootTypeKey } from "./shoot-types";

describe("shootTypeKey", () => {
  it("names each type, and falls back to the type itself", () => {
    assert.equal(shootTypeKey("WEDDING"), "projects.new.type.wedding");
    assert.equal(shootTypeKey("EVENT"), "projects.new.type.event");
    assert.equal(shootTypeKey("PORTRAIT" as ProjectType), "PORTRAIT");
  });
});
