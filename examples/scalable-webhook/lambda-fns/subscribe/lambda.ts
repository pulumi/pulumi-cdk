import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { SQSHandler } from 'aws-lambda';
const client = new DynamoDBClient();

export const handler: SQSHandler = async function (event) {
    console.log('request:', JSON.stringify(event, undefined, 2));

    const records = event.Records;

    for (const index in records) {
        const payload = records[index].body;
        const id = records[index].messageAttributes.MessageDeduplicationId.stringValue;
        console.log('received message ' + payload);

        const cmd = new PutItemCommand({
            TableName: process.env.tableName,
            Item: {
                id: { S: id! },
                message: { S: payload },
            },
        });

        try {
            const data = await client.send(cmd);
            console.log('Success', data);
        } catch (e) {
            console.log('Error', e);
        }
    }
};
