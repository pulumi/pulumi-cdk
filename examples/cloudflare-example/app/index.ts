import express, { Request, Response } from 'express';
const app = express();

app.get('/', async (_req: Request, res: Response) => {
    res.status(200).send('Hello, world!');
});

app.get('/health', (_req: Request, res: Response) => {
    res.status(200).send(JSON.stringify({ message: 'OK' }));
});

app.listen(80, () => {
    console.log('Listening on port 8080');
});
