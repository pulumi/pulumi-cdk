/*
  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
  Permission is hereby granted, free of charge, to any person obtaining a copy of this
  software and associated documentation files (the "Software"), to deal in the Software
  without restriction, including without limitation the rights to use, copy, modify,
  merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
  permit persons to whom the Software is furnished to do so.
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
  INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
  PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
  HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
  OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { params } from './events';
import { APIGatewayProxyHandler } from '@types/aws-lambda';
const client = new EventBridgeClient();

export const handler: APIGatewayProxyHandler = async function (event, context) {
    // Do some work...
    // And now create the event...

    console.log('--- Params ---');
    console.log(params);
    const result = await client.send(new PutEventsCommand(params));

    console.log('--- Response ---');
    console.log(result);

    return sendRes(200, 'You have sent the events to EventBridge!');
};

const sendRes = (status: number, body: string) => {
    const response = {
        statusCode: status,
        headers: {
            'Content-Type': 'text/html',
        },
        body: body,
    };
    return response;
};
