---
editUrl: false
next: false
prev: false
title: "ScanResult"
---

Defined in: lix-cache-sdk/src/types.ts:95

Result from a scan operation

## Type Parameters

### T

`T` = `unknown`

## Properties

### count

> **count**: `number`

Defined in: lix-cache-sdk/src/types.ts:112

Total count of matching items

***

### items?

> `optional` **items**: `object`[]

Defined in: lix-cache-sdk/src/types.ts:99

Array of items (only present when keysOnly is false)

#### key

> **key**: `string`

#### value

> **value**: `T`

***

### keys?

> `optional` **keys**: `string`[]

Defined in: lix-cache-sdk/src/types.ts:107

Array of keys (only present when keysOnly is true)
