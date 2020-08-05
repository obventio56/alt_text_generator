'use strict';

async function generate_alt_text() {

  const fs = require('fs');
  const request = require('request');
  const readline = require('readline');
  const {google} = require('googleapis');
  const vision = require('@google-cloud/vision');
  const { GoogleAuth } = require('google-auth-library');
  const sheets = google.sheets('v4');
  const spreadsheetId = "1ILUI2XVJImaERK-RFtOZg0RDVpq1lLhG72rQA79nX8E";

  const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

  function download(url, localPath, callback) {
        const options = {
            url: url,
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.1 Safari/605.1.15' }
        };
        request(options).pipe(fs.createWriteStream(localPath)).on('close', callback);
  }

  async function getAuthToken() {
    const auth = new GoogleAuth({
      scopes: SCOPES
    });
    const authToken = await auth.getClient();
    return authToken;
  };
  
  async function getSpreadSheetValues({spreadsheetId, auth, sheetName}) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      auth,
      range: sheetName
    });
    return res;
  };

  async function writeSpreadSheetValues({spreadsheetId, auth, writeRange, resource}) {
    const res = await sheets.spreadsheets.values.update({
      spreadsheetId,
      auth,
      range: writeRange,
      resource,
      valueInputOption: 'RAW'
    });
    return res;
  };

  const sheetName = "Sheet1!B:B";

  const auth = await getAuthToken();
  const response = await getSpreadSheetValues({ spreadsheetId, auth, sheetName});
  const url_values = response.data.values.slice(1, response.data.values.length);
  console.log(url_values)
  url_values.forEach(async function(el, index) {
    
    download(el[0], 'tempimage' + index, async function() {
        console.log(index)
        console.log(el[0])
        const client = new vision.ImageAnnotatorClient();

        // Performs label detection on the image file
        const [result] = await client.labelDetection('tempimage' + index);
        const labels = result.labelAnnotations;
        var good_labels = []
        for (var i = 0; i < labels.length; i++) {
            if (labels[i].score > 0.85) {
                good_labels.push(labels[i].description);
            }
        }
        var alt_text = good_labels.join(", ");
        const writeRange = "Sheet1!C" + (index + 2) + ":C" + (index + 2);
        const values = [[alt_text]];
        const resource = {
            values
        };
        console.log(resource)
        console.log(writeRange)
        await writeSpreadSheetValues({ spreadsheetId, auth, writeRange, resource});
    }); 
});


}


generate_alt_text().catch(console.error);
