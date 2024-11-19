import * as intrinsics from '../../src/converters/intrinsics';

describe('Fn::If', () => {
    test('picks true', async () => {
        const tc = new TestContext({conditions: {'MyCondition': true}});
        const result = runIntrinsic(intrinsics.fnIf, tc, ['MyCondition', 'yes', 'no']);
        expect(result).toEqual(ok('yes'));
    });

    test('picks false', async () => {
        const tc = new TestContext({conditions: {'MyCondition': false}});
        const result = runIntrinsic(intrinsics.fnIf, tc, ['MyCondition', 'yes', 'no']);
        expect(result).toEqual(ok('no'));
    });

    test('errors if condition is not found', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnIf, tc, ['MyCondition', 'yes', 'no']);
        expect(result).toEqual(failed(`No condition 'MyCondition' found`));
    });

    test('errors if condition evaluates to a non-boolean', async () => {
        const tc = new TestContext({conditions: {'MyCondition': 'OOPS'}});
        const result = runIntrinsic(intrinsics.fnIf, tc, ['MyCondition', 'yes', 'no']);
        expect(result).toEqual(failed(`Expected a boolean, got string`));
    });
});

describe('Fn::Or', () => {
    test('picks true', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnOr, tc, [true, false, true]);
        expect(result).toEqual(ok(true));
    });

    test('picks false', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnOr, tc, [false, false, false]);
        expect(result).toEqual(ok(false));
    });

    test('picks true from inner Condition', async () => {
        const tc = new TestContext({conditions: {'MyCondition': true}});
        const result = runIntrinsic(intrinsics.fnOr, tc, [false, {'Condition': 'MyCondition'}]);
        expect(result).toEqual(ok(true));
    });

    test('picks false with inner Condition', async () => {
        const tc = new TestContext({conditions: {'MyCondition': false}});
        const result = runIntrinsic(intrinsics.fnOr, tc, [false, {'Condition': 'MyCondition'}]);
        expect(result).toEqual(ok(false));
    });

    test('has to have at least two arguments', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnOr, tc, [false]);
        expect(result).toEqual(failed(`Fn::Or expects at least 2 params, got 1`));
    });

    test('short-cirtcuits evaluation if true is found', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnOr, tc, [true, {'Condition': 'DoesNotExist'}]);
        expect(result).toEqual(ok(true));
    });
})

describe('Fn::And', () => {
    test('picks true', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [true, true, true]);
        expect(result).toEqual(ok(true));
    });

    test('picks false', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [true, false, true]);
        expect(result).toEqual(ok(false));
    });

    test('picks true from inner Condition', async () => {
        const tc = new TestContext({conditions: {'MyCondition': true}});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [true, {'Condition': 'MyCondition'}]);
        expect(result).toEqual(ok(true));
    });

    test('picks false with inner Condition', async () => {
        const tc = new TestContext({conditions: {'MyCondition': false}});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [true, {'Condition': 'MyCondition'}]);
        expect(result).toEqual(ok(false));
    });

    test('has to have at least two arguments', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [false]);
        expect(result).toEqual(failed(`Fn::And expects at least 2 params, got 1`));
    });

    test('short-cirtcuits evaluation if false is found', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [false, {'Condition': 'DoesNotExist'}]);
        expect(result).toEqual(ok(false));
    });
})


describe('Fn::Not', () => {
    test('inverts false', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnNot, tc, [true]);
        expect(result).toEqual(ok(false));
    });

    test('inverts true', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnNot, tc, [false]);
        expect(result).toEqual(ok(true));
    });

    test('inverts a false Condition', async () => {
        const tc = new TestContext({conditions: {'MyCondition': false}});
        const result = runIntrinsic(intrinsics.fnNot, tc, [{'Condition': 'MyCondition'}]);
        expect(result).toEqual(ok(true));
    });

    test('inverts a true Condition', async () => {
        const tc = new TestContext({conditions: {'MyCondition': true}});
        const result = runIntrinsic(intrinsics.fnNot, tc, [{'Condition': 'MyCondition'}]);
        expect(result).toEqual(ok(false));
    });

    test('requires a boolean', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnNot, tc, ['ok']);
        expect(result).toEqual(failed(`Expected a boolean, got string`));
    });
})

describe('Fn::Equals', () => {
    test('detects equal strings', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnEquals, tc, ['a', 'a']);
        expect(result).toEqual(ok(true));
    });

    test('detects unequal strings', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnEquals, tc, ['a', 'b']);
        expect(result).toEqual(ok(false));
    });

    test('detects equal objects', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnEquals, tc, [{x: 'a'}, {'x': 'a'}]);
        expect(result).toEqual(ok(true));
    });

    test('detects unequal objects', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnEquals, tc, [{x: 'a'}, {'x': 'b'}]);
        expect(result).toEqual(ok(false));
    });

    test('insists on two arguments', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnEquals, tc, [1]);
        expect(result).toEqual(failed(`Fn::Equals expects exactly 2 params, got 1`));
    });
})

function runIntrinsic(fn: intrinsics.Intrinsic, tc: TestContext, args: intrinsics.Expression[]): TestResult<any> {
    const result: TestResult<any> = <any>(fn.evaluate(tc, args));
    return result;
};

type TestResult<T> =
    | {'ok': true, value: T}
    | {'ok': false, errorMessage: string};

function ok<T>(result: T): TestResult<T> {
    return {'ok': true, value: result};
}

function failed<T>(errorMessage: string): TestResult<T> {
    return {'ok': false, errorMessage: errorMessage};
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
        const result: TestResult<any> = {'ok': true, value: expression};
        return result;
    }

    apply<T, U>(result: intrinsics.Result<T>, fn: (x: T) => intrinsics.Result<U>): intrinsics.Result<U> {
        const t: TestResult<T> = <any>result; // assume result is a TestResult
        if (t.ok) {
            return fn(t.value);
        } else {
            return {'ok': false, errorMessage: t.errorMessage};
        }
    }

    fail(msg: string): intrinsics.Result<any> {
        const result: TestResult<any> = {'ok': false, errorMessage: msg};
        return result;
    }

    succeed<T>(r: T): intrinsics.Result<T> {
        const result: TestResult<any> = {'ok': true, value: r};
        return result;
    }
}
