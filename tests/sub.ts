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
});
