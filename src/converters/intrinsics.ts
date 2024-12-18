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

import * as aws from '@pulumi/aws-native';
import * as equal from 'fast-deep-equal';
import * as pulumi from '@pulumi/pulumi';
import { debug } from '@pulumi/pulumi/log';
import { CloudFormationParameterWithId } from '../cfn';
import { Mapping } from '../types';
import { PulumiResource } from '../pulumi-metadata';
import { toSdkName } from '../naming';
import { OutputRepr, isOutputReprInstance } from '../output-map';
import { StackAddress } from '../assembly';

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
    /**
     * The name of the intrinsic function such as 'Fn::If'.
     */
    name: string;

    /**
     * Executes the logic to evaluate CF expressions and compute the result.
     *
     * Most intrinsics need to use IntrinsicContext.evaluate right away to find the values of parameters before
     * processing them. Conditional intrinsics such as 'Fn::If' or 'Fn::Or' are an exception to this and need to
     * evaluate their parameters only when necessary.
     */
    evaluate(ctx: IntrinsicContext, params: Expression[], stackPath: string): Result<any>;
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
// eslint-disable-next-line
export interface Result<T> {}

/**
 * A nested stack parameter is a parameter that is defined in a nested stack and configured in the parent stack.
 *
 * @internal
 */
export interface NestedStackParameter {
    expression: Expression;
    stackPath: string;
}

/**
 * Context available when evaluating CF expressions.
 *
 * Note that `succeed`, `fail`, `apply` and `Result` expressions are abstracting the use of `pulumi.Input` to facilitate
 * testing over a simpler structure without dealing with async evaluation.
 *
 * @internal
 */
export interface IntrinsicContext {
    /**
     * Lookup a CF Condition by its logical ID.
     *
     * If the condition is found, return the CF Expression with intrinsic function calls inside.
     *
     * See https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/conditions-section-structure.html
     */
    findCondition(stackAddress: StackAddress): Expression | undefined;

    /**
     * Finds the value of a CF expression evaluating any intrinsic functions or references within.
     */
    evaluate(expression: Expression, stackPath: string): Result<any>;

    /**
     * Resolves a logical parameter ID to a parameter, or indicates that no such parameter is defined on the template.
     */
    findParameter(stackAddress: StackAddress): CloudFormationParameterWithId | undefined;

    /**
     * Resolves a logical resource ID to a Mapping.
     */
    findResourceMapping(stackAddress: StackAddress): Mapping<pulumi.Resource> | undefined;

    /**
     * Find the current value of a given Cf parameter.
     */
    evaluateParameter(param: CloudFormationParameterWithId): Result<any>;

    /**
     * Find the value of an `OutputRepr`.
     */
    resolveOutput(repr: OutputRepr): Result<any>;

    /**
     * If result succeeds, use its value to call `fn` and proceed with what it returns.
     *
     * If result fails, do not call `fn` and proceed with the error message from `result`.
     */
    apply<T, U>(result: Result<T>, fn: (value: U) => Result<U>): Result<U>;

    /**
     * Fail with a given error message.
     */
    fail(msg: string): Result<any>;

    /**
     * Succeed with a given value.
     */
    succeed<T>(r: pulumi.Input<T>): Result<T>;

    /**
     * Pulumi metadata source that may inform the intrinsic evaluation.
     */
    tryFindResource(cfnType: string): PulumiResource | undefined;

    /**
     * Gets the CDK Stack Node ID.
     */
    getStackNodeId(): Result<string>;

    /**
     * The AWS account ID.
     */
    getAccountId(): Result<string>;

    /**
     * The AWS Region.
     */
    getRegion(): Result<string>;

    /**
     * The AWS partition.
     */
    getPartition(): Result<string>;

    /**
     * The URL suffix.
     *
     * Quoting the docs: "The suffix is typically amazonaws.com, but might differ by Region".
     *
     * See https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/pseudo-parameter-reference.html#cfn-pseudo-param-urlsuffix
     */
    getURLSuffix(): Result<string>;
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
    evaluate: (ctx: IntrinsicContext, params: Expression[], stackPath: string): Result<any> => {
        if (params.length !== 3) {
            return ctx.fail(`Expected 3 parameters, got ${params.length}`);
        }

        if (typeof params[0] !== 'string') {
            return ctx.fail('Expected the first parameter to be a condition name string literal');
        }

        const conditionName: string = params[0];
        const exprIfTrue = params[1];
        const exprIfFalse = params[2];

        return ctx.apply(evaluateCondition(ctx, conditionName, stackPath), (ok) => {
            if (ok) {
                return ctx.evaluate(exprIfTrue, stackPath);
            } else {
                return ctx.evaluate(exprIfFalse, stackPath);
            }
        });
    },
};

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
    evaluate: (ctx: IntrinsicContext, params: Expression[], stackPath: string): Result<any> => {
        if (params.length < 2) {
            return ctx.fail(`Fn::Or expects at least 2 params, got ${params.length}`);
        }
        const reducer = (acc: Result<boolean>, expr: Expression) =>
            ctx.apply(acc, (ok) => {
                if (ok) {
                    return ctx.succeed(true);
                } else {
                    return evaluateConditionSubExpression(ctx, expr, stackPath);
                }
            });
        return params.reduce(reducer, ctx.succeed(false));
    },
};

