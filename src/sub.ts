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
