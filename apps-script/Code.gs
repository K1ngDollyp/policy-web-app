/**
 * UPDATED FLEXIBLE SCRIPT
 */
const SHEET_ID = '1pV5sz5PJTTaGvXbUNAVqwWB_-eAC2B5bTe1XEo5tgT4';

function doGet(e) {
  try {
    const params = e.parameter;
    const action = params.action;

    if (action === 'submit') {
      return handleSubmit(params);
    } else if (action === 'get_config') {
      return handleGetConfig(params);
    }
    return jsonOut({ ok: false, error: 'Invalid action' });
  } catch (err) {
    return jsonOut({ ok: false, error: 'Script Error: ' + err.message });
  }
}

function doPost(e) {
  return doGet(e);
}

function handleSubmit(params) {
  const { email, delivery_id: deliveryId, policy } = params;
  if (!email || !deliveryId || !policy) {
    return jsonOut({ ok: false, error: 'Missing parameters' });
  }

  const ss = SpreadsheetApp.openById(SHEET_ID);
  // FLEXIBLE: Use the first sheet in the spreadsheet
  const sheet = ss.getSheets()[0]; 
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const idxId = headers.indexOf('delivery_id');
  const idxPolicy = headers.indexOf('policy');
  const idxEmail = headers.indexOf('Work Email');

  if (idxId === -1) return jsonOut({ ok: false, error: 'Column "delivery_id" not found' });

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxId]).trim() === deliveryId) {
      // Check if already filled
      if (idxPolicy !== -1) {
        const currentPolicy = String(data[i][idxPolicy] || "").trim();
        if (currentPolicy.length > 0) {
          return jsonOut({ ok: false, error: 'Already classified.' });
        }
      }
      
      if (idxPolicy !== -1) sheet.getRange(i + 1, idxPolicy + 1).setValue(policy);
      if (idxEmail !== -1) sheet.getRange(i + 1, idxEmail + 1).setValue(email);
      return jsonOut({ ok: true, row: i + 1 });
    }
  }

  return jsonOut({ ok: false, error: 'Delivery ID not found.' });
}

function handleGetConfig(params) {
  return jsonOut({ ok: true, quota: 4000 });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
