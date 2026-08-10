var SHEET_NAME = "GDev Leads Gathering";
var SCRIPT_BUILD = "2026-08-10-email-export-v1";
var EXPECTED_HEADERS = [
  "Date", "Roadshow Location", "Roadshow State", "Full Name", "Email Address", "Mobile Number",
  "IC Number", "Agent Name", "Agent ID", "GM Name",
  "Current Insurance Company", "Age Band", "Marital Status", "Employment Type",
  "Monthly Income", "Existing Insurance Plan",
  "Financial Priorities in the next 12 months", "Presentation done",
  "Potential follow up", "On the spot close case", "ANP",
  "Submission Timestamp", "Submission ID", "Email Sent Timestamp"
];
var BASE_COLUMN_KEYS = [
  "date", "roadshowLocation", "roadshowState", "fullName", "emailAddress", "mobileNumber",
  "icNumber", "agentName", "agentId", "gmName", "currentInsuranceCompany",
  "ageBand", "maritalStatus", "employmentType", "monthlyPersonalIncome",
  "existingInsurancePlans", "financialPriorities"
];
var OUTCOME_COLUMN_KEYS = [
  "presentationDone", "potentialFollowUp", "onTheSpotCloseCase", "anp"
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error("Missing request body");
    var data = JSON.parse(e.postData.contents);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid payload");

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error("Sheet tab not found: " + SHEET_NAME);
    verifyHeaders_(sheet);

    lock.waitLock(30000);
    if (data.action === "create") return createSubmission_(sheet, data);
    if (data.action === "complete") return completeSubmission_(sheet, data);
    throw new Error("Invalid submission action");
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({
      success: false,
      error: "[" + SCRIPT_BUILD + "] " + (error && error.message ? error.message : "Unable to process survey")
    });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function createSubmission_(sheet, data) {
  var baseRow = BASE_COLUMN_KEYS.map(function (key) {
    if (key === "mobileNumber" || key === "icNumber") return forcedTextCell_(data[key]);
    return safeCell_(data[key]);
  });
  var emptyOutcomes = OUTCOME_COLUMN_KEYS.map(function () { return ""; });
  var timestamp = new Date();
  var submissionId = Utilities.getUuid();
  var row = baseRow.concat(emptyOutcomes, [timestamp, submissionId, ""]);
  var targetRow = sheet.getLastRow() + 1;

  sheet.getRange(targetRow, 6).setNumberFormat("@");
  sheet.getRange(targetRow, 7).setNumberFormat("@");
  sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
  sheet.getRange(targetRow, 22).setNumberFormat("yyyy-mm-dd hh:mm:ss");
  SpreadsheetApp.flush();
  return jsonResponse_({ success: true, submissionId: submissionId });
}

function completeSubmission_(sheet, data) {
  var submissionId = data.submissionId == null ? "" : String(data.submissionId).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId)) {
    throw new Error("Invalid submission ID");
  }
  validateOutcomes_(data);
  var rowCount = sheet.getLastRow() - 1;
  if (rowCount < 1) throw new Error("Submission not found");
  var idCell = sheet.getRange(2, 23, rowCount, 1)
    .createTextFinder(submissionId).matchEntireCell(true).findNext();
  if (!idCell) throw new Error("Submission not found");
  var outcomes = OUTCOME_COLUMN_KEYS.map(function (key) { return safeCell_(data[key]); });
  sheet.getRange(idCell.getRow(), 18, 1, outcomes.length).setValues([outcomes]);
  sendSubmissionEmail_(sheet, idCell.getRow());
  SpreadsheetApp.flush();
  return jsonResponse_({ success: true });
}

function sendSubmissionEmail_(sheet, rowNumber) {
  var emailSentCell = sheet.getRange(rowNumber, 24);
  if (emailSentCell.getValue()) return;

  if (MailApp.getRemainingDailyQuota() < 1) {
    throw new Error("The daily email quota has been reached");
  }

  var values = sheet.getRange(rowNumber, 1, 1, EXPECTED_HEADERS.length).getDisplayValues()[0];
  var recipient = values[4].trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error("Invalid email address stored in the submission");
  }

  var fullName = values[3];
  var icNumber = values[6];
  var maskedIc = icNumber.length > 4
    ? new Array(icNumber.length - 3).join("*") + icNumber.slice(-4)
    : icNumber;
  var body = [
    "Hello " + fullName + ",",
    "",
    "Your survey submission has been completed successfully.",
    "",
    "Date: " + values[0],
    "Roadshow Location: " + values[1],
    "Roadshow State: " + values[2],
    "Full Name: " + fullName,
    "Email Address: " + recipient,
    "Mobile Number: " + values[5],
    "IC Number: " + maskedIc,
    "Agent Name: " + values[7],
    "Agent ID: " + values[8],
    "GM Name: " + values[9],
    "Current Insurance Company: " + values[10],
    "Age Band: " + values[11],
    "Marital Status: " + values[12],
    "Employment Type: " + values[13],
    "Monthly Income: " + values[14],
    "Existing Insurance Plan: " + values[15],
    "Financial Priorities: " + values[16],
    "Presentation done: " + values[17],
    "Potential follow up: " + values[18],
    "On the spot close case: " + values[19],
    "ANP: " + values[20],
    "Submission Timestamp: " + values[21],
    "",
    "This is an automated email."
  ].join("\n");

  MailApp.sendEmail({
    to: recipient,
    subject: "Survey Submission - " + fullName,
    body: body,
    name: "Great Eastern Survey"
  });

  emailSentCell.setValue(new Date()).setNumberFormat("yyyy-mm-dd hh:mm:ss");
}

function validateOutcomes_(data) {
  ["presentationDone", "potentialFollowUp", "onTheSpotCloseCase"].forEach(function (key) {
    if (data[key] !== "Yes" && data[key] !== "No") throw new Error(key + " must be Yes or No");
  });
  var anp = data.anp == null ? "" : String(data.anp).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(anp)) {
    throw new Error("ANP must be a number with no more than two decimal places");
  }
}

function verifyHeaders_(sheet) {
  var headers = sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).getDisplayValues()[0];
  var mismatches = [];
  EXPECTED_HEADERS.forEach(function (expected, index) {
    if (headers[index] !== expected) {
      mismatches.push("Column " + (index + 1) + ': expected "' + expected + '", found "' + (headers[index] || "(blank)") + '"');
    }
  });
  if (mismatches.length) throw new Error("Sheet header mismatch. " + mismatches.join("; "));
}

function safeCell_(value) {
  var text = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function forcedTextCell_(value) {
  var text = value === null || value === undefined ? "" : String(value);
  return text === "" ? "" : "'" + text;
}

function jsonResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
