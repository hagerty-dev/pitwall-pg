import { QueryResult, Pool } from "pg";
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
export declare function isValidTransaction(possibleTransaction: any): possibleTransaction is QueryUtilTransaction;
export declare function query(template: TemplateStringsArray, ...values: number[] | string[] | QueryUtilParam[] | QueryUtilQuery[] | unknown[]): QueryUtilQuery;
export declare function param(name: string, value?: any, type?: string): QueryUtilParam | QueryUtilParam[];
export declare function comment(_string: string): string;
export declare function cond(condition: boolean): (template: TemplateStringsArray, ...values: any) => QueryUtilQuery | undefined;
export declare function condFn(conditionFn: (_: any) => boolean): (conditionFnInput: any) => (template: TemplateStringsArray, ...values: any) => QueryUtilQuery | undefined;
export declare function canonicalize(sqlInput: string): string;
export interface QueryExecutorOptions {
    autoRollback: boolean;
    suppressErrorLogging: boolean;
    preamble: string[];
}
export declare type QueryExecutor = (query: QueryUtilQuery, Options: QueryExecutorOptions) => Promise<QueryResult>;
export declare function makeExecutor(db: dbConnection): QueryExecutor;
declare type TransactionStateTypes = "NOT_STARTED" | "STARTED" | "ROLLED_BACK" | "COMMITTED";
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
declare type beginTransactionReturn = ({ autoRollback, suppressErrorLogging, preamble, enableTracing }: beginTransactionArgs) => Promise<QueryUtilTransaction>;
export declare function beginTransaction(dbConnection: dbConnection): beginTransactionReturn;
export declare function validateTransaction(possibleTransaction: any): void;
export {};
