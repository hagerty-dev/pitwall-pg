"use strict";
// noinspection ExceptionCaughtLocallyJS
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTransaction = exports.beginTransaction = exports.makeExecutor = exports.canonicalize = exports.condFn = exports.cond = exports.comment = exports.param = exports.query = exports.isValidTransaction = void 0;
const uuid_1 = require("uuid");
const dedent_1 = __importDefault(require("./dedent"));
const LIBRARY_NAME = "QueryUtils";
const TRACE_PREFIX = `${LIBRARY_NAME} Trace:`;
const PARAM_SYMBOL = "__PARAM__";
const QUERY_SYMBOL = "__QUERY__";
const TRANSACTION_SYMBOL = "__TRANSACTION__";
class QueryUtilsError extends Error {
    constructor(message, type) {
        super(message);
        this._type = "";
        this._type = type;
        this.name = this.constructor.name;
    }
    get type() {
        return this._type;
    }
}
const ERROR_DEFINITIONS = {
    INTERNAL_ERROR_INVALID_ERROR_TYPE: {
        message: type => `${LIBRARY_NAME} internal error: the error type ${type} has not been defined`
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
        message: () => `${LIBRARY_NAME}: invalid query template. This likely means you have an empty query.`
    },
    INCONSISTENT_ARRAY_TYPES: {
        message: () => `${LIBRARY_NAME}: When providing an array of values, all values must be the same type.`
    },
    ARRAY_OF_UNDEFINED: {
        message: () => `${LIBRARY_NAME}: Invalid query building. Array of undefined.  Make sure you are returning a value.  Eg. \`collection.map(row => { *return* query})\``
    },
    UNHANDLED_ARRAY_TYPE: {
        message: (type, { valueType }) => `${LIBRARY_NAME}: query builder unhandled array of types: ${valueType}`
    },
    UNHANDLED_CASE: {
        message: (type, { value }) => `${LIBRARY_NAME}: query builder unhandled case: ${value}`
    }
};
function makeError(type, ...args) {
    let definition = ERROR_DEFINITIONS[type];
    if (!definition) {
        definition = ERROR_DEFINITIONS["INTERNAL_ERROR_INVALID_ERROR_TYPE"];
    }
    return new QueryUtilsError(definition.message(type, ...args), type);
}
function isParam(possibleParam) {
    return (typeof possibleParam === "object" && possibleParam.__type === PARAM_SYMBOL);
}
function isQuery(possibleQuery) {
    return (typeof possibleQuery === "object" && possibleQuery.__type === QUERY_SYMBOL);
}
function isValidTransaction(possibleTransaction) {
    return (typeof possibleTransaction === "object" &&
        possibleTransaction.hasOwnProperty("__type") &&
        possibleTransaction.__type === TRANSACTION_SYMBOL &&
        possibleTransaction.hasOwnProperty("executeQuery") &&
        possibleTransaction.hasOwnProperty("commit") &&
        possibleTransaction.hasOwnProperty("rollback"));
}
exports.isValidTransaction = isValidTransaction;
function getParamPlaceholderToken(paramName) {
    return ":param[" + paramName + "]/param:";
}
function query(template, ...values) {
    let params = [];
    // if multiple parameters are passed with different values, first one wins.
    const addParam = (param) => {
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
            value = value.toString();
        }
        if (typeof value === "string") {
            return accumulatedSQL + value + part;
        }
        else if (isParam(value)) {
            addParam(value);
            return accumulatedSQL + getParamPlaceholderToken(value.name) + part;
        }
        else if (isQuery(value)) {
            value.params.forEach(addParam);
            return accumulatedSQL + value.namedParametersSQL + part;
        }
        else if (Array.isArray(value)) {
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
                }
                else if (isParam(firstValue)) {
                    if (!value.every(isParam)) {
                        throw makeError(`INCONSISTENT_ARRAY_TYPES`);
                    }
                    // todo: there may be something we could do here to automatically add an index to the end of the parameter name, when adding many parameters, such as when providing a list to an `in ()` clause
                    value.forEach(addParam);
                    return (accumulatedSQL +
                        value.map(v => getParamPlaceholderToken(v.name)).join(", ") +
                        part);
                }
                else if (firstValue === undefined) {
                    throw makeError(`ARRAY_OF_UNDEFINED`);
                }
                else {
                    // the value was an array, but we don't know how to handle an array of these values
                    throw makeError("UNHANDLED_ARRAY_TYPE", {
                        valueType: typeof firstValue
                    });
                }
            }
            else {
                // the value was an array, but it was empty, so just move on
                return accumulatedSQL + part;
            }
        }
        else {
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
        get sql() {
            return this.params.reduce(function (sql, param, paramIndex) {
                sql = (0, dedent_1.default)(sql
                    .split(getParamPlaceholderToken(param.name))
                    .join("$" + (paramIndex + 1)) // this is the format that pg is expecting
                );
                return sql;
            }, this.namedParametersSQL);
        },
        dump() {
            let output = this.params.reduceRight(function (sql, param, index) {
                if (typeof param.value === "number") {
                    return sql
                        .split("$" + (index + 1).toString())
                        .join(String(param.value));
                }
                else {
                    return sql
                        .split("$" + (index + 1).toString())
                        .join(`'` + param.value + `'`);
                }
            }, this.sql);
            return (0, dedent_1.default)(output);
        },
        debug() {
            return this.dump();
        }
    };
}
exports.query = query;
function param(name, value = undefined, type = "") {
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
exports.param = param;
function comment(_string) {
    return "";
}
exports.comment = comment;
/*
  cond(true)`...some sql string...`
 */
function cond(condition) {
    return function (template, ...values) {
        if (condition) {
            return query(template, ...values);
        }
    };
}
exports.cond = cond;
/*
  const isColumnIncluded = condFn(column => columns.includes(column));
  isColumnIncluded('column')`, some sql string`
*/
function condFn(conditionFn) {
    return function (conditionFnInput) {
        return function (template, ...values) {
            if (conditionFn(conditionFnInput)) {
                return query(template, ...values);
            }
        };
    };
}
exports.condFn = condFn;
/*
  used in unit tests to compare two sql strings regardless of formatting.
*/
function canonicalize(sqlInput) {
    return sqlInput
        .split("\n")
        .map(line => line
        .trim()
        .replace(/\s/g, " ")
        .replace(/  +/g, " "))
        .filter(line => line.trim().length > 0)
        .join(" ");
}
exports.canonicalize = canonicalize;
function makeExecutor(db) {
    return function (query, options = {
        autoRollback: false,
        suppressErrorLogging: false,
        preamble: []
    }) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = yield db._pool.connect();
            if (query.sql.length === 0) {
                console.error("\tQueryUtils query execution error: Empty SQL. This likely means something went wrong when building the query. ");
                console.log(query.debug());
                throw makeError("EMPTY_SQL");
            }
            let rows;
            try {
                yield client.query({ text: `begin;` });
                for (const statement of options.preamble) {
                    yield client.query({ text: statement });
                }
                rows = yield client.query({
                    text: query.sql,
                    values: query.params.map(p => p.value)
                });
                if (options.autoRollback) {
                    yield client.query({ text: `rollback;` });
                }
                else {
                    yield client.query({ text: `commit;` });
                }
            }
            catch (err) {
                if (!options.suppressErrorLogging) {
                    console.log(query.debug());
                    console.error("\tDB Error: " + err.toString() + "\n");
                }
                yield client.query({ text: `rollback;` });
                //console.log(err)
                throw err;
            }
            finally {
                client.release();
            }
            return rows;
        });
    };
}
exports.makeExecutor = makeExecutor;
function logDbException(error, suppressErrorLogging = false, query) {
    if (suppressErrorLogging) {
        if (typeof query !== "undefined") {
            console.log(query.debug());
        }
        if (error instanceof Error) {
            console.error("\tDB Error: " + error.toString() + "\n");
        }
        else if (typeof error === "string" || error instanceof String) {
            console.error("\tDB Error: " + error + "\n");
        }
    }
}
function ensureTransactionInProgress(isTransactionInProgress) {
    if (!isTransactionInProgress) {
        throw makeError("NO_TRANSACTION_IN_PROGRESS");
    }
}
function beginTransaction(dbConnection) {
    return function ({ autoRollback = false, suppressErrorLogging = false, preamble = [], enableTracing = false }) {
        return __awaiter(this, void 0, void 0, function* () {
            let _id = (0, uuid_1.v4)();
            let isTestMode = false;
            let isTransactionInProgress = false;
            let client;
            let wasCommitCalled = false;
            let wasRollbackCalled = false;
            let transactionState = "NOT_STARTED";
            let queryExecutionCount = 0;
            let debugQueryCollection = [];
            try {
                client = yield dbConnection._pool.connect();
                isTransactionInProgress = true;
                transactionState = "STARTED";
                if (enableTracing) {
                    console.log(TRACE_PREFIX, "client connected");
                }
                try {
                    yield client.query({ text: `begin;` });
                    if (enableTracing) {
                        console.log(TRACE_PREFIX, "transaction begun");
                    }
                    if (preamble.length) {
                        if (enableTracing) {
                            console.log(TRACE_PREFIX, "running preamble");
                        }
                        for (const statement of preamble) {
                            yield client.query({ text: statement });
                        }
                    }
                }
                catch (err) {
                    logDbException(err, suppressErrorLogging);
                    yield client.query({ text: `rollback;` });
                    if (enableTracing) {
                        console.log(TRACE_PREFIX, "rolling back because of exception");
                    }
                    throw err;
                }
                finally {
                    yield client.release();
                    if (enableTracing) {
                        console.log(TRACE_PREFIX, "client released");
                    }
                    isTransactionInProgress = false;
                }
            }
            catch (err) {
                logDbException(err, suppressErrorLogging);
                throw err;
            }
            finally {
                isTransactionInProgress = false;
            }
            function trace(...output) {
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
                executeQuery(query) {
                    return __awaiter(this, void 0, void 0, function* () {
                        ensureTransactionInProgress(isTransactionInProgress);
                        let rows;
                        queryExecutionCount += 1;
                        if (isTestMode) {
                            debugQueryCollection.push(query.dump());
                        }
                        try {
                            rows = yield client.query({
                                text: query.sql,
                                values: query.params.map(p => p.value)
                            });
                            trace("query executed");
                        }
                        catch (err) {
                            logDbException(err, suppressErrorLogging, query);
                            yield client.query({ text: `rollback;` });
                            transactionState = "ROLLED_BACK";
                            trace("rolling back because of exception");
                            throw err;
                        }
                        finally {
                            yield client.release();
                            trace("client released");
                            isTransactionInProgress = false;
                        }
                        return rows;
                    });
                },
                commit() {
                    return __awaiter(this, void 0, void 0, function* () {
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
                                yield client.query({ text: `rollback;` });
                                transactionState = "ROLLED_BACK";
                            }
                            else {
                                yield client.query({ text: `commit;` });
                                transactionState = "COMMITTED";
                            }
                        }
                        catch (err) {
                            logDbException(err, suppressErrorLogging);
                            yield client.query({ text: `rollback;` });
                            transactionState = "ROLLED_BACK";
                            trace("rolling back because of exception");
                            throw err;
                        }
                        finally {
                            yield client.release();
                            trace("client released");
                            isTransactionInProgress = false;
                        }
                    });
                },
                rollback(ignoreIfTransactionInProgress = false) {
                    return __awaiter(this, void 0, void 0, function* () {
                        wasRollbackCalled = true;
                        ensureTransactionInProgress(isTransactionInProgress);
                        if (isTestMode) {
                            //if in test mode, just return, don't actually do anything
                            trace("TEST MODE! transaction.rollback ignored");
                            return;
                        }
                        trace("transaction.rollback");
                        try {
                            yield client.query({ text: `rollback;` });
                        }
                        catch (err) {
                            logDbException(err, suppressErrorLogging);
                            yield client.query({ text: `rollback;` });
                            transactionState = "ROLLED_BACK";
                            trace("rolling back because of exception");
                            isTransactionInProgress = false;
                            throw err;
                        }
                        finally {
                            yield client.release();
                            trace("client released");
                            isTransactionInProgress = false;
                        }
                    });
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
        });
    };
}
exports.beginTransaction = beginTransaction;
function validateTransaction(possibleTransaction) {
    if (!isValidTransaction(possibleTransaction)) {
        throw makeError("INVALID_TRANSACTION");
    }
}
exports.validateTransaction = validateTransaction;
