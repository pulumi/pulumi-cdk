// Copyright 2016-2022, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as pulumi from '@pulumi/pulumi';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { App, Stack } from '../src/stack';
import * as output from '../src/output';
import { promiseOf, setMocks } from './mocks';

describe('Basic tests', () => {
    beforeAll(() => {
        setMocks(() => {});
    });
    test('Checking single resource registration', async () => {
        const app = new App('testapp', (scope: App) => {
            const s = new Stack(scope, 'teststack');
            new s3.Bucket(s, 'MyFirstBucket', { versioned: true });
        });
        const outputs = await app.outputs;
        expect(outputs).toEqual({});
        const urn = await promiseOf(app.urn);
        expect(urn).toEqual('urn:pulumi:stack::project::cdk:index:App::testapp');
    });

    test('Supports Output<T>', async () => {
        const o = pulumi.output('the-bucket-name');
        const app = new App('testapp', (scope: App) => {
            const s = new Stack(scope, 'teststack');
            new s3.Bucket(s, 'MyFirstBucket', { bucketName: output.asString(o) });
        });
        const outputs = await app.outputs;
        expect(outputs).toEqual({});
        const urn = await promiseOf(app.urn);
        expect(urn).toEqual('urn:pulumi:stack::project::cdk:index:App::testapp');
    });
});
