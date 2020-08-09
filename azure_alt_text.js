'use strict';

const async = require('async');
const fs = require('fs');
const path = require("path");
const request = require('request');
const createReadStream = require('fs').createReadStream
const sleep = require('util').promisify(setTimeout);
const ComputerVisionClient = require('@azure/cognitiveservices-computervision').ComputerVisionClient;
const ApiKeyCredentials = require('@azure/ms-rest-js').ApiKeyCredentials;
const {google} = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const sheets = google.sheets('v4');
const spreadsheetId = "1ILUI2XVJImaERK-RFtOZg0RDVpq1lLhG72rQA79nX8E";
const sheetName = "Sheet1!B:B";

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function getAuthToken() {
    const auth = new GoogleAuth({
      scopes: SCOPES
    });
    const authToken = await auth.getClient();
    return authToken;
  };

function download(url, localPath, callback) {
    const options = {
        url: url,
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.1 Safari/605.1.15' }
    };
    request(options).pipe(fs.createWriteStream(localPath)).on('close', callback);
}
  
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


function computerVision() {
    async.series([
      async function () {
        let key = process.env['COMPUTER_VISION_SUBSCRIPTION_KEY'];
        let endpoint = process.env['COMPUTER_VISION_ENDPOINT']
        if (!key) { throw new Error('Set your environment variables for your subscription key and endpoint.'); }
        let computerVisionClient = new ComputerVisionClient(
            new ApiKeyCredentials({inHeader: {'Ocp-Apim-Subscription-Key': key}}), endpoint);

        const auth = await getAuthToken();
        const response = await getSpreadSheetValues({ spreadsheetId, auth, sheetName});
        const url_values = response.data.values.slice(1, response.data.values.length);
        console.log(url_values)

        url_values.forEach(async function(describeURL, index) {
            download(describeURL[0], 'tempimage' + index, async function() {
                console.log(describeURL);
                var bitmap = fs.readFileSync('tempimage' + index);

                const options = {
                    url: endpoint + "vision/v3.0/analyze",
                    body: bitmap,
                    method: 'POST',
                    headers: {'Ocp-Apim-Subscription-Key': key,
                    'Content-Type': 'application/octet-stream'},
                    qs: {'visualFeatures': 'Categories,Description,Tags,Color'}
                };

                var response = request.post(options, function(err, httpResponse, body) {
                    body = JSON.parse(body);
                    console.log(body.description.captions);
                    var good_labels = []
                    for (var i = 0; i < body["tags"].length; i++) {
                        if (body["tags"][i].confidence > 0.85) {
                            good_labels.push(body["tags"][i].name);
                        }
                    }
    
                    var key_words = good_labels.join(", ");
                    var caption = body.description.captions[0].text;

                    const writeRange = "Sheet1!C" + (index + 2) + ":D" + (index + 2);
                    const values = [[caption, key_words]];
                    const resource = {
                        values
                    };
                    console.log(resource)
                    console.log(writeRange)
                    writeSpreadSheetValues({ spreadsheetId, auth, writeRange, resource});
                });
                
            });  
        });


    },
    function () {
      return new Promise((resolve) => {
        resolve();
      })
    }
  ], (err) => {
    throw (err);
  });
}

computerVision();