/**
 *
 * From the docs: the minimum number of conditions that you can include is 2, and the maximum is 10.
 *
 * Example invocation:
 *
 *     "MyAndCondition": {
 *        "Fn::And": [
 *           {"Fn::Equals": ["sg-mysggroup", {"Ref": "ASecurityGroup"}]},
 *           {"Condition": "SomeOtherCondition"}
 *        ]
 *     }
 *
 * See https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-conditions.html#intrinsic-function-reference-conditions-and
 */
export const fnAnd: Intrinsic = {
    name: 'Fn::And',
    evaluate: (ctx: IntrinsicContext, params: Expression[], stackPath: string): Result<any> => {
        if (params.length < 2) {
            return ctx.fail(`Fn::And expects at least 2 params, got ${params.length}`);
        }
        const reducer = (acc: Result<boolean>, expr: Expression) =>
            ctx.apply(acc, (ok) => {
                if (!ok) {
                    return ctx.succeed(false);
                } else {
                    return evaluateConditionSubExpression(ctx, expr, stackPath);
                }
            });
        return params.reduce(reducer, ctx.succeed(true));
    },
};

/**
 * Boolean negation. Expects exactly one argument.
 *
 * Example invocation:
 *
 *     "MyNotCondition" : {
 *       "Fn::Not" : [{
 *          "Fn::Equals" : [
 *             {"Ref" : "EnvironmentType"},
 *             "prod"
 *          ]
 *       }]
 *     }
 */
export const fnNot: Intrinsic = {
    name: 'Fn::Not',
    evaluate: (ctx: IntrinsicContext, params: Expression[], stackPath: string): Result<any> => {
        if (params.length != 1) {
            return ctx.fail(`Fn::Not expects exactly 1 param, got ${params.length}`);
        }
        const x = evaluateConditionSubExpression(ctx, params[0], stackPath);
        return ctx.apply(x, (v) => ctx.succeed(!v));
    },
};

/**
 * From the docs: Compares if two values are equal. Returns true if the two values are equal or false if they aren't.
 *
 * Fn::Equals: [value_1, value_2]
 *
 * See https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-conditions.html#intrinsic-function-reference-conditions-not
 *
 */
export const fnEquals: Intrinsic = {
    name: 'Fn::Equals',
    evaluate: (ctx: IntrinsicContext, params: Expression[], stackPath: string): Result<any> => {
        if (params.length != 2) {
            return ctx.fail(`Fn::Equals expects exactly 2 params, got ${params.length}`);
        }
        return ctx.apply(ctx.evaluate(params[0], stackPath), (x) =>
            ctx.apply(ctx.evaluate(params[1], stackPath), (y) => {
                if (equal(x, y)) {
                    return ctx.succeed(true);
                } else {
                    return ctx.succeed(false);
                }
            }),
        );
    },
};

/**
 * Ref intrinsic resolves pseudo-parameters, parameter logical IDs or resource logical IDs to their values.
 *
 * If the argument to a Ref intrinsic is not a string literal, it may be another CF expression with intrinsic functions
 * that needs to be evaluated first.
 *
 * See also:
 *
 * - https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-ref.html
 */
export const ref: Intrinsic = {
    name: 'Ref',
    evaluate: (ctx: IntrinsicContext, params: Expression[], stackPath: string): Result<any> => {
        if (params.length != 1) {
            return ctx.fail(`Ref intrinsic expects exactly 1 param, got ${params.length}`);
        }
        const param = params[0];

        // Although not part of the CF spec, Output values are passed through CDK tokens as Ref structures; therefore
        // Pulumi Ref intrinsic receives them and has to handle them.
        if (isOutputReprInstance(param)) {
            return ctx.resolveOutput(<OutputRepr>param);
        }

        // Unless the parameter is a literal string, it may be another expression.
        //
        // CF docs: "When the AWS::LanguageExtensions transform is used, you can use intrinsic functions..".
        if (typeof param !== 'string') {
            const s = ctx.apply(ctx.evaluate(param, stackPath), (p) => mustBeString(ctx, p));
            return ctx.apply(s, (name) => evaluateRef(ctx, name, stackPath));
        }
        return evaluateRef(ctx, param, stackPath);
    },
};

/**
 * See `ref`.
 */
