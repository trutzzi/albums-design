import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addressKey } from "../src/shared-kernel/address-key";

describe("addressKey", () => {
  it("keeps an IPv4 address as it is, also when written as IPv6", () => {
    assert.equal(addressKey("203.0.113.7"), "203.0.113.7");
    assert.equal(addressKey("::ffff:203.0.113.7"), "203.0.113.7");
  });

  it("counts IPv6 by its /64, however the address is written", () => {
    const key = "2001:db8:1:2::/64";
    assert.equal(addressKey("2001:db8:1:2::1"), key);
    assert.equal(addressKey("2001:0DB8:0001:0002:aaaa:bbbb:cccc:dddd"), key);
    assert.equal(addressKey("2001:db8:1:2:ffff::"), key);
    assert.notEqual(addressKey("2001:db8:1:3::1"), key);
    assert.equal(addressKey("::1"), "0:0:0:0::/64");
  });

  it("leaves anything else alone", () => {
    assert.equal(addressKey("not-an-address"), "not-an-address");
  });
});
