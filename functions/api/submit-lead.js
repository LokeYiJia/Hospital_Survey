const MAX_BODY_BYTES = 20_000;

const FIELD_LIMITS = {
  date: 10, roadshowLocation: 150, roadshowState: 100, fullName: 150, emailAddress: 254,
  mobileNumber: 30, icNumber: 30, agentName: 150, agentId: 80, agentEmail: 254,
  gmName: 150, currentInsuranceCompany: 150, ageBand: 10,
  maritalStatus: 30, employmentType: 110, monthlyPersonalIncome: 20,
};
const REQUIRED_FIELDS = [
  "date", "roadshowLocation", "roadshowState", "fullName", "emailAddress", "mobileNumber",
  "icNumber", "agentName", "agentId", "agentEmail", "gmName", "ageBand", "maritalStatus",
  "employmentType", "monthlyPersonalIncome",
];
const OUTCOME_LIMITS = {
  presentationDone: 3, potentialFollowUp: 3, onTheSpotCloseCase: 3, anp: 20,
};
const ALLOWED = {
  roadshowLocation: [
    "Gleneagles",
    "Mahkota Medical Center",
    "KPJ Specialist Hospital",
    "Sunway Medical Center",
    "Hospital Seri Botani",
  ],
  roadshowState: [
    "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
    "Pulau Pinang", "Perak", "Perlis", "Selangor", "Terengganu",
    "Kuala Lumpur", "Putrajaya",
  ],
  ageBand: ["<25", "25-34", "35-44", "45-54", "55-64", "65+"],
  maritalStatus: ["Single", "Married", "Married with children", "Divorced / widowed"],
  employmentType: ["Salaried", "Self-employed", "Business owner", "Homemaker", "Retired", "Student"],
  monthlyPersonalIncome: ["<RM3k", "RM3-6k", "RM6-10k", "RM10-20k", ">RM20k"],
  existingInsurancePlans: ["Medical Card", "Life / Term", "Critical Illness", "Savings", "Legacy", "Not sure", "I don’t have one"],
  financialPriorities: [
    "Plan for kids’ education", "Build emergency fund", "Retirement savings",
    "Increase my savings", "Venture into investment", "Manage my debts better",
    "Reduce medical expenses risk", "Protect income if I cannot work",
    "Plan for legacy / estate planning", "Review and optimize current policies",
    "Accident and disability coverage", "Critical illness planning",
  ],
};

const json = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  },
});
const cleanText = (value) => typeof value === "string" ? value.trim() : "";

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function cleanAllowedArray(value, allowed) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const cleaned = value.map(cleanText);
  if (new Set(cleaned).size !== cleaned.length) return null;
  return cleaned.every((item) => allowed.includes(item)) ? cleaned : null;
}

