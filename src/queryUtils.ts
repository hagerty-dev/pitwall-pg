// noinspection ExceptionCaughtLocallyJS

/*
  TODO:
    [] better handle arrays of inputs, suffixing them with a number

 */

import { QueryResult, Pool, PoolClient } from "pg";
import { v4 as uuidv4 } from "uuid";
import dedent from "./dedent";

const LIBRARY_NAME = "QueryUtils";
const TRACE_PREFIX = `${LIBRARY_NAME} Trace:`;
const PARAM_SYMBOL = "__PARAM__";
const QUERY_SYMBOL = "__QUERY__";
const TRANSACTION_SYMBOL = "__TRANSACTION__";

interface dbConnection {
  _pool: Pool;
}

interface QueryUtilType {
  __type: "__PARAM__" | "__QUERY__" | "__TRANSACTION__";
}

interface QueryUtilParam extends QueryUtilType {
  __type: "__PARAM__";
  name: string;
  value: any;
  type: string;
}

interface QueryUtilQuery extends QueryUtilType {
  __type: "__QUERY__";
  namedParametersSQL: string;
  params: QueryUtilParam[];
  sql: string;
  dump: Function;
  debug: Function;
}

class QueryUtilsError extends Error {
  private readonly _type: string = "";
  constructor(message: string, type: string) {
    super(message);
    this._type = type;
    this.name = this.constructor.name;
  }
  get type() {
    return this._type;
  }
}

interface errorDefinition {
  message: (type?: string, input?: any) => string;
}

const ERROR_DEFINITIONS: { [key: string]: errorDefinition } = {
  INTERNAL_ERROR_INVALID_ERROR_TYPE: {
    message: type =>
      `${LIBRARY_NAME} internal error: the error type ${type} has not been defined`
  },
  EMPTY_SQL: {
    message: () => `${LIBRARY_NAME} query execution error: Empty SQL`
  },
  NO_TRANSACTION_IN_PROGRESS: {
    message: () => `${LIBRARY_NAME}: no transaction in progress`
  },
  INVALID_TRANSACTION: {
    message: () => `${LIBRARY_NAME}: invalid transaction`
  },
  INVALID_QUERY_TEMPLATE: {
    message: () =>
      `${LIBRARY_NAME}: invalid query template. This likely means you have an empty query.`
  },
  INCONSISTENT_ARRAY_TYPES: {
    message: () =>
      `${LIBRARY_NAME}: When providing an array of values, all values must be the same type.`
  },
  ARRAY_OF_UNDEFINED: {
    message: () =>
      `${LIBRARY_NAME}: Invalid query building. Array of undefined.  Make sure you are returning a value.  Eg. \`collection.map(row => { *return* query})\``
  },
  UNHANDLED_ARRAY_TYPE: {
    message: (type, { valueType }: { valueType: string }) =>
      `${LIBRARY_NAME}: query builder unhandled array of types: ${valueType}`
  },
  UNHANDLED_CASE: {
    message: (type, { value }: { value: any }) =>
      `${LIBRARY_NAME}: query builder unhandled case: ${value}`
  }
};

function makeError(type: string, ...args: any[]) {
  let definition = ERROR_DEFINITIONS[type];

  if (!definition) {
    definition = ERROR_DEFINITIONS["INTERNAL_ERROR_INVALID_ERROR_TYPE"];
  }

  return new QueryUtilsError(definition.message(type, ...args), type);
}

function isParam(possibleParam: any): possibleParam is QueryUtilParam {
  return (
    typeof possibleParam === "object" && possibleParam.__type === PARAM_SYMBOL
  );
}

function isQuery(possibleQuery: any): possibleQuery is QueryUtilQuery {
  return (
    typeof possibleQuery === "object" && possibleQuery.__type === QUERY_SYMBOL
  );
}

export function isValidTransaction(
  possibleTransaction: any
): possibleTransaction is QueryUtilTransaction {
  return (
    typeof possibleTransaction === "object" &&
    possibleTransaction.hasOwnProperty("__type") &&
    possibleTransaction.__type === TRANSACTION_SYMBOL &&
    possibleTransaction.hasOwnProperty("executeQuery") &&
    possibleTransaction.hasOwnProperty("commit") &&
    possibleTransaction.hasOwnProperty("rollback")
  );
}

function getParamPlaceholderToken(paramName: string): string {
  return ":param[" + paramName + "]/param:";
}

