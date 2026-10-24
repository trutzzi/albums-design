import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const COMPOSE_FILES = ["docker-compose.yml", "docker-compose.prod.yml"];

function compose(file: string): string {
  return readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
}

describe("photo bucket exposure", () => {
  // A public bucket makes every presigned URL permanent: drop the signature and the
  // original is readable forever, whatever the link's expiry or revocation says.
  for (const file of COMPOSE_FILES) {
    it(`${file} never grants anonymous access to the bucket`, () => {
      assert.doesNotMatch(compose(file), /mc anonymous set (download|upload|public)\b/);
    });

    it(`${file} closes the bucket explicitly, so a deploy also fixes one left public`, () => {
      assert.match(compose(file), /mc anonymous set none local\/albumflow-photos/);
    });
  }
});
