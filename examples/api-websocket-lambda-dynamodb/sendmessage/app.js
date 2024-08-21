// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const { DeleteCommand, DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
let apigwManagementApi;

const { TABLE_NAME } = process.env;

exports.handler = async event => {
  console.log(`event: ${JSON.stringify(event)}`);
  let connectionData;
  const command = new ScanCommand({
    TableName: TABLE_NAME,
    ProjectionExpression: 'connectionId',
  });
  
  try {
    connectionData = await ddb.send(command);
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }
  
  const endpoint = event.requestContext.domainName + '/' + event.requestContext.stage;
  if (!apigwManagementApi || apigwManagementApi?.config.endpoint !== endpoint) {
    apigwManagementApi = new ApiGatewayManagementApiClient({
      apiVersion: '2018-11-29',
      endpoint,
    });
  }
  
  const postData = JSON.parse(event.body).data;
  
  const postCalls = connectionData.Items.map(async ({ connectionId }) => {
    console.log(`Found connection ${connectionId}`);
    try {
      await apigwManagementApi.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: postData }));
    } catch (e) {
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${connectionId}`);
        await ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { connectionId } }));
      } else {
        throw e;
      }
    }
  });
  
  try {
    await Promise.all(postCalls);
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }

  console.log("Successfully sent message");
  return { statusCode: 200, body: 'Data sent.' };
};
