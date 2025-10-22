---
editUrl: false
next: false
prev: false
title: "LixCacheConfig"
---

Defined in: lix-cache-sdk/src/types.ts:4

Configuration options for the Lix Cache client

## Properties

### apiKey?

> `optional` **apiKey**: `string`

Defined in: lix-cache-sdk/src/types.ts:16

API key for authentication
Required if the server has LIX_AUTH_ENABLED=true

#### Default

```ts
undefined
```

***

### batching?

> `optional` **batching**: `boolean`

Defined in: lix-cache-sdk/src/types.ts:28

Enable request batching

#### Default

```ts
true
```

***

### batchWindow?

> `optional` **batchWindow**: `number`

Defined in: lix-cache-sdk/src/types.ts:34

Batching window in milliseconds

#### Default

```ts
10
```

***

### localCache?

> `optional` **localCache**: `boolean`

Defined in: lix-cache-sdk/src/types.ts:40

Enable client-side caching

#### Default

```ts
false
```

***

### localCacheTTL?

> `optional` **localCacheTTL**: `number`

Defined in: lix-cache-sdk/src/types.ts:46

Local cache TTL in seconds

#### Default

```ts
60
```

***

### maxRetries?

> `optional` **maxRetries**: `number`

Defined in: lix-cache-sdk/src/types.ts:52

Maximum number of retry attempts

#### Default

```ts
3
```

***

### retryDelay?

> `optional` **retryDelay**: `number`

Defined in: lix-cache-sdk/src/types.ts:58

Initial retry delay in milliseconds

#### Default

```ts
100
```

***

### timeout?

> `optional` **timeout**: `number`

Defined in: lix-cache-sdk/src/types.ts:22

Request timeout in milliseconds

#### Default

```ts
5000
```

***

### url?

> `optional` **url**: `string`

Defined in: lix-cache-sdk/src/types.ts:9

Base URL of the Lix Cache server

#### Default

```ts
'http://localhost:4000'
```
