const SPREADSHEET_ID = "1pV5sz5PJTTaGvXbUNAVqwWB_-eAC2B5bTe1XEo5tgT4";
const SHEET_NAME = ""; // Leave blank for the first tab

function doGet(e) {
  return handleRequest(e ? e.parameter : {});
}

function doPost(e) {
  let params = {};
  try {
    if (e && e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    params = e ? e.parameter : {};
  }
  return handleRequest(params);
}

function handleRequest(params) {
  try {
    if (!params) return jsonOut({ ok: false, error: "No parameters received" });
    
    const action = String(params.action || "").trim();
    if (action === "submit") return handleSubmit(params);
    if (action === "get_config") return handleGetConfig(params);
    
    return jsonOut({ ok: true, message: "Connected to Sheet: " + SPREADSHEET_ID });
  } catch (err) {
    return jsonOut({ ok: false, error: "Request Error: " + String(err) });
  }
}

function handleSubmit(params) {
  const email = String(params.email || "").trim().toLowerCase();
  const deliveryId = String(params.delivery_id || "").trim();
  const policy = String(params.policy || "").trim();

  if (!email || !deliveryId || !policy) {
    return jsonOut({ ok: false, error: "Missing email, delivery_id, or policy" });
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
  
  if (!sheet) return jsonOut({ ok: false, error: "Sheet not found" });

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return jsonOut({ ok: false, error: "Sheet is empty" });

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h || "").trim());
  
  const idxId = headers.indexOf("delivery_id");
  const idxPolicy = headers.indexOf("policy");
  const idxEmail = headers.indexOf("Work Email");

  if (idxId === -1 || idxPolicy === -1 || idxEmail === -1) {
    return jsonOut({ ok: false, error: "Columns not found. Found: " + headers.join(", ") });
  }

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxId]).trim() === deliveryId) {
      // SAFETY CHECK: If someone already filled this, don't overwrite
      const currentPolicy = String(data[i][idxPolicy] || "").trim();
      if (currentPolicy.length > 0) {
        return jsonOut({ ok: false, error: "This delivery was just classified by another user." });
      }
      
      sheet.getRange(i + 1, idxPolicy + 1).setValue(policy);
      sheet.getRange(i + 1, idxEmail + 1).setValue(email);
      return jsonOut({ ok: true, row: i + 1 });
    }
  }

  return jsonOut({ ok: false, error: "Delivery ID not found in sheet: " + deliveryId });
}

function handleGetConfig(params) {
  return jsonOut({ ok: true, quota: 2500 });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
