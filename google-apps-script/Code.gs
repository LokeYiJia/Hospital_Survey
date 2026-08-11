var SHEET_NAME = "GDev Leads Gathering";
var SCRIPT_BUILD = "2026-08-11-agent-report-v1";
var EXPECTED_HEADERS = [
  "Date", "Roadshow Location", "Roadshow State", "Full Name", "Email Address", "Mobile Number",
  "IC Number", "Agent Name", "Agent ID", "Agent Email", "GM Name",
  "Current Insurance Company", "Age Band", "Marital Status", "Employment Type",
  "Monthly Income", "Existing Insurance Plan",
  "Financial Priorities in the next 12 months", "Presentation done",
  "Potential follow up", "On the spot close case", "ANP",
  "Submission Timestamp", "Submission ID", "Email Sent Timestamp"
];
var BASE_COLUMN_KEYS = [
  "date", "roadshowLocation", "roadshowState", "fullName", "emailAddress", "mobileNumber",
  "icNumber", "agentName", "agentId", "agentEmail", "gmName", "currentInsuranceCompany",
  "ageBand", "maritalStatus", "employmentType", "monthlyPersonalIncome",
  "existingInsurancePlans", "financialPriorities"
];
var OUTCOME_COLUMN_KEYS = [
  "presentationDone", "potentialFollowUp", "onTheSpotCloseCase", "anp"
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Agent Reports")
    .addItem("Send unsent agent reports", "sendAgentReports")
    .addToUi();
}

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
  sheet.getRange(targetRow, 23).setNumberFormat("yyyy-mm-dd hh:mm:ss");
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
  var idCell = sheet.getRange(2, 24, rowCount, 1)
    .createTextFinder(submissionId).matchEntireCell(true).findNext();
  if (!idCell) throw new Error("Submission not found");
  var outcomes = OUTCOME_COLUMN_KEYS.map(function (key) { return safeCell_(data[key]); });
  sheet.getRange(idCell.getRow(), 19, 1, outcomes.length).setValues([outcomes]);
  SpreadsheetApp.flush();
  return jsonResponse_({ success: true });
}

