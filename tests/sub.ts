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

import { expect } from "chai";
import { SubPart, parseSub } from '../src/sub';

type SubCase = {
    template: string;
    expected: SubPart[];
}

function testSub(cases: SubCase[]) {
    for (const c of cases) {
        const parts = parseSub(c.template);
        expect(parts).to.deep.equal(c.expected);
    }
}

describe('Sub tests', () => {
    it('Correctly parses Fn::Sub with a single hole', () => {
        testSub([
            {template: "${Foo}", expected: [{str: "", ref: {id: "Foo", attr: undefined}}]},
            {template: "${Foo.Bar}", expected: [{str: "", ref: {id: "Foo", attr: "Bar"}}]},
            {template: "${Foo.Bar.Baz}", expected: [{str: "", ref: {id: "Foo", attr: "Bar.Baz"}}]},
        ]);
    });
    it('Correctly parses Fn::Sub with no holes', () => {
        testSub([
            {template: "Foo", expected: [{str: "Foo"}]},
            {template: "Foo $", expected: [{str: "Foo $"}]},
            {template: "Foo ${", expected: [{str: "Foo ${"}]},
        ]);
    });
    it('Correctly parses Fn::Sub with literal holes', () => {
        testSub([
            {template: "${!Literal}", expected: [{str: "${Literal}"}]},
            {template: "Foo ${!Literal}", expected: [{str: "Foo ${Literal}"}]},
            {template: "Foo ${!Literal} Bar", expected: [{str: "Foo ${Literal} Bar"}]},
        ]);
    });
    it('Correctly parses Fn::Sub with multiple holes', () => {
        testSub([
            {template: "Foo ${Foo} Bar ${Bar}", expected: [
                {str: "Foo ", ref: {id: "Foo", attr: undefined}},
                {str: " Bar ", ref: {id: "Bar", attr: undefined}},
            ]},
            {template: "Foo ${Foo.Attr} Bar ${Bar.Attr} Baz", expected: [
                {str: "Foo ", ref: {id: "Foo", attr: "Attr"}},
                {str: " Bar ", ref: {id: "Bar", attr: "Attr"}},
                {str: " Baz"},
            ]},
            {template: "Foo ${Foo.Attr} ${!Bar} ${Bar.Attr} Baz", expected: [
                {str: "Foo ", ref: {id: "Foo", attr: "Attr"}},
                {str: " ${Bar} ", ref: {id: "Bar", attr: "Attr"}},
                {str: " Baz"},
            ]},
        ]);
    });
    it('Correctly parses regression cases', () => {
        testSub([
            {template: "cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}", expected: [
                {str: "cdk-hnb659fds-assets-", ref: {id: "AWS::AccountId", attr: undefined}},
                {str: "-", ref: {id: "AWS::Region", attr: undefined}},
            ]},
        ]);
    });
});
