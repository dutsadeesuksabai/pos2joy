import test from "node:test";
import assert from "node:assert/strict";
import { toLoginEmail, displayIdentity, usernameDomain, InvalidIdentifier } from "../src/features/tenancy/identity.ts";

test("a username becomes a synthetic address, case and padding ignored", () => {
  assert.equal(toLoginEmail("owner"), `owner@${usernameDomain}`);
  assert.equal(toLoginEmail("  Owner  "), `owner@${usernameDomain}`);
  assert.equal(toLoginEmail("front_desk.01"), `front_desk.01@${usernameDomain}`);
});

test("a real email address is still accepted and normalised", () => {
  assert.equal(toLoginEmail("Alex@Restaurant.com"), "alex@restaurant.com");
  assert.equal(toLoginEmail(" chef@kitchen.co.th "), "chef@kitchen.co.th");
});

test("a username cannot smuggle in another address", () => {
  for (const bad of ["owner@evil.com extra", "own er", "a", "ab", "-owner", "owner-", "own/er", "own\\er", "ow\ner", "owner@", "@owner", "ówner", "o".repeat(31)]) {
    assert.throws(() => toLoginEmail(bad), InvalidIdentifier, `should reject ${JSON.stringify(bad)}`);
  }
});

test("a malformed email is rejected rather than treated as a username", () => {
  for (const bad of ["a@b", "@b.com", "a@@b.com", "a b@c.com", `${"a".repeat(250)}@b.com`]) {
    assert.throws(() => toLoginEmail(bad), InvalidIdentifier, `should reject ${JSON.stringify(bad)}`);
  }
});

test("the synthetic domain is hidden again for display, real addresses are not", () => {
  assert.equal(displayIdentity(`owner@${usernameDomain}`), "owner");
  assert.equal(displayIdentity("alex@restaurant.com"), "alex@restaurant.com");
  assert.equal(displayIdentity(undefined), "");
});

test("every valid username round-trips back to itself", () => {
  for (const name of ["owner", "manager", "host", "server-2", "kitchen.main", "cashier_01"]) {
    assert.equal(displayIdentity(toLoginEmail(name)), name);
  }
});
