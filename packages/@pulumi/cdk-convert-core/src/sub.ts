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

export type SubPart = {
    str: string;
    ref?: {
        id: string;
        attr?: string;
    };
};

const subRegex = /\${([^!][^.}]*)(\.[^}]*)?}/g;
const litRegex = /\${!/g;
export function parseSub(template: string): SubPart[] {
    const parts = [];
    const matches = [...template.matchAll(subRegex)];
    let endIndex = 0;
    for (const m of matches) {
        const startIndex = endIndex;
        endIndex = m.index! + m[0].length;

        const str = template.slice(startIndex, m.index).replace(litRegex, '${');
        const id = m[1];
        const attr = m[2] ? m[2].slice(1) : undefined; // Slice off the leading '.'

        parts.push({ str, ref: { id, attr } });
    }

    if (endIndex !== template.length) {
        parts.push({ str: template.slice(endIndex).replace(litRegex, '${') });
    }

    return parts;
}
