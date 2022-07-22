#description & motivation

The goal of this package is to provide:
- a way to write safe SQL statements, including parameters
- a way to conditionally include parts of SQL statements
- a way to coordinate multiple statements together in a transaction
- and give you easy introspection, debugging and support unit testing of these things.

This is not an ORM, and it is not a query builder. 

It is a way create and manage transactions and send raw but parameterized SQL statements to a postgresql database.

# documentation

This package expects a database connection provided from the `pg` package:
- https://github.com/brianc/node-postgres
- documentation: https://node-postgres.com/

This package supports both `cjs` and `esm` modules. All examples and documentation are provided assuming `esm` though.

## transactions

To begin with, you will need to create a transaction factory by providing a `dbConnection`:

```
import { transactionFactory } from 'rg-query-utils-js';
import { Pool } from 'pg';

const pool = new Pool()

const beginTransaction = transactionFactory(pool);

const transaction = await beginTransaction({});

const rows = await transaction.executeQuery(query`SELECT 1`));

await transaction.commit();
```

`transactionFactory` returns a function, ideally named `beginTransaction` that will begin your transaction for you. 

You may then use `transaction.executeQuery()` to run any number of SQL statements.

Finally, you can run `transaction.commit()` or `transaction.rollback()`.

## transaction api

There are quite a few other options though beyond the standard use case for transactions, helping you to introspect and debug what has happened with the transaction, and facilitate unit testing.

### `beginTransaction`

```
... 
const beginTransaction = transactionFactory(dbConnection);`
const txn = beginTransaction({
    autoRollback: false,
    suppressErrorLogging: false,
    preamble: [],
    enableConsoleTracing: false,
    enableQueryLogging: false,
    disableRollbackAndCommit: false
})
```

### `beginTransaction()` argument: `autoRollback`

`autoRollback` when set to true will roll back the transaction instead of committing when calling `commit()`

### `transaction.executeQuery()`

### `transaction.commit()`

### `transaction.rollback()`

### `transaction.autoRollback()`

### `transaction.suppressErrorLogging()`
 
### `transaction.enableTracing()`

### `transaction.debug`

#### `transaction.debug.id`
#### `transaction.debug.isTransactionInProgress`
#### `transaction.debug.transactionState`
#### `transaction.debug.wasCommitCalled`
#### `transaction.debug.wasRollbackCalled`
#### `transaction.debug.queryExecutionCount`
#### `transaction.debug.enableQueryLogging = true`
#### `transaction.debug.queryExecutionCount`
#### `transaction.debug.disableRollbackAndCommit = true`
#### `transaction.debug.disableRollbackAndCommit`
#### `transaction.debug.queryLog`
#### `transaction.debug.dumpQueries()`

### `validateTransaction(possibleTransaction)`


## single statements

### `executeQueryFactory()`

## query parts

### `query`

### `param`

### `cond` and `condFn`

### `comment`

 
## miscellaneous

### `canonicalize`

# examples

