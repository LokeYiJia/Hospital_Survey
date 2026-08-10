import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { onRequest } from "../functions/api/submit-lead.js";

const submissionId = "123e4567-e89b-12d3-a456-426614174000";
const env = { GOOGLE_SHEETS_WEBHOOK_URL: "https://script.google.test/web-app" };
const validCreate = () => ({
  action: "create", date: "2026-08-07", roadshowLocation: " Gleneagles ",
  roadshowState: "Kuala Lumpur", fullName: " Alex Tan ", emailAddress: " alex@example.com ", mobileNumber: "+60 12 345 6789",
  icNumber: "0304150704063", agentName: "Test Agent", agentId: "GE123", gmName: "Test GM",
  currentInsuranceCompany: "Prudential", ageBand: "25-34", maritalStatus: "Single",
  employmentType: "Salaried", monthlyPersonalIncome: "RM3-6k",
  existingInsurancePlans: ["Medical Card"], financialPriorities: ["Build emergency fund"],
  consent: true,
});
const validComplete = () => ({
  action: "complete", submissionId, presentationDone: "Yes", potentialFollowUp: "No",
  onTheSpotCloseCase: "No", anp: "1200.50",
});
const requestFor = (body, options = {}) => new Request("https://survey.example/api/submit-lead", {
  method: options.method || "POST",
  headers: { "Content-Type": options.contentType || "application/json" },
  body: (options.method || "POST") === "GET" ? undefined : options.rawBody ?? JSON.stringify(body),
});

test("rejects non-POST methods", async () => {
  const response = await onRequest({ request: requestFor(null, { method: "GET" }), env });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "POST");
});

test("creates a lead and forwards the GE fields in order", async (t) => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (_url, init) => {
    forwarded = JSON.parse(init.body);
    return Response.json({ success: true, submissionId });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequest({ request: requestFor(validCreate()), env });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, submissionId });
  assert.deepEqual(Object.keys(forwarded), [
    "action", "date", "roadshowLocation", "roadshowState", "fullName", "emailAddress", "mobileNumber",
    "icNumber", "agentName", "agentId", "gmName", "currentInsuranceCompany", "ageBand",
    "maritalStatus", "employmentType", "monthlyPersonalIncome", "existingInsurancePlans",
    "financialPriorities",
  ]);
  assert.equal(forwarded.roadshowLocation, "Gleneagles");
  assert.equal(forwarded.emailAddress, "alex@example.com");
  assert.equal(forwarded.icNumber, "0304150704063");
  assert.equal("consent" in forwarded, false);
  assert.equal("participantType" in forwarded, false);
});

test("completes the same lead with only the popup fields", async (t) => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (_url, init) => {
    forwarded = JSON.parse(init.body);
    return Response.json({ success: true });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequest({ request: requestFor(validComplete()), env });
  assert.equal(response.status, 200);
  assert.deepEqual(forwarded, validComplete());
});

test("rejects invalid state, popup answers, and ANP", async () => {
  assert.equal((await onRequest({ request: requestFor({ ...validCreate(), emailAddress: "not-an-email" }), env })).status, 400);
  assert.equal((await onRequest({ request: requestFor({ ...validCreate(), roadshowLocation: "Unknown Hospital" }), env })).status, 400);
  assert.equal((await onRequest({ request: requestFor({ ...validCreate(), roadshowState: "Sabah" }), env })).status, 400);
  assert.equal((await onRequest({ request: requestFor({ ...validComplete(), presentationDone: "Maybe" }), env })).status, 400);
  const response = await onRequest({ request: requestFor({ ...validComplete(), anp: "RM 1,200" }), env });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /ANP must be a number/i);
});

test("requires checkbox selections and consent", async () => {
  const response = await onRequest({
    request: requestFor({ ...validCreate(), existingInsurancePlans: [], consent: false }), env,
  });
  assert.equal(response.status, 400);
});

test("rejects invalid content types and oversized bodies", async () => {
  assert.equal((await onRequest({ request: requestFor({}, { contentType: "text/plain" }), env })).status, 415);
  assert.equal((await onRequest({ request: requestFor(null, { rawBody: JSON.stringify({ padding: "x".repeat(21_000) }) }), env })).status, 413);
});

test("frontend calls only the same-origin API and exposes no webhook", async () => {
  const files = (await readdir("src")).filter((name) => /\.(jsx?|css)$/.test(name));
  const source = (await Promise.all(files.map((name) => readFile(join("src", name), "utf8")))).join("\n");
  const targets = [...source.matchAll(/fetch\(\s*["'`]([^"'`]+)["'`]/g)].map((match) => match[1]);
  assert.deepEqual(targets, ["/api/submit-lead"]);
  assert.equal(source.includes("GOOGLE_SHEETS_WEBHOOK_URL"), false);
  assert.equal(/script\.google(?:usercontent)?\.com/i.test(source), false);
});
