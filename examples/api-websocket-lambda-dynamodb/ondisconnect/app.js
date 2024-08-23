// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

// https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-route-keys-connect-disconnect.html
// The $disconnect route is executed after the connection is closed.
// The connection can be closed by the server or by the client. As the connection is already closed when it is executed, 
// $disconnect is a best-effort event. 
// API Gateway will try its best to deliver the $disconnect event to your integration, but it cannot guarantee delivery.

const { DeleteCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

exports.handler = async event => {
  console.log(`event: ${JSON.stringify(event)}`);
  const command = new DeleteCommand({
    TableName: process.env.TABLE_NAME,
    Key: {
      connectionId: event.requestContext.connectionId
    }
  });

  try {
    await ddb.send(command);
  } catch (err) {
    return { statusCode: 500, body: 'Failed to disconnect: ' + JSON.stringify(err) };
  }

  console.log("Successfully disconnected");
  return { statusCode: 200, body: 'Disconnected.' };
};
