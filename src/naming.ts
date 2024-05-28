// typescript representation of

const PACKAGE_NAME = 'aws-native';

export function typeToken(typ: string): string {
    const resourceName = typeName(typ);
    const mName = moduleName(typ).toLowerCase();

    return `${PACKAGE_NAME}:${mName}:${resourceName}`;
}

export function moduleName(resourceType: string): string {
    const resourceTypeComponents = resourceType.split('::');
    if (resourceTypeComponents.length !== 3) {
        throw new Error(`expected three parts in type ${resourceTypeComponents}`);
    }
    let mName = resourceTypeComponents[1];

    // Override the name of the Config module.
    if (mName === 'Config') {
        mName = 'Configuration';
    }

    return lowerAcronyms(mName);
}

function typeName(typ: string): string {
    const resourceTypeComponents = typ.split('::');
    if (resourceTypeComponents.length !== 3) {
        throw new Error(`expected three parts in type ${resourceTypeComponents}`);
    }
    let name = resourceTypeComponents[2];
    // Override name to avoid duplicate types due to "Output" suffix
    // See https://github.com/pulumi/pulumi/issues/8018
    if (name.endsWith('Output')) {
        const trimmed = name.slice(0, -6);
        // Skip renaming existing FlowOutput type.
        if (typ === 'AWS::MediaConnect::FlowOutput') {
            return name;
        }
        name = trimmed + 'OutputResource';
    }
    return lowerAcronyms(name);
}

// ToSdkName converts a Cloud Formation property or attribute name to the lowerCamelCase convention that
// is used in Pulumi schema's properties.
export function toSdkName(s: string): string {
    if (s == '') {
        return s;
    }
    s = lowerAcronyms(s);
    if (s.length > 0) {
        const r = s.codePointAt(0)!;
        if (r >= 'A'.codePointAt(0)! && r <= 'Z'.codePointAt(0)!) {
            s = String.fromCodePoint(r).toLowerCase() + s.slice(1);
        }
    }
    return s;
}

// ToCfnName converts a lowerCamelCase schema property name to the Cloud Formation property or attribute name
// either by looking up in the table if present or converting to PascalCase.
export function toCfnName(s: string, lookupTable: { [key: string]: string }): string {
    if (s in lookupTable) {
        return lookupTable[s];
    }
    return toPascalCase(s);
}

// toCfnName converts a lowerCamelCase schema property name to PascalCase .
function toPascalCase(s: string): string {
    if (s.length > 0) {
        const r = s.codePointAt(0)!;
        if (r >= 'a'.codePointAt(0)! && r <= 'z'.codePointAt(0)!) {
            s = String.fromCodePoint(r).toUpperCase() + s.slice(1);
        }
    }
    return s;
}

// HasUppercaseAcronym checks if a CamelCase string contains an Uppercase acronym
// by looking for runs of capitals longer than 2
export function hasUppercaseAcronym(s: string): boolean {
    const [startIndex, endIndex] = firstUppercaseAcronym(s);
    if (startIndex === -1) {
        return false;
    }
    // ignore single character "acronyms" since these will not be modified by lowerAcronyms
    // Note: we've defined uppercase to be ASCII [A-Z] so index math is safe here
    if (endIndex - startIndex > 1) {
        return true;
    }
    return hasUppercaseAcronym(s.slice(endIndex));
}

// lowers the trailing chars of any uppercase acronyms
export function lowerAcronyms(s: string): string {
    // eslint-disable-next-line prefer-const
    let [startIndex, endIndex] = firstUppercaseAcronym(s);
    if (startIndex === -1) {
        return s;
    }

    // Note: we've defined uppercase to be ASCII [A-Z] so index math is safe here
    startIndex = startIndex + 1; // don't lower the first char of the run

    return s.slice(0, startIndex) + s.slice(startIndex, endIndex).toLowerCase() + lowerAcronyms(s.slice(endIndex));
}

// Returns the indices of the first Uppercase acronym in the string
function firstUppercaseAcronym(s: string): [number, number] {
    // eslint-disable-next-line prefer-const
    let [startIndex, endIndex] = findFirstRunOfUppercase(s, 2);
    if (startIndex === -1) {
        return [startIndex, endIndex];
    }

    // Treat the last uppercase char in a run as part of the next word UNLESS:
    // - we're at the end of the string
    // - the acronym is followed by a single lowercase 's' (eg. as in "ARNs")
    // Note: we've defined uppercase to be ASCII [A-Z] so index math is safe here
    if (!(endIndex === s.length || startsWithIsolatedLowercaseS(s.slice(endIndex)))) {
        endIndex = endIndex - 1;
    }

    return [startIndex, endIndex];
}

function startsWithIsolatedLowercaseS(s: string): boolean {
    switch (s.length) {
        case 0:
            return false;
        case 1:
            return s[0] === 's';
        default:
            return s[0] === 's' && isUpperAcronymChar(s[1]);
    }
}

// returns the indices of the first run of at least minLength uppercase characters encountered in str
export function findFirstRunOfUppercase(s: string, minLength: number): [number, number] {
    let startIndex = -1;
    for (let i = 0; i < s.length; i++) {
        const char = s[i];
        if (startIndex === -1) {
            // looking for first uppercase char
            if (isUpperAcronymChar(char)) {
                startIndex = i;
            }
        } else {
            // in a run, looking for non-uppercase char
            if (!isUpperAcronymChar(char)) {
                // Note: we've defined uppercase to be ASCII [0-9A-Z] so index math is safe here
                if (i - startIndex >= minLength) {
                    return [startIndex, i];
                } else {
                    startIndex = -1;
                }
            }
        }
    }

    if (startIndex === -1) {
        return [-1, -1];
    }

    return [startIndex, s.length];
}

function isUpperAcronymChar(r: string): boolean {
    const codePoint = r.codePointAt(0)!;
    return (
        (codePoint >= 'A'.codePointAt(0)! && codePoint <= 'Z'.codePointAt(0)!) ||
        (codePoint >= '0'.codePointAt(0)! && codePoint <= '9'.codePointAt(0)!)
    );
}

// ToUpperCamel converts a string to UpperCamelCase.
export function toUpperCamel(s: string): string {
    return toCamelInitCase(s, true);
}

function toCamelInitCase(s: string, initCase: boolean): string {
    if (s === s.toUpperCase()) {
        // lowercase the UPPER_SNAKE_CASE
        s = s.toLowerCase();
    }

    s = s.trim();
    let n = '';
    let capNext = initCase;
    for (const v of s) {
        if (v >= 'A' && v <= 'Z') {
            n += v;
        }
        if (v >= '0' && v <= '9') {
            n += v;
        }
        if (v >= 'a' && v <= 'z') {
            if (capNext) {
                n += v.toUpperCase();
            } else {
                n += v;
            }
        }
        if (v === '_' || v === ' ' || v === '-' || v === '.') {
            capNext = true;
        } else {
            capNext = false;
        }
    }
    return n;
}
