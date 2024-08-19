import { toSdkName, toCfnName, hasUppercaseAcronym, findFirstRunOfUppercase, typeToken } from '../src/naming';
import { normalize } from '../src/interop';

describe('Naming tests', () => {
    test('normalize', () => {
        const cases = [
            {
                in: {
                    enableECSManagedTags: true,
                },
                out: {
                    enableEcsManagedTags: true,
                },
            },
            {
                in: {
                    dnsConfig: {
                        dnsRecords: [
                            {
                                ttl: 60,
                            },
                        ],
                    },
                },
                out: {
                    dnsConfig: {
                        dnsRecords: [
                            {
                                ttl: 60,
                            },
                        ],
                    },
                },
            },
        ];

        for (const c of cases) {
            expect(normalize('', c.in)).toMatchObject(c.out);
        }
    });
    test('typeToken', () => {
        const cases = [['AWS::EC2::VPC', 'aws-native:ec2:Vpc']];

        for (const c of cases) {
            expect(typeToken(c[0])).toEqual(c[1]);
        }
    });
    test('TestSdkCfnSdkRoundtrip', () => {
        const cases = [
            'ipAddress',
            'anIpAddress',
            'aNewIpAddress',
            'ip',
            'ascii',
            'asciiAndMore',
            'anAsciiAndMore',
            'anIp',
            'a',
            'lowercase',
            'lowercaseA',
            'lowercaseACat',
            'aCatAndADog',
            'someArns',
            'ec2ManagedKey',
            'useEc2Please',
            'http2',
        ];

        for (const c of cases) {
            expect(toSdkName(toCfnName(c, {}))).toEqual(c);
        }
    });

    test('TestCfnSdkCfnRoundtrip', () => {
        const casesSimple = [
            'A',
            'UppercaseACat',
            'ACatAndADog',
            'Ip',
            'AnIp',
            'IpAddress',
            'AnIpAddress',
            'ANewIpAddress',
            'Ascii',
            'AsciiAndMore',
            'SomeArns',
        ];

        for (const c of casesSimple) {
            expect(toCfnName(toSdkName(c), {})).toEqual(c);
        }

        const casesLookup = [
            'IP',
            'AnIP',
            'IPAddress',
            'AnIPAddress',
            'ANewIPAddress',
            'ASCII',
            'ASCIIAndMore',
            'AnASCIIAndMore',
            'SomeARNs',
            'UseEC2Please',
            'EC2ManagedKey',
        ];

        const lookup = {
            ip: 'IP',
            anIp: 'AnIP',
            ipAddress: 'IPAddress',
            anIpAddress: 'AnIPAddress',
            aNewIpAddress: 'ANewIPAddress',
            ascii: 'ASCII',
            asciiAndMore: 'ASCIIAndMore',
            anAsciiAndMore: 'AnASCIIAndMore',
            someArns: 'SomeARNs',
            useEc2Please: 'UseEC2Please',
            ec2ManagedKey: 'EC2ManagedKey',
        };

        for (const c of casesLookup) {
            expect(toCfnName(toSdkName(c), lookup)).toEqual(c);
        }
    });

    test('TestHasUppercaseAcronym', () => {
        const casesTrue = [
            'IPAddress',
            'anIPAddress',
            'AnIPAddress',
            'ANewIPAddress',
            'IP',
            'IPI',
            'ASCIIA',
            'ASCIIAndMore',
            'anASCIIAndMore',
            'anIP',
            'UseS3Please',
            'HostIPs',
            'ThreeIPsPlease',
        ];

        const casesFalse = [
            '',
            'A',
            'lowercase',
            'lowercaseA',
            'lowercaseACat',
            'UppercaseACat',
            'ACatAndADog',
            'LessIsMore',
            'IAspire',
        ];

        for (const c of casesTrue) {
            expect(hasUppercaseAcronym(c)).toBeTruthy();
        }

        for (const c of casesFalse) {
            expect(hasUppercaseAcronym(c)).toBeFalsy();
        }
    });

    test('TestFindFirstRunOfUppercase', () => {
        const cases = [
            {
                text: 'IPAddress',
                minLength: 2,
                expectedStart: 0,
                expectedEnd: 3,
            },
            {
                text: 'IPAddress',
                minLength: 3,
                expectedStart: 0,
                expectedEnd: 3,
            },
            {
                text: 'IPAddress',
                minLength: 4,
                expectedStart: -1,
                expectedEnd: -1,
            },
            {
                text: 'anIPAddress',
                minLength: 3,
                expectedStart: 2,
                expectedEnd: 5,
            },
            {
                text: 'anIPAddress',
                minLength: 4,
                expectedStart: -1,
                expectedEnd: -1,
            },
            {
                text: 'ANewIPAddress',
                minLength: 2,
                expectedStart: 0,
                expectedEnd: 2,
            },
            {
                text: 'ANewIPAddress',
                minLength: 3,
                expectedStart: 4,
                expectedEnd: 7,
            },
            {
                text: 'AnEC2Instance',
                minLength: 3,
                expectedStart: 2,
                expectedEnd: 6,
            },
        ];

        for (const c of cases) {
            const [s, e] = findFirstRunOfUppercase(c.text, c.minLength);
            expect(s).toEqual(c.expectedStart);
            expect(e).toEqual(c.expectedEnd);
        }
    });
});
