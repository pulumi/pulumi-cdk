import { Stack } from "../src";
import { expect } from "chai";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cdk from "aws-cdk-lib";

class TestStack extends Stack {
    public readonly bucket: s3.IBucket;
    constructor(fn: (scope: TestStack) => void, strict: boolean = false) {
        super('TestStack');
        this.bucket = new s3.Bucket(this, 'MyFirstBucket');

        fn(this);

        this.synth(strict);
    }
}

// Suppress console logging from CDK while running tests
before(() => {
    const cdk_logging = require("aws-cdk/lib/logging");

    cdk_logging["warning"] = () => {};
    cdk_logging["error"] = () => {};
});

describe('CDK stack metadata tests', () => {

    it('Throws when stack metadata contains errors', done => {
        expect(() => new TestStack((stack) => {
                cdk.Annotations.of(stack.bucket).addError("Test error");
            }),
        ).to.throw();
        done();
    });

    it("Doesn't throw when stack metadata contains warnings and strict mode is false", done => {
        new TestStack((stack) => {
            cdk.Annotations.of(stack.bucket).addWarningV2("TEST", "Test warning");
        });
        done();
    });

    it('Throws when stack metadata contains warnings and strict mode is true', done => {
        expect(() => new TestStack((stack) => {
                cdk.Annotations.of(stack.bucket).addWarningV2("TEST", "Test warning");
            }, true),
        ).to.throw();
        done();
    });
});
