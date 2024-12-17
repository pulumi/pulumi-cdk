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

import { StackAddress } from './assembly';

/**
 * A specialized Map implementation that uses StackAddress objects as keys.
 * It internally uses nested maps to store values by stackPath and id.
 *
 * @typeparam T The type of values stored in the map
 *
 * @internal
 */
export class StackMap<T> implements Map<StackAddress, T> {
    // Map of stackPath -> Map of id -> value
    private _map: Map<string, Map<string, T>> = new Map();

    /**
     * Removes all elements from the map
     */
    clear(): void {
        this._map.clear();
    }

    /**
     * Removes the specified element from the map
     * @param key The StackAddress key to remove
     * @returns true if an element was removed, false otherwise
     */
    delete(key: StackAddress): boolean {
        const { stackPath, id: id } = key;
        const innerMap = this._map.get(stackPath);
        if (!innerMap) {
            return false;
        }
        return innerMap.delete(id);
    }

    /**
     * Returns the value associated with the specified key
     * @param key The StackAddress key to look up
     * @returns The value associated with the key, or undefined if not found
     */
    get(key: StackAddress): T | undefined {
        const { stackPath, id: id } = key;
        return this._map.get(stackPath)?.get(id);
    }

    /**
     * Returns whether an element with the specified key exists
     * @param key The StackAddress key to check
     * @returns true if the key exists, false otherwise
     */
    has(key: StackAddress): boolean {
        const { stackPath, id: id } = key;
        return !!this._map.get(stackPath)?.has(id);
    }

    /**
     * Adds or updates an element with the specified key and value
     * @param key The StackAddress key to set
     * @param value The value to associate with the key
     * @returns The StackMap object
     */
    set(key: StackAddress, value: T): this {
        const { stackPath, id: id } = key;
        let innerMap = this._map.get(stackPath);
        if (!innerMap) {
            innerMap = new Map();
            this._map.set(stackPath, innerMap);
        }
        innerMap.set(id, value);
        return this;
    }

    /**
     * Returns the number of elements in the map
     */
    public get size(): number {
        return Array.from(this._map.values()).reduce((acc: number, innerMap) => acc + innerMap.size, 0);
    }

    /**
     * Executes a provided function once for each key-value pair in the map
     * @param callbackfn Function to execute for each element
     * @param thisArg Value to use as 'this' when executing callback
     */
    forEach(callbackfn: (value: T, key: StackAddress, map: Map<StackAddress, T>) => void, thisArg?: any): void {
        for (const [stackPath, innerMap] of this._map) {
            for (const [id, value] of innerMap) {
                const key = { stackPath, id };
                callbackfn.call(thisArg, value, key, this as any);
            }
        }
    }

    forEachStackElement(
        stackPath: string,
        callbackfn: (value: T, key: StackAddress, map: Map<StackAddress, T>) => void,
        thisArg?: any,
    ): void {
        const innerMap = this._map.get(stackPath);
        if (!innerMap) {
            return;
        }
        for (const [id, value] of innerMap) {
            const key = { stackPath, id };
            callbackfn.call(thisArg, value, key, this as any);
        }
    }

    /**
     * Returns an iterator of key-value pairs for every entry in the map
     * @returns An iterator yielding [StackAddress, T] pairs
     */
    *entries(): IterableIterator<[StackAddress, T]> {
        for (const [stackPath, innerMap] of this._map) {
            for (const [id, value] of innerMap) {
                yield [{ stackPath, id: id }, value];
            }
        }
    }

    /**
     * Returns an iterator of keys in the map
     * @returns An iterator yielding StackAddress keys
     */
    *keys(): IterableIterator<StackAddress> {
        for (const [stackPath, innerMap] of this._map) {
            for (const id of innerMap.keys()) {
                yield { stackPath, id: id };
            }
        }
    }

    /**
     * Returns an iterator of values in the map
     * @returns An iterator yielding the values
     */
    *values(): IterableIterator<T> {
        for (const innerMap of this._map.values()) {
            yield* innerMap.values();
        }
    }

    /**
     * Returns the default iterator for the map
     * @returns An iterator for entries in the map
     */
    [Symbol.iterator](): IterableIterator<[StackAddress, T]> {
        return this.entries();
    }

    [Symbol.toStringTag] = 'StackMap';
}
