import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { isClosedConnectionWrite } from "../src/infrastructure/monitoring/process-guards";
import { isDroppedConnection } from "../src/infrastructure/storage/digistorage-storage-provider";

const errno = (code: string, syscall: string) => Object.assign(new Error(`${syscall} ${code}`), { code, syscall });

describe("a connection the other side closed", () => {
  it("is told apart from every other uncaught exception", () => {
    assert.ok(isClosedConnectionWrite(errno("EPIPE", "write")));
    assert.ok(isClosedConnectionWrite(errno("ECONNRESET", "write")));
    assert.ok(!isClosedConnectionWrite(errno("ECONNRESET", "read")));
    assert.ok(!isClosedConnectionWrite(errno("ENOENT", "open")));
    assert.ok(!isClosedConnectionWrite(new TypeError("cannot read properties of undefined")));
    assert.ok(!isClosedConnectionWrite(undefined));
  });

  it("keeps the process running, logged, while any other uncaught exception still ends it", () => {
    const guarded = (thrown: string) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
          const { installProcessGuards } = await import("./src/infrastructure/monitoring/process-guards.ts");
          const logged = [];
          installProcessGuards({ error: (message) => logged.push(message), warn() {}, info() {}, debug() {}, child() { return this; } });
          setTimeout(() => { throw ${thrown}; }, 0);
          setTimeout(() => { console.log("still running: " + logged.join(" | ")); process.exit(0); }, 100);
          `,
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );
    const closed = guarded(`Object.assign(new Error("write EPIPE"), { code: "EPIPE", syscall: "write" })`);
    assert.equal(closed.status, 0);
    assert.match(closed.stdout, /still running: write to a connection the other side had closed/);

    const real = guarded(`new TypeError("a real bug")`);
    assert.equal(real.status, 1);
    assert.doesNotMatch(real.stdout, /still running/);
  });
});

describe("DigiStorage dropping a request", () => {
  it("counts as worth retrying, like a 503", () => {
    assert.ok(
      isDroppedConnection(
        Object.assign(new Error("request to https://x failed, reason: socket hang up"), { code: "ECONNRESET" }),
      ),
    );
    assert.ok(isDroppedConnection(new Error("socket hang up")));
    assert.ok(isDroppedConnection(Object.assign(new Error("fetch failed"), { cause: errno("EPIPE", "write") })));
    assert.ok(!isDroppedConnection(Object.assign(new Error("Invalid response: 401 Unauthorized"), { status: 401 })));
    assert.ok(!isDroppedConnection(undefined));
  });
});