function evaluateRef(ctx: IntrinsicContext, param: string, stackPath: string): Result<any> {
    // Handle pseudo-parameters.
    // See https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/pseudo-parameter-reference.html
    switch (param) {
        case 'AWS::AccountId':
            return ctx.getAccountId();
        case 'AWS::NoValue':
            return ctx.succeed(undefined);
        case 'AWS::Partition':
            return ctx.getPartition();
        case 'AWS::Region':
            return ctx.getRegion();
        case 'AWS::URLSuffix':
            return ctx.getURLSuffix();
        case 'AWS::NotificationARNs':
            return ctx.fail('AWS::NotificationARNs pseudo-parameter is not yet supported in pulumi-cdk');
        case 'AWS::StackId':
        case 'AWS::StackName': {
            // TODO[pulumi/pulumi-cdk#246]: these pseudo-parameters are typically used in things like names or descriptions
            // so it should be safe to substitute with a stack node ID for most applications.
            const stackNodeId = ctx.getStackNodeId();
            debug(`pulumi-cdk is replacing a Ref to a CF pseudo-parameter ${param} with the stack node ID`);
            return stackNodeId;
        }
    }

    // Handle Cf template parameters.
    const cfParam = ctx.findParameter({ stackPath, id: param });
    if (cfParam !== undefined) {
        return ctx.evaluateParameter(cfParam);
    }

    // Handle references to resources.
    const map = ctx.findResourceMapping({ stackPath, id: param });
    if (map !== undefined) {
        if (map.attributes && 'id' in map.attributes) {
            // Users may override the `id` in a custom-supplied mapping, respect this.
            return ctx.succeed(map.attributes.id);
        }
        if (aws.cloudformation.CustomResourceEmulator.isInstance(map.resource)) {
            // Custom resources have a `physicalResourceId` that is used for Ref
            return ctx.succeed(map.resource.physicalResourceId);
        }

        const pType = (<any>map.resource).__pulumiType;
        if (!pType.startsWith('aws-native:')) {
            // For non-aws-native resources (i.e. AWS Provider), fallback to using the id
            // if this is incorrect users will have to provide a mapping with the correct id
            const cr = <pulumi.CustomResource>map.resource; // assume we have a custom resource.
            return ctx.succeed(cr.id);
        }
        const resMeta = ctx.tryFindResource(map.resourceType);

        // If there is no metadata to suggest otherwise, assume that we can use the Pulumi id which typically will be
        // the primaryIdentifier from CloudControl.
        if (resMeta === undefined || !resMeta.cfRef || resMeta.cfRef.notSupportedYet) {
            const cr = <pulumi.CustomResource>map.resource; // assume we have a custom resource.
            return ctx.succeed(cr.id);
        }

        // Respect metadata if it suggests Ref is not supported.
        if (resMeta.cfRef.notSupported) {
            return ctx.fail(`Ref intrinsic is not supported for the ${map.resourceType} resource type`);
        }

        // At this point metadata should indicate which properties to extract from the resource to compute the ref.
        const propNames: string[] = (resMeta.cfRef.properties || [])
            .concat(resMeta.cfRef.property ? [resMeta.cfRef.property] : [])
            .map((x) => toSdkName(x));

        const propValues: any[] = [];
        for (const p of propNames) {
            if (!Object.prototype.hasOwnProperty.call(map.resource, p)) {
                return ctx.fail(`Pulumi metadata notes a property "${p}" but no such property was found on a resource`);
            }
            propValues.push((<any>map.resource)[p]);
        }

        const delim: string = resMeta.cfRef!.delimiter || '|';

        return ctx.apply(ctx.succeed(propValues), (resolvedValues) => {
            let i = 0;
            for (const v of resolvedValues) {
                if (typeof v !== 'string') {
                    return ctx.fail(`Expected property "${propNames[i]}" to resolve to a string, got ${typeof v}`);
                }
                i++;
            }
            return ctx.succeed(resolvedValues.join(delim));
        });
    }

    return ctx.fail(
        `Ref intrinsic unable to resolve ${param} in stack ${stackPath}: not a known logical resource or parameter reference`,
    );
}

/**
 * Recognize forms such as {"Condition" : "SomeOtherCondition"}. If recognized, returns the conditionName.
 */
function parseConditionExpr(raw: Expression): string | undefined {
    if (typeof raw !== 'object' || !('Condition' in raw)) {
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
function evaluateConditionSubExpression(ctx: IntrinsicContext, expr: Expression, stackPath: string): Result<boolean> {
    const firstExprConditonName = parseConditionExpr(expr);
    if (firstExprConditonName !== undefined) {
        return evaluateCondition(ctx, firstExprConditonName, stackPath);
    } else {
        return ctx.apply(ctx.evaluate(expr, stackPath), (r) => mustBeBoolean(ctx, r));
    }
}

function mustBeBoolean(ctx: IntrinsicContext, r: any): Result<boolean> {
    if (typeof r === 'boolean') {
        return ctx.succeed(r);
    } else {
        return ctx.fail(`Expected a boolean, got ${typeof r}`);
    }
}

function mustBeString(ctx: IntrinsicContext, r: any): Result<string> {
    if (typeof r === 'string') {
        return ctx.succeed(r);
    } else {
        return ctx.fail(`Expected a string, got ${typeof r}`);
    }
}

function evaluateCondition(ctx: IntrinsicContext, conditionName: string, stackPath: string): Result<boolean> {
    const conditionExpr = ctx.findCondition({ stackPath, id: conditionName });
    if (conditionExpr === undefined) {
        return ctx.fail(`No condition '${conditionName}' found`);
    }
    return ctx.apply(ctx.evaluate(conditionExpr, stackPath), (r) => mustBeBoolean(ctx, r));
}
