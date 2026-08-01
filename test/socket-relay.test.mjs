// The GM-proxy relay's pure core: routing, the action registry, and the payload rule.
// `node test/socket-relay.test.mjs` (exit 0 pass, 1 fail).
//
// spec: relayed-payloads-carry-ids-only
//
// The relay exists because remote play crosses ownership: attack-card flags belong to
// the attacker's author, a repelled hit updates the attacker from the defender's
// click, a cast buff lands Active Effects on the whole other side. The DESIGN RULE
// under test here is the anti-forgery one: an emitted payload carries ids and enum
// keys only, and the GM-side handler re-reads every number from documents it already
// trusts. A socket message can press a button that exists; it can never invent a
// damage total. That is the same author-forgeable-flags discipline the combat
// sanitizers enforce, extended to the wire.
//
// The dispatch layer is Foundry-coupled and unreachable from node; §2 records the
// two-client channel as manual-only.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { RELAY_ACTIONS, FORBIDDEN_PAYLOAD_KEYS, relayRoute, validRelayPayload } =
  await import("../module/helpers/socket.mjs");

let passed = 0;
let failed = 0;
const failures = [];

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; failures.push(`${label}\n    expected ${e}\n    got      ${a}`); }
}
function ok(cond, label) { eq(!!cond, true, label); }

// ------------------------------------------------------------------ routing

eq(relayRoute({ isGM: true, hasActiveGM: true }), "local", "a GM always runs locally");
eq(relayRoute({ isGM: true, hasActiveGM: false }), "local",
  "a GM runs locally even when activeGM is not yet resolved");
eq(relayRoute({ isGM: false, hasActiveGM: true }), "emit", "a player relays to the active GM");
eq(relayRoute({ isGM: false, hasActiveGM: false }), "blocked",
  "ESCAPE: with no GM connected the action is refused, never half-run");

// ---------------------------------------------------------- the payload rule

for (const [action, spec] of Object.entries(RELAY_ACTIONS)) {
  for (const key of Object.keys(spec)) {
    ok(!FORBIDDEN_PAYLOAD_KEYS.some(bad => key.toLowerCase().includes(bad.toLowerCase())),
      `${action}.${key} carries no computed number across the wire`);
    ok(/^(messageId|index|skipDodge|kind|outcome|key|casterTokenUuid|targetTokenUuids)$/.test(key),
      `${action}.${key} is an id, an index, or an enum key`);
  }
}

// Validation is exact-set: a forged extra field, a missing field, or a wrong type
// all reject the payload before any handler sees it.
ok(validRelayPayload("resolveAttack", { messageId: "abc", index: 0, skipDodge: false }),
  "a well-formed resolveAttack payload passes");
ok(!validRelayPayload("resolveAttack", { messageId: "abc", index: 0 }),
  "a missing key rejects");
ok(!validRelayPayload("resolveAttack", { messageId: "abc", index: 0, skipDodge: false, rawPower: 999 }),
  "ESCAPE: a smuggled extra field rejects the whole payload");
ok(!validRelayPayload("resolveAttack", { messageId: "abc", index: -1, skipDodge: false }),
  "a negative index rejects");
ok(!validRelayPayload("resolveAttack", { messageId: "abc", index: 1.5, skipDodge: false }),
  "a fractional index rejects");
ok(!validRelayPayload("resolveAttack", { messageId: 7, index: 0, skipDodge: false }),
  "a non-string id rejects");
ok(!validRelayPayload("nosuchaction", { messageId: "abc" }), "an unknown action rejects");
ok(!validRelayPayload("halveDamage", null), "a null payload rejects");
ok(validRelayPayload("buffCast",
  { casterTokenUuid: "Scene.a.Token.b", targetTokenUuids: ["Scene.a.Token.c"], key: "tarunda" }),
"a well-formed buffCast passes");
ok(!validRelayPayload("buffCast",
  { casterTokenUuid: "Scene.a.Token.b", targetTokenUuids: [7], key: "tarunda" }),
"a non-string uuid inside the list rejects");

// ------------------------------------------- registry <-> call-site contract

// Every runRelayed("<action>", …) call in shipped code names a registered action,
// and every registered action is actually called somewhere — a dead handler is a
// door with no room behind it, and an unregistered call is a room with no door.
const sources = ["smt-rpg.mjs", "module/documents/item.mjs", "module/helpers/socket.mjs"]
  .map(f => readFileSync(join(ROOT, f), "utf8")).join("\n");
const called = new Set([...sources.matchAll(/runRelayed\(\s*"([a-zA-Z]+)"/g)].map(m => m[1]));
const registered = new Set(Object.keys(RELAY_ACTIONS));

for (const action of called) {
  ok(registered.has(action), `call site uses "${action}", which the registry declares`);
}
for (const action of registered) {
  // buffClear routes through the same _castBuff call site as buffCast (the dispel
  // branch picks between them), so the literal appears in a ternary — the regex
  // above only catches direct literals. Assert its presence textually instead.
  const present = called.has(action) || sources.includes(`"${action}"`);
  ok(present, `registered action "${action}" has a call site`);
}

// The socket handler executes only on the active GM's client — the guard is the
// single line that keeps two connected GMs from double-applying damage. Asserted
// textually because no node context can construct two clients.
ok(sources.includes("game.users.activeGM?.isSelf"),
  "exactly-one-executor guard present in the socket handler");

console.log(`\nsmt-rpg socket-relay tests: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