function validateCreate(data) {
  const cleaned = Object.fromEntries(
    Object.keys(FIELD_LIMITS).map((field) => [field, cleanText(data[field])]),
  );
  for (const field of REQUIRED_FIELDS) {
    if (!cleaned[field]) throw new Error(`Missing required field: ${field}`);
  }
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    if (cleaned[field].length > limit) throw new Error(`Field is too long: ${field}`);
  }
  if (data.consent !== true) throw new Error("Consent is required");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned.emailAddress)) {
    throw new Error("Invalid email address");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned.agentEmail)) {
    throw new Error("Invalid agent email address");
  }

  const phoneDigits = cleaned.mobileNumber.replace(/\D/g, "");
  if (!/^\+?[0-9 ]+$/.test(cleaned.mobileNumber) || phoneDigits.length < 7 || phoneDigits.length > 15) {
    throw new Error("Invalid mobile number");
  }
  if (!/^[A-Za-z0-9 -]+$/.test(cleaned.icNumber)) {
    throw new Error("IC number may contain letters, numbers, spaces, and hyphens only");
  }
  if (!validDate(cleaned.date)) throw new Error("Invalid date");
  if (!ALLOWED.roadshowLocation.includes(cleaned.roadshowLocation)) throw new Error("Invalid roadshow location");
  if (!ALLOWED.roadshowState.includes(cleaned.roadshowState)) throw new Error("Invalid roadshow state");
  if (!ALLOWED.ageBand.includes(cleaned.ageBand)
    || !ALLOWED.maritalStatus.includes(cleaned.maritalStatus)
    || !ALLOWED.monthlyPersonalIncome.includes(cleaned.monthlyPersonalIncome)) {
    throw new Error("Invalid profile selection");
  }
  const standardEmployment = ALLOWED.employmentType.includes(cleaned.employmentType);
  const otherEmployment = cleaned.employmentType.startsWith("Others: ")
    && cleaned.employmentType.slice(8).trim().length > 0;
  if (!standardEmployment && !otherEmployment) throw new Error("Invalid employment type");

  const plans = cleanAllowedArray(data.existingInsurancePlans, ALLOWED.existingInsurancePlans);
  const priorities = cleanAllowedArray(data.financialPriorities, ALLOWED.financialPriorities);
  if (!plans || !priorities) throw new Error("Invalid or missing checkbox selection");

  return {
    action: "create",
    date: cleaned.date,
    roadshowLocation: cleaned.roadshowLocation,
    roadshowState: cleaned.roadshowState,
    fullName: cleaned.fullName,
    emailAddress: cleaned.emailAddress,
    mobileNumber: cleaned.mobileNumber,
    icNumber: cleaned.icNumber,
    agentName: cleaned.agentName,
    agentId: cleaned.agentId,
    agentEmail: cleaned.agentEmail,
    gmName: cleaned.gmName,
    currentInsuranceCompany: cleaned.currentInsuranceCompany,
    ageBand: cleaned.ageBand,
    maritalStatus: cleaned.maritalStatus,
    employmentType: cleaned.employmentType,
    monthlyPersonalIncome: cleaned.monthlyPersonalIncome,
    existingInsurancePlans: plans.join(", "),
    financialPriorities: priorities.join(", "),
  };
}

function validateComplete(data) {
  const submissionId = cleanText(data.submissionId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId)) {
    throw new Error("Invalid submission ID");
  }
  const cleaned = Object.fromEntries(
    Object.keys(OUTCOME_LIMITS).map((field) => [field, cleanText(data[field])]),
  );
  for (const [field, limit] of Object.entries(OUTCOME_LIMITS)) {
    if (!cleaned[field]) throw new Error(`Missing required field: ${field}`);
    if (cleaned[field].length > limit) throw new Error(`Field is too long: ${field}`);
  }
  if (![cleaned.presentationDone, cleaned.potentialFollowUp, cleaned.onTheSpotCloseCase]
    .every((value) => value === "Yes" || value === "No")) {
    throw new Error("Invalid Yes or No submission detail");
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned.anp)) {
    throw new Error("ANP must be a number with no more than two decimal places");
  }
  return { action: "complete", submissionId, ...cleaned };
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405, { Allow: "POST" });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ success: false, error: "Content-Type must be application/json" }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ success: false, error: "Request body is too large" }, 413);

  let data;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
      return json({ success: false, error: "Request body is too large" }, 413);
    }
    data = JSON.parse(rawBody);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }

  let payload;
  try {
    if (data.action === "create") payload = validateCreate(data);
    else if (data.action === "complete") payload = validateComplete(data);
    else throw new Error("Invalid submission action");
  } catch (error) {
    return json({ success: false, error: error.message || "Invalid submission" }, 400);
  }

  if (!env?.GOOGLE_SHEETS_WEBHOOK_URL) {
    console.error("GOOGLE_SHEETS_WEBHOOK_URL is not configured");
    return json({ success: false, error: "Submission service is not configured" }, 500);
  }

  try {
    const upstream = await fetch(env.GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responseText = await upstream.text();
    let result;
    try { result = JSON.parse(responseText); } catch { result = null; }
    if (!upstream.ok || result?.success !== true) {
      const details = typeof result?.error === "string" ? result.error.slice(0, 500) : "Unable to save the survey right now";
      console.error("Google Apps Script rejected submission:", upstream.status, details);
      return json({ success: false, error: "Data destination reported an error", details }, 502);
    }
    if (data.action === "create") {
      const submissionId = cleanText(result.submissionId);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId)) {
        return json({ success: false, error: "Data destination returned an invalid submission ID" }, 502);
      }
      return json({ success: true, submissionId });
    }
    return json({ success: true });
  } catch (error) {
    console.error("Google Apps Script request failed:", error);
    return json({ success: false, error: "Unable to save the survey right now" }, 502);
  }
}
