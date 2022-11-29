# pitwall-pg

In motorsports, the pitwall is where the team engineers, strategists and captains communicate, observe, and coordinate. This library allows you to create prepared statements, coordinate transactions, and observe the communications with your database.

# description & motivation

The goal of this package is to provide:
- a way to write safe SQL statements, including parameters
- a way to conditionally include parts of SQL statements
- a way to coordinate multiple statements together in a transaction
- and give you easy introspection, debugging and support unit testing of these things.

This is not an ORM, and it is not a query builder. 

It is a way create and manage transactions and send raw or dynamically created but parameterized SQL statements to a postgresql database.

# documentation

This package expects a database connection provided from the `pg` package:
- https://github.com/brianc/node-postgres
- documentation: https://node-postgres.com/

This package supports both `cjs` and `esm` modules. All examples and documentation are provided assuming `esm` though.

## transactions

To begin with, you will need to create a transaction factory by providing a `dbConnection`:

```
import { transactionFactory } from 'pitwall-pg';
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

#### `beginTransaction()` argument: `autoRollback`

`autoRollback` when set to true will roll back the transaction instead of committing when calling `commit()`

#### `beginTransaction()` argument: `suppressErrorLogging`

`suppressErrorLogging` when set to true will prevent errors from being logged to the console.

#### `beginTransaction()` argument: `preamble`

`preamble` takes an array of query statements to be ran immediately after the transaction is began, before any other statements are executed. Useful for statements that should set up certain environment variables in each transaction, such as using `SET LOCAL`

#### `beginTransaction()` argument: `enableConsoleTracing`

`enableConsoleTracing` when set to true will log to the console trace statements giving detailed information about clients connecting and releasing, and other conditions being managed in the library. Useful only for debugging.

#### `beginTransaction()` argument: `enableQueryLogging`

`enableQueryLogging` when set to true will capture every statement made in the transaction, allowing you to retrieve those statements afterwards using `transaction.queryLog` or `transaction.dumpQueries()`

#### `beginTransaction()` argument: `disableRollbackAndCommit`

`disableRollbackAndCommit` when set to true will cause any call to `transaction.commit()` and `transaction.rollback()` to be ignored, but not throw an exception when called. This is mostly useful in a test case scenario, where you want to pass or stub a transaction into a method that will commit or rollback, but do not want those calls to execute so you can run further statements in the test before eventually cleaning up the transaction yourself.

Enabling this does not suppress tracking of `transaction.debug.wasRollbackCalled()` and `transaction.debug.wasCommitCalled()` - a call to rollback or commit will still set these flags.

---

### `transaction.executeQuery(query)`

`executeQuery` takes the query object to be executed. Returns a QueryResult from the underlying pg library.

---

### `transaction.commit()`

commits the transaction. After commit, no other statements can be executed using this transaction, but the metadata and debug information will persist.

if `autoRollback` is enabled, this will roll the transaction back instead of committing.

returns void.

---

### `transaction.rollback()`

will attempt to roll back the transaction. After rollback, no other statements can be executed using this transaction, but the metadata and debug information will persist.

---

### `transaction.autoRollback`

a getter returning true or false if autoRollback was set during the initialization of the transaction.

---

### `transaction.suppressErrorLogging`

a getter returning true or false if suppressErrorLogging was set during the initialization of the transaction.

---
 
### `transaction.enableTracing`

a getter returning true or false if enableTracing was set during the initialization of the transaction.

---

### `transaction.debug`

A collection of mostly getters but some setters allowing debug of the transaction.

#### `transaction.debug.id`

a uuid uniquely identifying this transaction, creating during the initialization of the transaction.

#### `transaction.debug.isTransactionInProgress`

returns true or false if the transaction has not yet been committed or rolled back. If false, no more statements can be executed.

#### `transaction.debug.transactionState`

returns a string of one of the following states:

    - "NOT_STARTED"
    - "STARTED"
    - "ROLLED_BACK"
    - "COMMITTED"
    - "FAILED_TO_ROLLBACK"

#### `transaction.debug.wasCommitCalled`

true or false if `transaction.commit()` has been called.

#### `transaction.debug.wasRollbackCalled`

true or false if `transaction.rollback()` has been called.

#### `transaction.debug.queryExecutionCount`

the number of queries executed in this transaction;

#### `transaction.debug.enableQueryLogging = true`

both a getter and setter, enabling query logging after the transaction is already in progress.


#### `transaction.debug.disableRollbackAndCommit = true`

a getter and setter, enabling or disabling rollback and commit after the transaction is already in progress.

#### `transaction.debug.queryLog`

returns an array of strings of the queries that have been executed in this transaction.
#### `transaction.debug.dumpQueries()`

returns void but outputs all queries that have been executed during this transaction to the console.

---

### `validateTransaction(possibleTransaction)`

returns true or false if the passed input is a transaction provided by this library.

---

## single statements

### `executeQueryFactory()`

takes a database connection and returns a function that can be used to execute single statements against that connection.

## query parts

### `query`

a string template function allowing you to build a query to be passed to `executeQuery` that can use some of the following building blocks to create a dynamic and parameterized statement.

---

### `param`

a function allowing you pass a named parameter into a query, that will be parametrized when the statement goes to the database.

example: 

```
const q = query`select * from table where foo = ${param('bar', bar)};`
```

takes an optional third argument for type that is currently not used.

---

### `cond` and `condFn`

string template functions that allow you to conditionally include a section of a sql statement.

examples:

```
const isColumnIncluded = condFn(column => columsn.includes(column));

const q = query`
    SELECT 1
    ${isColumnIncluded('foo')`
        , foo
    `}
    FROM table_a
    ${cond(some_boolean)`
        INNER
            JOIN table_b
            ON table_a.id = table_b.a_id
    `}
    
`;
```

---

### `comment`

a string template function allowing you to include a comment that will not be rendered in the statement that is executed.

example:

```
const q = query`
        SELECT 1
        ${comment`foo`}
      `;
```

---

 
## miscellaneous

### `canonicalize(sqlInput: string)`

used mostly in unit tests to compare two sql strings regardless of their formatting.

# examples

see unit tests in tests/queryUtils.test.ts for many examples of using these features.