export function query(
  template: TemplateStringsArray,
  ...values:
    | number[]
    | string[]
    | QueryUtilParam[]
    | QueryUtilQuery[]
    | unknown[]
): QueryUtilQuery {
  let params: QueryUtilParam[] = [];

  // if multiple parameters are passed with different values, first one wins.
  const addParam = (param: QueryUtilParam) => {
    if (!params.find(p => p.name === param.name)) {
      params.push(param);
    }
  };

  if (template === undefined || template.length < 1) {
    throw makeError("INVALID_QUERY_TEMPLATE");
  }

  const namedParametersSQL = template
    .slice(1) //we will start our reduce with the first part, so take it off here
    .reduce((accumulatedSQL, part, index) => {
      let value = values[index] || "";
      if (typeof value === "number") {
        value = value.toString() as string;
      }
      if (typeof value === "string") {
        return accumulatedSQL + value + part;
      } else if (isParam(value)) {
        addParam(value);
        return accumulatedSQL + getParamPlaceholderToken(value.name) + part;
      } else if (isQuery(value)) {
        value.params.forEach(addParam);
        return accumulatedSQL + value.namedParametersSQL + part;
      } else if (Array.isArray(value)) {
        if (value.length > 0) {
          //check the first value, expect that the array is only of one kind
          const firstValue = value[0];

          if (isQuery(firstValue)) {
            if (!value.every(isQuery)) {
              throw makeError(`INCONSISTENT_ARRAY_TYPES`);
            }

            let result = "";
            for (let v of value) {
              v.params.forEach(addParam);
              result += v.namedParametersSQL;
            }
            return accumulatedSQL + result + part;
          } else if (isParam(firstValue)) {
            if (!value.every(isParam)) {
              throw makeError(`INCONSISTENT_ARRAY_TYPES`);
            }
            // todo: there may be something we could do here to automatically add an index to the end of the parameter name, when adding many parameters, such as when providing a list to an `in ()` clause
            value.forEach(addParam);
            return (
              accumulatedSQL +
              value.map(v => getParamPlaceholderToken(v.name)).join(", ") +
              part
            );
          } else if (firstValue === undefined) {
            throw makeError(`ARRAY_OF_UNDEFINED`);
          } else {
            // the value was an array, but we don't know how to handle an array of these values
            throw makeError("UNHANDLED_ARRAY_TYPE", {
              valueType: typeof firstValue
            });
          }
        } else {
          // the value was an array, but it was empty, so just move on
          return accumulatedSQL + part;
        }
      } else {
        throw makeError("UNHANDLED_CASE", { value });
      }

      //return "";
    }, template[0]) // start the accumulatedSQL with the first part of the template
    .replace(/(\n\t*\n)+/g, "\n"); // replace multiple newlines with a single newline.

  return {
    __type: QUERY_SYMBOL,
    namedParametersSQL,
    params: params.map(p => ({
      __type: p.__type,
      name: p.name,
      type: p.type,
      value: p.value
    })),
    get sql(): string {
      return this.params.reduce(function(
        sql: string,
        param: QueryUtilParam,
        paramIndex: number
      ) {
        sql = dedent(
          sql
            .split(getParamPlaceholderToken(param.name))
            .join("$" + (paramIndex + 1)) // this is the format that pg is expecting
        );
        return sql;
      },
      this.namedParametersSQL);
    },
    dump() {
      let output = this.params.reduceRight(function(
        sql: string,
        param: QueryUtilParam,
        index: number
      ) {
        if (typeof param.value === "number") {
          return sql
            .split("$" + (index + 1).toString())
            .join(String(param.value));
        } else {
          return sql
            .split("$" + (index + 1).toString())
            .join(`'` + param.value + `'`);
        }
      },
      this.sql);

      return dedent(output);
    },
    debug() {
      return this.dump();
    }
  };
}

export function param(
  name: string,
  value: any = undefined,
  type: string = ""
): QueryUtilParam | QueryUtilParam[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      __type: PARAM_SYMBOL,
      name: name + "_" + index.toString(),
      type: type,
      value: item
    }));
  }
  return { __type: PARAM_SYMBOL, name: name, type: type, value: value };
}

export function comment(_string: string) {
  return "";
}

/*
  cond(true)`...some sql string...`
 */
export function cond(
  condition: boolean
): (
  template: TemplateStringsArray,
  ...values: any
) => QueryUtilQuery | undefined {
  return function(template: TemplateStringsArray, ...values: any) {
    if (condition) {
      return query(template, ...values);
    }
  };
}

/*
  const isColumnIncluded = condFn(column => columns.includes(column));
  isColumnIncluded('column')`, some sql string`
*/
export function condFn(conditionFn: (_: any) => boolean) {
  return function(conditionFnInput: any) {
    return function(template: TemplateStringsArray, ...values: any) {
      if (conditionFn(conditionFnInput)) {
        return query(template, ...values);
      }
    };
  };
}

/*
  used in unit tests to compare two sql strings regardless of formatting.
*/
export function canonicalize(sqlInput: string) {
  return sqlInput
    .split("\n")
    .map(line =>
      line
        .trim()
        .replace(/\s/g, " ")
        .replace(/  +/g, " ")
    )
    .filter(line => line.trim().length > 0)
    .join(" ");
}

