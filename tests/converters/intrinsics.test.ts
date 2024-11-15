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
        expect(result).toEqual(failed(`Expected condition 'MyCondition' to evaluate to a boolean, got string`));
    });
});


function runIntrinsic(fn: intrinsics.Intrinsic, tc: TestContext, args: intrinsics.Expression[]): TestResult<any> {
    const result: TestResult<any> = <any>(intrinsics.fnIf.evaluate(tc, args));
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
