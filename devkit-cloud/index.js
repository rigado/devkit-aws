'use strict';

const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const https = require('https');
const templateURL = "https://rigado-devkit-dashboard.s3.amazonaws.com/rigado.json";
const rigadoDashboardBucket = "rigado-devkit-dashboard";
const s3 = new AWS.S3();

const tableName = process.env.TABLE_NAME;

const scanParams = {
    TableName: tableName,
    Limit: 100
};

const createResponse = (statusCode, body) => {

    return {
        statusCode: statusCode,
        body: body
    }
};

exports.get = (event, context, callback) => {

    let dbGet = (scanParams) => { return dynamo.scan(scanParams).promise() };

    dbGet(scanParams).then( (data) => {
        let returnData = {};
        data["Items"].map( (item) => {
            returnData[item.id] = item.data;
        })
        callback(null, createResponse(200, JSON.stringify(returnData)));
    }).catch( (err) => {
        console.log(`SCAN FAILED FOR params = ${JSON.stringify(scanParams)}, WITH ERROR: ${err}`);
        callback(null, createResponse(500, err));
    });
};

exports.post = (event, context, callback) => {

    let payload = JSON.parse(event.body);

    let item = {
        id: payload["peripheralUuid"],
        data: {
            datapoint: payload["data"]["accel"][0], //Pick the first data point from the accelerameter
            timestamp: Date.now()
        }
    };

    let params = {
        TableName: process.env.TABLE_NAME,
        Item: item
    };

    let dbPut = (params) => { return dynamo.put(params).promise() };

    dbPut(params).then( (data) => {
        callback(null, createResponse(200, JSON.stringify(item)));
    }).catch( (err) => {
        console.log(`PUT ITEM FAILED FOR doc = ${item.doc}, WITH ERROR: ${err}`);
        callback(null, createResponse(500, JSON.stringify(err)));
    });
};

exports.populator = (event, context, callback) => {
    let destinationBucket = process.env.BUCKET_NAME;
    let sourceBucket = "rigado-devkit-dashboard";
    var s3 = new AWS.S3();
    var params = {
        Bucket: destinationBucket,
        Key: "index.html"
    }
    s3.headObject(params, function(err, data) {
        if (err) {
            console.log("index.html not found on bucket. Copying from Rigado's source...")
            if (!copyBucket(destinationBucket)) {
                callback("Problem copying bucket", null);
                return;
            }
        }
        generateDashboardJSON();
        callback(null, true);
    });
};

const widgetTemplate = {
    "type": "highcharts-timeseries",
    "settings": {
            "timeframe": 60,
            "blocks": 4,
            "chartType": "area",
            "xaxis": "{\"title\":{\"text\" : \"Time\"}, \"type\": \"datetime\", \"floor\":0}",
            "yaxis": "{\"title\":{\"text\" : \"Accelerometer\"}, \"minorTickInterval\":\"auto\", \"floor\":0}",
            "series1": "",
            "series1label": ""
    }
};

function generateDashboardJSON() {
    console.log("Getting " + templateURL);
    https.get(templateURL, (resp) => {
        let httpBody = '';
        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            httpBody += chunk;
        });
        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            let dashboardConfig = JSON.parse(httpBody);
            dashboardConfig.panes[0].widgets = [];
            let dbGet = (scanParams) => { return dynamo.scan(scanParams).promise() };
            dbGet(scanParams).then( (data) => {
                data["Items"].map( (item) => {
                    console.log("Processing " + JSON.stringify(item));
                    var deviceWidget = JSON.parse(JSON.stringify(widgetTemplate));
                    deviceWidget.settings.series1 = `datasources["AWS"]["${item.id}"]["datapoint"]`;
                    deviceWidget.settings.series1label = item.id;
                    dashboardConfig.panes[0].widgets.push(deviceWidget);
                });
                dashboardConfig.datasources[0].settings.url = process.env.API_ENDPOINT;
                var params = {
                    Bucket: process.env.BUCKET_NAME,
                    Key: 'rigado.json',
                    ContentType: "application/json",
                    Body: JSON.stringify(dashboardConfig, null, '  '),
                    ACL: "public-read"
                };
                s3.putObject(params, (err, data) => {
                    if (err) {
                        console.log("Error trying to putObject with params " + JSON.stringify(params));
                        console.log(err, err.stack);
                    }
                    else {
                        console.log("Done generated new dashboard template")
                        return true;
                    }
                });
            }).catch( (err) => {
                console.log(`SCAN FAILED FOR params = ${JSON.stringify(scanParams)}, WITH ERROR: ${err}`);
                return false;
            });
        });
    });
}

function copyBucket(bucketName) {
    var params = {
        Bucket: rigadoDashboardBucket,
        MaxKeys: 50
    };
    s3.listObjectsV2(params, (err, data) => {
        if (err) {
            console.log(err, err.stack);
        }
        else {
            data.Contents.map( (s3obj) => {
                let copyParams = {
                    Bucket: bucketName,
                    CopySource: `/${rigadoDashboardBucket}/${s3obj.Key}`,
                    Key: s3obj.Key,
                    ACL: "public-read"
                };
                s3.copyObject(copyParams, (err, data) => {
                    if (err) {
                        console.log("Error trying to copy object with params " + JSON.stringify(copyParams));
                        console.log(err, err.stack);
                    }
                    else {
                        console.log(`Succesfully copied ${s3obj.Key}`);
                    }

                });
            });
        }
    });
    return;
}
