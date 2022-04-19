import * as pulumi from "@pulumi/pulumi";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Stack } from "../src/interop-aspect";
import { Construct } from "constructs";
import { expect } from "chai";
import * as mocks from "./mocks";
import * as output from "../src/output";

mocks.setMocks();

function testStack(fn: (scope: Construct) => void, done: any) {
    class TestStack extends Stack {
        constructor(scope: Construct, id: string) {
            super(scope, id);

            fn(this);
        }
    }

    const s = Stack.create('teststack', TestStack);
    s.urn.apply(() => done());
}

describe('Basic tests', () => {
    it('Checking single resource registration', done => {
        testStack(adapter => {
            new s3.Bucket(adapter, 'MyFirstBucket', { versioned: true });
        }, done)
    });

    it('Supports Output<T>', done => {
        const o = pulumi.output("the-bucket-name");
        testStack(adapter => {
            new s3.Bucket(adapter, 'MyFirstBucket', { bucketName: output.asString(o) });
        }, done);
    });
});
