import assert from "node:assert/strict";
import test from "node:test";
import { POST as routeRequest } from "../app/api/route/route.ts";
import { buildCsv } from "../lib/csv.ts";
import { isWithinDushanbe } from "../lib/dushanbe.ts";
import { isReviewedStatus, nextReviewedStatus } from "../lib/review-workflow.ts";

function request(body: unknown) {
  return new Request("https://roadlens.test/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("Dushanbe bounds accept edges and reject malformed or outside points", () => {
  assert.equal(isWithinDushanbe(38.39, 68.53), true);
  assert.equal(isWithinDushanbe(38.78, 69.04), true);
  assert.equal(isWithinDushanbe(38.5737, 68.7738), true);
  assert.equal(isWithinDushanbe(38.3899, 68.7738), false);
  assert.equal(isWithinDushanbe(38.5737, 69.0401), false);
  assert.equal(isWithinDushanbe(Number.NaN, 68.7738), false);
  assert.equal(isWithinDushanbe("38.57", 68.7738), false);
});

test("review workflow only permits known statuses in order", () => {
  assert.equal(isReviewedStatus("verified"), true);
  assert.equal(isReviewedStatus("rejected"), false);
  assert.equal(isReviewedStatus(null), false);
  assert.equal(nextReviewedStatus("verified"), "scheduled");
  assert.equal(nextReviewedStatus("scheduled"), "repairing");
  assert.equal(nextReviewedStatus("repairing"), "repaired");
  assert.equal(nextReviewedStatus("repaired"), null);
  assert.equal(nextReviewedStatus("pending_review"), null);
});

test("CSV output escapes quotes, commas, newlines, and spreadsheet formulas", () => {
  const csv = buildCsv(["Road", "Note"], [
    ["Rudaki, Avenue", "He said \"repair\""],
    ["=HYPERLINK(\"bad\")", "line one\nline two"],
    [null, 12],
  ]);
  assert.equal(csv, '"Road","Note"\n"Rudaki, Avenue","He said ""repair"""\n"\'=HYPERLINK(""bad"")","line one\nline two"\n"","12"');
});

test("route API rejects invalid JSON", async () => {
  const response = await routeRequest(new Request("https://roadlens.test/api/route", { method: "POST", body: "{" }));
  assert.equal(response.status, 400);
});

test("route API rejects malformed and out-of-city coordinates", async () => {
  for (const coordinates of [[], [null], [{ latitude: "38.57", longitude: 68.77 }], [{ latitude: 40, longitude: 70 }]]) {
    const response = await routeRequest(request({ coordinates }));
    assert.equal(response.status, 422);
  }
});

test("route API rejects more than twelve stops instead of silently truncating", async () => {
  const coordinates = Array.from({ length: 13 }, (_, index) => ({ latitude: 38.55 + index * 0.001, longitude: 68.75 }));
  const response = await routeRequest(request({ coordinates }));
  assert.equal(response.status, 422);
});

test("single-stop routes do not call the external routing service", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("unexpected fetch"); };
  const response = await routeRequest(request({ coordinates: [{ latitude: 38.5737, longitude: 68.7738 }] }));
  assert.equal(response.status, 200);
  assert.equal(called, false);
  assert.deepEqual(await response.json(), { coordinates: [[38.5737, 68.7738]], distanceMeters: 0, durationSeconds: 0, source: "single-stop" });
});

test("road-network routes validate and convert GeoJSON longitude/latitude order", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({ routes: [{ distance: 1250.5, duration: 180, geometry: { coordinates: [[68.77, 38.57], [68.78, 38.58]] } }] });
  const response = await routeRequest(request({ coordinates: [{ latitude: 38.57, longitude: 68.77 }, { latitude: 38.58, longitude: 68.78 }] }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { coordinates: [[38.57, 68.77], [38.58, 68.78]], distanceMeters: 1250.5, durationSeconds: 180, source: "road-network" });
});

test("route API fails safely when the routing service returns malformed data", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  context.after(() => { globalThis.fetch = originalFetch; console.error = originalError; });
  globalThis.fetch = async () => Response.json({ routes: [{ distance: -1, duration: 20, geometry: { coordinates: [[68.77, 38.57]] } }] });
  console.error = () => undefined;
  const response = await routeRequest(request({ coordinates: [{ latitude: 38.57, longitude: 68.77 }, { latitude: 38.58, longitude: 68.78 }] }));
  assert.equal(response.status, 503);
});
