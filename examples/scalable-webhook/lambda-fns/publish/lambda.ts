import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { APIGatewayProxyHandler } from 'aws-lambda';
const client = new SQSClient();

export const handler: APIGatewayProxyHandler = async function (event: any) {
    console.log('request:', JSON.stringify(event, undefined, 2));

    const cmd = new SendMessageCommand({
        DelaySeconds: 10,
        MessageAttributes: {
            MessageDeduplicationId: {
                DataType: 'String',
                StringValue: event.path + new Date().getTime(),
            },
        },
        MessageBody: 'hello from ' + event.path,
        QueueUrl: process.env.queueURL,
    });

    try {
        const data = await client.send(cmd);
        console.log('Success', data.MessageId);
        return sendRes(200, 'You have added a message to the queue! Message ID is ' + data.MessageId);
    } catch (e) {
        console.log('Error', e);
        return sendRes(500, e);
    }
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