function sendAgentReports() {
  var ui = SpreadsheetApp.getUi();
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error("Sheet tab not found: " + SHEET_NAME);
    verifyHeaders_(sheet);

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      ui.alert("Agent Reports", "There are no submissions to send.", ui.ButtonSet.OK);
      return;
    }

    var rows = sheet.getRange(2, 1, lastRow - 1, EXPECTED_HEADERS.length).getDisplayValues();
    var groups = {};
    var incompleteCount = 0;
    var invalidEmailCount = 0;

    rows.forEach(function (values, index) {
      var sheetRow = index + 2;
      var alreadySent = values[24].trim() !== "";
      var completed = values[18].trim() !== ""
        && values[19].trim() !== ""
        && values[20].trim() !== ""
        && values[21].trim() !== "";

      if (alreadySent) return;
      if (!completed) {
        incompleteCount++;
        return;
      }

      var agentEmail = values[9].trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(agentEmail)) {
        invalidEmailCount++;
        return;
      }

      if (!groups[agentEmail]) groups[agentEmail] = [];
      groups[agentEmail].push({ rowNumber: sheetRow, values: values });
    });

    var recipients = Object.keys(groups);
    if (recipients.length === 0) {
      ui.alert(
        "Agent Reports",
        "No completed, unsent submissions were found."
          + formatSkippedRows_(incompleteCount, invalidEmailCount),
        ui.ButtonSet.OK
      );
      return;
    }

    var remainingQuota = MailApp.getRemainingDailyQuota();
    if (remainingQuota < recipients.length) {
      throw new Error(
        "Not enough email quota. " + recipients.length
          + " agent reports are ready, but only " + remainingQuota + " recipients remain today."
      );
    }

    var sentAt = new Date();
    var totalLeads = 0;
    recipients.forEach(function (agentEmail) {
      var leads = groups[agentEmail];
      var report = buildAgentReport_(agentEmail, leads);
      MailApp.sendEmail({
        to: agentEmail,
        subject: "GDev Lead Report - " + leads.length + (leads.length === 1 ? " lead" : " leads"),
        body: report.text,
        htmlBody: report.html,
        name: "Great Eastern Survey"
      });

      leads.forEach(function (lead) {
        sheet.getRange(lead.rowNumber, 25)
          .setValue(sentAt)
          .setNumberFormat("yyyy-mm-dd hh:mm:ss");
      });
      totalLeads += leads.length;
    });

    SpreadsheetApp.flush();
    ui.alert(
      "Agent Reports Sent",
      "Sent " + recipients.length + " agent email(s) containing " + totalLeads + " lead(s)."
        + formatSkippedRows_(incompleteCount, invalidEmailCount),
      ui.ButtonSet.OK
    );
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    ui.alert(
      "Agent Reports Failed",
      error && error.message ? error.message : "Unable to send agent reports.",
      ui.ButtonSet.OK
    );
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function buildAgentReport_(agentEmail, leads) {
  var generatedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var textLines = [
    "Hello,",
    "",
    "Here are " + leads.length + (leads.length === 1 ? " lead" : " leads") + " assigned to " + agentEmail + ".",
    ""
  ];
  var htmlSections = leads.map(function (lead, index) {
    var values = lead.values;
    var maskedIc = maskIcNumber_(values[6]);
    var fields = [
      ["Date", values[0]],
      ["Roadshow Location", values[1]],
      ["Roadshow State", values[2]],
      ["Full Name", values[3]],
      ["Email Address", values[4]],
      ["Mobile Number", values[5]],
      ["IC Number", maskedIc],
      ["Agent Name", values[7]],
      ["Agent ID", values[8]],
      ["GM Name", values[10]],
      ["Current Insurance Company", values[11]],
      ["Age Band", values[12]],
      ["Marital Status", values[13]],
      ["Employment Type", values[14]],
      ["Monthly Income", values[15]],
      ["Existing Insurance Plan", values[16]],
      ["Financial Priorities", values[17]],
      ["Presentation done", values[18]],
      ["Potential follow up", values[19]],
      ["On the spot close case", values[20]],
      ["ANP", values[21]],
      ["Submission Timestamp", values[22]]
    ];

    textLines.push("Lead " + (index + 1));
    fields.forEach(function (field) {
      textLines.push(field[0] + ": " + field[1]);
    });
    textLines.push("");

    var rows = fields.map(function (field) {
      return "<tr><th style=\"padding:6px 10px;text-align:left;vertical-align:top;background:#f3f5f7;border:1px solid #d9dde3\">"
        + escapeHtml_(field[0])
        + "</th><td style=\"padding:6px 10px;border:1px solid #d9dde3\">"
        + escapeHtml_(field[1]) + "</td></tr>";
    }).join("");

    return "<h2 style=\"color:#102746;margin:24px 0 8px\">Lead " + (index + 1)
      + ": " + escapeHtml_(values[3]) + "</h2>"
      + "<table style=\"border-collapse:collapse;width:100%;max-width:760px\">" + rows + "</table>";
  }).join("");

  textLines.push("Report generated: " + generatedAt);
  return {
    text: textLines.join("\n"),
    html: "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#172033\">"
      + "<p>Hello,</p><p>Here are <strong>" + leads.length
      + (leads.length === 1 ? " lead" : " leads") + "</strong> assigned to "
      + escapeHtml_(agentEmail) + ".</p>" + htmlSections
      + "<p style=\"margin-top:24px;color:#5c667a\">Report generated: "
      + escapeHtml_(generatedAt) + "</p></div>"
  };
}

function maskIcNumber_(value) {
  var text = value == null ? "" : String(value);
  return text.length > 4
    ? new Array(text.length - 3).join("*") + text.slice(-4)
    : text;
}

function escapeHtml_(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSkippedRows_(incompleteCount, invalidEmailCount) {
  var messages = [];
  if (incompleteCount) messages.push(incompleteCount + " incomplete row(s) skipped");
  if (invalidEmailCount) messages.push(invalidEmailCount + " row(s) with invalid Agent Email skipped");
  return messages.length ? "\n\n" + messages.join("; ") + "." : "";
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
