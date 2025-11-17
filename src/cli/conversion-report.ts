import { ResourceIR, StackIR } from '@pulumi/cdk-convert-core';

export type SkipResourceReason = 'cdkMetadata' | 'customResourceFiltered';

export interface SkippedResourceEntry {
    kind: 'skipped';
    logicalId: string;
    cfnType: string;
    reason: SkipResourceReason;
}

export interface ClassicConversionEntry {
    kind: 'classicFallback';
    logicalId: string;
    cfnType: string;
    targetTypeTokens: string[];
}

export interface FanOutEntry {
    kind: 'fanOut';
    logicalId: string;
    cfnType: string;
    emittedResources: Array<{ logicalId: string; typeToken: string }>;
}

export type ConversionReportEntry = SkippedResourceEntry | ClassicConversionEntry | FanOutEntry;

export interface StackConversionReport {
    stackId: string;
    stackPath: string;
    originalResourceCount: number;
    emittedResourceCount: number;
    entries: ConversionReportEntry[];
}

export interface ConversionReport {
    stacks: StackConversionReport[];
}

export interface ConversionReportCollector {
    stackStarted(stack: StackIR): void;
    stackFinished(stack: StackIR, emittedResourceCount: number): void;
    resourceSkipped(stack: StackIR, resource: ResourceIR, reason: SkipResourceReason): void;
    classicConversion(stack: StackIR, resource: ResourceIR, targetTypeTokens: string[]): void;
    fanOut(stack: StackIR, resource: ResourceIR, emittedResources: ResourceIR[]): void;
}

interface MutableStackReport extends StackConversionReport {}

export class ConversionReportBuilder implements ConversionReportCollector {
    private readonly stackOrder: string[] = [];
    private readonly stacks = new Map<string, MutableStackReport>();

    stackStarted(stack: StackIR): void {
        if (this.stacks.has(stack.stackId)) {
            return;
        }
        this.stackOrder.push(stack.stackId);
        this.stacks.set(stack.stackId, {
            stackId: stack.stackId,
            stackPath: stack.stackPath,
            originalResourceCount: stack.resources.length,
            emittedResourceCount: stack.resources.length,
            entries: [],
        });
    }

    stackFinished(stack: StackIR, emittedResourceCount: number): void {
        const report = this.getStackReport(stack.stackId);
        report.emittedResourceCount = emittedResourceCount;
    }

    resourceSkipped(stack: StackIR, resource: ResourceIR, reason: SkipResourceReason): void {
        const report = this.getStackReport(stack.stackId);
        report.entries.push({
            kind: 'skipped',
            logicalId: resource.logicalId,
            cfnType: resource.cfnType,
            reason,
        });
    }

    classicConversion(stack: StackIR, resource: ResourceIR, targetTypeTokens: string[]): void {
        const unique = Array.from(new Set(targetTypeTokens));
        if (unique.length === 0) {
            return;
        }
        const report = this.getStackReport(stack.stackId);
        report.entries.push({
            kind: 'classicFallback',
            logicalId: resource.logicalId,
            cfnType: resource.cfnType,
            targetTypeTokens: unique,
        });
    }

    fanOut(stack: StackIR, resource: ResourceIR, emittedResources: ResourceIR[]): void {
        if (emittedResources.length < 2) {
            return;
        }
        const report = this.getStackReport(stack.stackId);
        report.entries.push({
            kind: 'fanOut',
            logicalId: resource.logicalId,
            cfnType: resource.cfnType,
            emittedResources: emittedResources.map((res) => ({
                logicalId: res.logicalId,
                typeToken: res.typeToken,
            })),
        });
    }

    build(): ConversionReport {
        return {
            stacks: this.stackOrder.map((stackId) => {
                const report = this.getStackReport(stackId);
                return {
                    stackId: report.stackId,
                    stackPath: report.stackPath,
                    originalResourceCount: report.originalResourceCount,
                    emittedResourceCount: report.emittedResourceCount,
                    entries: report.entries.slice(),
                };
            }),
        };
    }

    private getStackReport(stackId: string): MutableStackReport {
        const report = this.stacks.get(stackId);
        if (!report) {
            throw new Error(`Conversion report stack '${stackId}' has not been initialized`);
        }
        return report;
    }
}
