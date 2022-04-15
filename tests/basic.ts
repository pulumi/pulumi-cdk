import * as pulumi from "@pulumi/pulumi";
import * as s3 from "aws-cdk-lib/aws-s3";
import { CdkStackComponent, AwsPulumiAdapter } from "../src/interop-aspect";
import { Construct } from "constructs";
import { expect } from "chai";
import * as mocks from "./mocks";
import * as output from "../src/output";

mocks.setMocks();

function testStack(fn: (adapter: AwsPulumiAdapter) => void, done: any) {
    const s = new CdkStackComponent("teststack", (scope: Construct, parent: CdkStackComponent) => {
        const adapter = new AwsPulumiAdapter(scope, "adapter", parent);
        fn(adapter);
        return adapter;
    });
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