export interface QueryExecutorOptions {
  autoRollback: boolean;
  suppressErrorLogging: boolean;
  preamble: string[];
}

export type QueryExecutor = (
  query: QueryUtilQuery,
  Options: QueryExecutorOptions
) => Promise<QueryResult>;

export function makeExecutor(db: dbConnection): QueryExecutor {
  return async function(
    query: QueryUtilQuery,
    options: QueryExecutorOptions = {
      autoRollback: false,
      suppressErrorLogging: false,
      preamble: []
    }
  ) {
    const client = await db._pool.connect();

    if (query.sql.length === 0) {
      console.error(
        "\tQueryUtils query execution error: Empty SQL. This likely means something went wrong when building the query. "
      );
      console.log(query.debug());
      throw makeError("EMPTY_SQL");
    }

    let rows: QueryResult;
    try {
      await client.query({ text: `begin;` });

      for (const statement of options.preamble) {
        await client.query({ text: statement });
      }

      rows = await client.query({
        text: query.sql,
        values: query.params.map(p => p.value)
      });
      if (options.autoRollback) {
        await client.query({ text: `rollback;` });
      } else {
        await client.query({ text: `commit;` });
      }
    } catch (err) {
      if (!options.suppressErrorLogging) {
        console.log(query.debug());
        console.error("\tDB Error: " + (err as Error).toString() + "\n");
      }
      await client.query({ text: `rollback;` });
      //console.log(err)
      throw err;
    } finally {
      client.release();
    }
    return rows;
  };
}

function logDbException(
  error: unknown,
  suppressErrorLogging: boolean = false,
  query?: QueryUtilQuery
) {
  if (suppressErrorLogging) {
    if (typeof query !== "undefined") {
      console.log(query.debug());
    }
    if (error instanceof Error) {
      console.error("\tDB Error: " + error.toString() + "\n");
    } else if (typeof error === "string" || error instanceof String) {
      console.error("\tDB Error: " + error + "\n");
    }
  }
}

function ensureTransactionInProgress(isTransactionInProgress: boolean) {
  if (!isTransactionInProgress) {
    throw makeError("NO_TRANSACTION_IN_PROGRESS");
  }
}

type TransactionStateTypes =
  | "NOT_STARTED"
  | "STARTED"
  | "ROLLED_BACK"
  | "COMMITTED";

interface QueryUtilTransaction {
  __type: "__TRANSACTION__";
  executeQuery: Function;
  commit: Function;
  rollback: Function;
  readonly autoRollback: boolean;
  readonly suppressErrorLogging: boolean;
  readonly enableTracing: boolean;
  debug: {
    readonly id: string;
    readonly isTransactionInProgress: boolean;
    readonly transactionState: TransactionStateTypes;
    readonly wasCommitCalled: boolean;
    readonly wasRollbackCalled: boolean;
    readonly queryExecutionCount: number;
    isTestMode: boolean;
    readonly debugQueryCollection: QueryUtilQuery[];
    dumpQueries: () => void;
  };
}

interface beginTransactionArgs {
  autoRollback: boolean;
  suppressErrorLogging: boolean;
  preamble: string[];
  enableTracing: boolean;
}

type beginTransactionReturn = ({
  autoRollback,
  suppressErrorLogging,
  preamble,
  enableTracing
}: beginTransactionArgs) => Promise<QueryUtilTransaction>;

