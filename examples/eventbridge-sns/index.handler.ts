import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
let client: EventBridgeClient;

export const handler = async function (event, context) {
    if (!client) {
        client = new EventBridgeClient();
    }

    const eventBusName = process.env.BUS_NAME;
    await client.send(
        new PutEventsCommand({
            Entries: [
                {
                    // Event envelope fields
                    Source: 'custom.myATMapp',
                    EventBusName: eventBusName,
                    DetailType: 'transaction',
                    Time: new Date(),
                    // Main event body
                    Detail: JSON.stringify({
                        action: 'withdrawal',
                        location: 'MA-BOS-01',
                        amount: 300,
                        result: 'approved',
                        transactionId: '123456',
                        cardPresent: true,
                        partnerBank: 'Example Bank',
                        remainingFunds: 722.34,
                    }),
                },
                {
                    // Event envelope fields
                    Source: 'custom.myATMapp',
                    EventBusName: eventBusName,
                    DetailType: 'transaction',
                    Time: new Date(),

                    // Main event body
                    Detail: JSON.stringify({
                        action: 'withdrawal',
                        location: 'NY-NYC-002',
                        amount: 60,
                        result: 'denied',
                        transactionId: '123458',
                        cardPresent: true,
                        remainingFunds: 5.77,
                    }),
                },
            ],
        }),
    );

    return {
        statusCode: 200,
    };
};
