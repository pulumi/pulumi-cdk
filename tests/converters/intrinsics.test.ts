import * as intrinsics from '../../src/converters/intrinsics';

describe('Fn::If', () => {
    test('picks true', async () => {
        const tc = new TestContext({conditions: {'MyCondition': true}});
        const result = intrinsics.fnIf.evaluate(tc, ['MyCondition', 'yes', 'no']);
        expect(result).toEqual(new TestSuccessResult<any>('yes'));
    });

    test('picks false', async () => {
        const tc = new TestContext({conditions: {'MyCondition': false}});
        const result = intrinsics.fnIf.evaluate(tc, ['MyCondition', 'yes', 'no']);
        expect(result).toEqual(new TestSuccessResult<any>('no'));
    });

    test('errors if condition is not found', async () => {
        const tc = new TestContext({});
        const result = intrinsics.fnIf.evaluate(tc, ['MyCondition', 'yes', 'no']);
        expect(result).toEqual(new TestFailureResult<any>(`No condition "MyCondition" found`));
    });

    test('errors if condition evaluates to a non-boolean', async () => {
        const tc = new TestContext({conditions: {'MyCondition': 'OOPS'}});
        const result = intrinsics.fnIf.evaluate(tc, ['MyCondition', 'yes', 'no']);
        expect(result).toEqual(new TestFailureResult<any>(`Expected condition \"MyCondition\" to evaluate to a boolean, got string`));
    });
});

class TestSuccessResult<T> implements intrinsics.Result<T> {
    state: 'success';
    value: T;

    constructor(value: T) {
        this.state = 'success';
        this.value = value;
    }

    apply<R>(f: (x: T) => intrinsics.Result<R>): intrinsics.Result<R> {
        return f(this.value);
    }
};

class TestFailureResult<T> implements intrinsics.Result<T> {
    state: 'failure';
    message: string;

    constructor(message: string) {
        this.state = 'failure';
        this.message = message;
    }

    apply<R>(_: (x: T) => intrinsics.Result<R>): intrinsics.Result<R> {
        return new TestFailureResult<R>(this.message);
    }
}

class TestContext implements intrinsics.IntrinsicContext {
    conditions: { [id: string]: intrinsics.Expression };

    constructor(args: {conditions?: { [id: string]: intrinsics.Expression }}) {
        if (args.conditions) {
            this.conditions = args.conditions;
        } else {
            this.conditions = {};
        }
    }

    findCondition(conditionName: string): intrinsics.Expression|undefined {
        if (this.conditions.hasOwnProperty(conditionName)) {
            return this.conditions[conditionName];
        }
    }

    evaluate(expression: intrinsics.Expression): intrinsics.Result<any> {
        // Self-evaluate the expression. This is very incomplete.
        return new TestSuccessResult<any>(expression);
    }

    fail(msg: string): intrinsics.Result<any> {
        return new TestFailureResult<any>(msg);
    }

    succeed<T>(r: T): intrinsics.Result<T> {
        return new TestSuccessResult<T>(r);
    }
}