export function beginTransaction(
  dbConnection: dbConnection
): beginTransactionReturn {
  return async function({
    autoRollback = false,
    suppressErrorLogging = false,
    preamble = [],
    enableTracing = false
  }: beginTransactionArgs): Promise<QueryUtilTransaction> {
    let _id = uuidv4();
    let isTestMode = false;
    let isTransactionInProgress = false;
    let client: PoolClient;
    let wasCommitCalled = false;
    let wasRollbackCalled = false;
    let transactionState: TransactionStateTypes = "NOT_STARTED";
    let queryExecutionCount = 0;
    let debugQueryCollection: QueryUtilQuery[] = [];

    try {
      client = await dbConnection._pool.connect();
      isTransactionInProgress = true;
      transactionState = "STARTED";

      if (enableTracing) {
        console.log(TRACE_PREFIX, "client connected");
      }

      try {
        await client.query({ text: `begin;` });

        if (enableTracing) {
          console.log(TRACE_PREFIX, "transaction begun");
        }
        if (preamble.length) {
          if (enableTracing) {
            console.log(TRACE_PREFIX, "running preamble");
          }
          for (const statement of preamble) {
            await client.query({ text: statement });
          }
        }
      } catch (err) {
        logDbException(err, suppressErrorLogging);
        await client.query({ text: `rollback;` });
        if (enableTracing) {
          console.log(TRACE_PREFIX, "rolling back because of exception");
        }
        throw err;
      } finally {
        await client.release();
        if (enableTracing) {
          console.log(TRACE_PREFIX, "client released");
        }
        isTransactionInProgress = false;
      }
    } catch (err) {
      logDbException(err, suppressErrorLogging);
      throw err;
    } finally {
      isTransactionInProgress = false;
    }

    function trace(...output: any[]) {
      if (enableTracing) {
        console.log(TRACE_PREFIX, ...output);
      }
    }

    return {
      __type: TRANSACTION_SYMBOL,
      get autoRollback() {
        return autoRollback;
      },
      get suppressErrorLogging() {
        return suppressErrorLogging;
      },
      get enableTracing() {
        return enableTracing;
      },
      async executeQuery(query: QueryUtilQuery) {
        ensureTransactionInProgress(isTransactionInProgress);

        let rows: QueryResult;
        queryExecutionCount += 1;
        if (isTestMode) {
          debugQueryCollection.push(query.dump());
        }
        try {
          rows = await client.query({
            text: query.sql,
            values: query.params.map(p => p.value)
          });
          trace("query executed");
        } catch (err) {
          logDbException(err, suppressErrorLogging, query);
          await client.query({ text: `rollback;` });
          transactionState = "ROLLED_BACK";
          trace("rolling back because of exception");
          throw err;
        } finally {
          await client.release();
          trace("client released");
          isTransactionInProgress = false;
        }
        return rows;
      },
      async commit() {
        wasCommitCalled = true;
        ensureTransactionInProgress(isTransactionInProgress);
        if (isTestMode) {
          // if in test mode, just return, don't actually do anything
          trace("TEST MODE! transaction.commit ignored");
          return;
        }

        trace("transaction.commit");

        try {
          if (autoRollback) {
            trace("transaction.commit -> autoRollback override");

            await client.query({ text: `rollback;` });
            transactionState = "ROLLED_BACK";
          } else {
            await client.query({ text: `commit;` });
            transactionState = "COMMITTED";
          }
        } catch (err) {
          logDbException(err, suppressErrorLogging);
          await client.query({ text: `rollback;` });
          transactionState = "ROLLED_BACK";
          trace("rolling back because of exception");
          throw err;
        } finally {
          await client.release();
          trace("client released");
          isTransactionInProgress = false;
        }
      },
      async rollback(ignoreIfTransactionInProgress = false) {
        wasRollbackCalled = true;
        ensureTransactionInProgress(isTransactionInProgress);
        if (isTestMode) {
          //if in test mode, just return, don't actually do anything
          trace("TEST MODE! transaction.rollback ignored");
          return;
        }
        trace("transaction.rollback");
        try {
          await client.query({ text: `rollback;` });
        } catch (err) {
          logDbException(err, suppressErrorLogging);
          await client.query({ text: `rollback;` });
          transactionState = "ROLLED_BACK";
          trace("rolling back because of exception");
          isTransactionInProgress = false;
          throw err;
        } finally {
          await client.release();
          trace("client released");
          isTransactionInProgress = false;
        }
      },
      debug: {
        get id() {
          return _id;
        },
        get isTransactionInProgress() {
          return isTransactionInProgress;
        },
        get transactionState() {
          return transactionState;
        },
        get wasCommitCalled() {
          return wasCommitCalled;
        },
        get wasRollbackCalled() {
          return wasRollbackCalled;
        },
        get queryExecutionCount() {
          return queryExecutionCount;
        },
        set isTestMode(val) {
          /*
            TODO: maybe theres some way I can provide a hook for the user to provide a function called detectRunningUnderUnitTest that we can use here?

          if (!isRunningUnderMocha()) {
            throw new Error(
              "Cannot set isTestMode on transactions outside of unit testing"
            );
          }

          */
          isTestMode = val;
        },
        get isTestMode() {
          /*
            TODO: maybe theres some way I can provide a hook for the user to provide a function called detectRunningUnderUnitTest that we can use here?

          if (!isRunningUnderMocha()) {
            throw new Error(
              "Cannot get isTestMode on transactions outside of unit testing"
            );
          }
          */

          return isTestMode;
        },
        get debugQueryCollection() {
          /*
            TODO: maybe theres some way I can provide a hook for the user to provide a function called detectRunningUnderUnitTest that we can use here?

          if (!isRunningUnderMocha()) {
            throw new Error(
              "Cannot get debugQueryCollection on transactions outside of unit testing"
            );
          }

          */
          return debugQueryCollection;
        },
        dumpQueries() {
          for (const query of debugQueryCollection) {
            console.log(query);
          }
        }
      }
    };
  };
}

export function validateTransaction(possibleTransaction: any) {
  if (!isValidTransaction(possibleTransaction)) {
    throw makeError("INVALID_TRANSACTION");
  }
}
