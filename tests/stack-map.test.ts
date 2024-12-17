import { StackMap } from '../src/stack-map';
import { StackAddress } from '../src/assembly';

describe('StackMap', () => {
    let stackMap: StackMap<number>;
    const stackAddress1: StackAddress = { stackPath: 'path1', id: 'id1' };
    const stackAddress2: StackAddress = { stackPath: 'path2', id: 'id2' };

    beforeEach(() => {
        stackMap = new StackMap<number>();
    });

    test('should set and get values correctly', () => {
        stackMap.set(stackAddress1, 1);
        expect(stackMap.get(stackAddress1)).toBe(1);
    });

    test('should return undefined for non-existent keys', () => {
        expect(stackMap.get(stackAddress1)).toBeUndefined();
    });

    test('should delete values correctly', () => {
        stackMap.set(stackAddress1, 1);
        expect(stackMap.delete(stackAddress1)).toBe(true);
        expect(stackMap.get(stackAddress1)).toBeUndefined();
    });

    test('should return false when deleting non-existent keys', () => {
        expect(stackMap.delete(stackAddress1)).toBe(false);
    });

    test('should check existence of keys correctly', () => {
        stackMap.set(stackAddress1, 1);
        expect(stackMap.has(stackAddress1)).toBe(true);
        expect(stackMap.has(stackAddress2)).toBe(false);
    });

    test('should clear all values', () => {
        stackMap.set(stackAddress1, 1);
        stackMap.set(stackAddress2, 2);
        stackMap.clear();
        expect(stackMap.size).toBe(0);
    });

    test('should return the correct size', () => {
        expect(stackMap.size).toBe(0);
        stackMap.set(stackAddress1, 1);
        expect(stackMap.size).toBe(1);
    });

    test('should iterate over entries correctly', () => {
        stackMap.set(stackAddress1, 1);
        stackMap.set(stackAddress2, 2);
        const entries = Array.from(stackMap.entries());
        expect(entries).toEqual([
            [stackAddress1, 1],
            [stackAddress2, 2]
        ]);
    });

    test('should iterate over keys correctly', () => {
        stackMap.set(stackAddress1, 1);
        stackMap.set(stackAddress2, 2);
        const keys = Array.from(stackMap.keys());
        expect(keys).toEqual([stackAddress1, stackAddress2]);
    });

    test('should iterate over values correctly', () => {
        stackMap.set(stackAddress1, 1);
        stackMap.set(stackAddress2, 2);
        const values = Array.from(stackMap.values());
        expect(values).toEqual([1, 2]);
    });

    test('should execute forEach correctly', () => {
        stackMap.set(stackAddress1, 1);
        stackMap.set(stackAddress2, 2);
        const mockCallback = jest.fn();
        stackMap.forEach(mockCallback);
        expect(mockCallback).toHaveBeenCalledTimes(2);
        expect(mockCallback).toHaveBeenCalledWith(1, stackAddress1, stackMap);
        expect(mockCallback).toHaveBeenCalledWith(2, stackAddress2, stackMap);
    });

    test('should execute forEachStackElement correctly for existing stackPath', () => {
        stackMap.set(stackAddress1, 1);
        stackMap.set({ stackPath: 'path1', id: 'id2' }, 2);
        const mockCallback = jest.fn();
        stackMap.forEachStackElement('path1', mockCallback);
        expect(mockCallback).toHaveBeenCalledTimes(2);
        expect(mockCallback).toHaveBeenCalledWith(1, { stackPath: 'path1', id: 'id1' }, stackMap);
        expect(mockCallback).toHaveBeenCalledWith(2, { stackPath: 'path1', id: 'id2' }, stackMap);
    });

    test('should not execute forEachStackElement for non-existent stackPath', () => {
        stackMap.set(stackAddress1, 1);
        const mockCallback = jest.fn();
        stackMap.forEachStackElement('nonExistentPath', mockCallback);
        expect(mockCallback).not.toHaveBeenCalled();
    });
});