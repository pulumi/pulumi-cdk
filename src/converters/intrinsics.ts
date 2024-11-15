// Copyright 2016-2024, Pulumi Corporation.
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

/**
 * Models a CF Intrinsic Function.
 *
 * CloudFormation (CF) intrinsic functions need to be implemented for @pulumi/pulumi-cdk since CDK may emit them in the
 * synthesized CF template.
 *
 * See https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference.html
 *
 * @internal
 */
export interface Intrinsic {
    name: string;
    evaluate(ctx: IntrinsicContext, params: Expression[]): Result<any>;
}

/**
 * Models a CF expression. Currently this is just 'any' but eventually adding more structure and a separate
 * parse/evaluate steps can help keeping the error messages tractable.
 *
 * See also CfnParse for inspiration:
 *
 * https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/core/lib/helpers-internal/cfn-parse.ts#L347
 *
 * @internal
 */
export interface Expression {}

/**
 * Production code may have intermediate values occasionally wrapped in pulumi.Output<T>; this is currently somewhat
 * difficult to test, so the essentials of pulumi.Output<T> are abstracted into a Result<T>.
 *
 * @internal
 */
export interface Result<T> {}

/**
 * Context available when evaluating CF expressions.
 *
 * @internal
 */
export interface IntrinsicContext {
    findCondition(conditionName: string): Expression|undefined;
    evaluate(expression: Expression): Result<any>;
    apply<T,U>(result: Result<T>, fn: (value: U) => Result<U>): Result<U>;
    fail(msg: string): Result<any>;
    succeed<T>(r: T): Result<T>;
}

/**
 * "Fn::If": [condition_name, value_if_true, value_if_false]
 *
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-conditions.html#intrinsic-function-reference-conditions-i
 *
 * @internal
 */
export const fnIf: Intrinsic = {
    name: 'Fn::If',
    evaluate: (ctx: IntrinsicContext, params: Expression[]): Result<any> => {
        if (params.length !== 3) {
            return ctx.fail(`Expected 3 parameters, got ${ params.length }`);
        }

        if (typeof params[0] !== 'string') {
            return ctx.fail('Expected the first parameter to be a condition name string literal');
        }

        const conditionName: string = params[0];
        const exprIfTrue = params[1];
        const exprIfFalse = params[2];

        return ctx.apply(evaluateCondition(ctx, conditionName), ok => {
            if (ok) {
                return ctx.evaluate(exprIfTrue);
            } else {
                return ctx.evaluate(exprIfFalse);
            }
        });
    }
}

/**
 *
 * From the docs: the minimum number of conditions that you can include is 2, and the maximum is 10.
 *
 * Example invocation:
 *
 *   "MyOrCondition": {
 *     "Fn::Or" : [
 *       {"Fn::Equals" : ["sg-mysggroup", {"Ref" : "ASecurityGroup"}]},
 *       {"Condition" : "SomeOtherCondition"}
 *     ]
 *   }
 *
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-conditions.html#intrinsic-function-reference-conditions-or
 */
export const fnOr: Intrinsic = {
    name: 'Fn::Or',
    evaluate: (ctx: IntrinsicContext, params: Expression[]): Result<any> => {
        if (params.length < 2) {
            return ctx.fail(`Fn::Or expects at least 2 params, got ${params.length}`)
        }
        const reducer = (acc: Result<boolean>, expr: Expression) => ctx.apply(acc, ok => {
            if (ok) {
                return ctx.succeed(true);
            } else {
                return evaluateConditionOrExpression(ctx, expr);
            }
        })
        return params.reduce(reducer, ctx.succeed(true));
    }
}

/**
 * Recognize forms such as {"Condition" : "SomeOtherCondition"}. If recognized, returns the conditionName.
 */
function parseConditionExpr(raw: Expression): string|undefined {
    if (typeof raw !== 'object' || !raw.hasOwnProperty('Condition')) {
        return undefined;
    }
    const cond = (<any>raw)['Condition'];
    if (typeof cond !== 'string') {
        return undefined;
    }
    return cond;
}

/**
 * Like `ctx.evaluate` but also recognizes Condition sub-expressions as required by `Fn::Or`.
 */
function evaluateConditionOrExpression(ctx: IntrinsicContext, expr: Expression): Result<boolean> {
    const firstExprConditonName = parseConditionExpr(expr);
    if (firstExprConditonName !== undefined) {
        return evaluateCondition(ctx, firstExprConditonName)
    } else {
        return ctx.apply(ctx.evaluate(expr), r => mustBeBoolean(ctx, r));
    }
}

function mustBeBoolean(ctx: IntrinsicContext, r: any): Result<boolean> {
    if (typeof r === "boolean") {
        return ctx.succeed(r);
    } else {
        return ctx.fail(`Expected a boolean, got ${typeof r}`);
    }
}

function evaluateCondition(ctx: IntrinsicContext, conditionName: string): Result<boolean> {
    const conditionExpr = ctx.findCondition(conditionName);
    if (conditionExpr === undefined) {
        return ctx.fail(`No condition '${conditionName}' found`);
    }
    return ctx.apply(ctx.evaluate(conditionExpr), r => mustBeBoolean(ctx, r));
}
