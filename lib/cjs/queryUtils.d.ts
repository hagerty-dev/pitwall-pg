import { QueryResult } from "pg";
export interface QueryUtilsDbConnection {
    _pool: any;
}
interface QueryUtilType {
    __type: "__PARAM__" | "__QUERY__" | "__TRANSACTION__";
}
export interface QueryUtilParam extends QueryUtilType {
    __type: "__PARAM__";
    name: string;
    value: any;
    type: string;
}
export interface QueryUtilQuery extends QueryUtilType {
    __type: "__QUERY__";
    namedParametersSQL: string;
    params: QueryUtilParam[];
    sql: string;
    dump: Function;
    debug: Function;
}
export declare class QueryUtilsError extends Error {
    private readonly _type;
    constructor(message: string, type: string);
    get type(): string;
}
export declare function isParam(possibleParam: any): possibleParam is QueryUtilParam;
export declare function isQuery(possibleQuery: any): possibleQuery is QueryUtilQuery;
export declare function isValidTransaction(possibleTransaction: any): possibleTransaction is QueryUtilTransaction;
export declare function query(template: TemplateStringsArray, ...values: number[] | string[] | QueryUtilParam[] | QueryUtilQuery[] | unknown[]): QueryUtilQuery;
export declare function param(name: string, value: any, type?: string): QueryUtilParam | QueryUtilParam[];
export declare function comment(_input: TemplateStringsArray, ..._values: any): string;
export declare function cond(condition: boolean): (template: TemplateStringsArray, ...values: any) => QueryUtilQuery | undefined;
export declare function condFn(conditionFn: (_: any) => boolean): (conditionFnInput: any) => (template: TemplateStringsArray, ...values: any) => QueryUtilQuery | undefined;
export declare function canonicalize(sqlInput: string): string;
export interface QueryExecutorOptions {
    autoRollback?: boolean;
    suppressErrorLogging?: boolean;
    preamble?: string[] | QueryUtilQuery[];
}
export declare type QueryExecutor = (query: QueryUtilQuery, Options?: QueryExecutorOptions) => Promise<QueryResult>;
export declare function executeQueryFactory(db: QueryUtilsDbConnection): QueryExecutor;
declare type TransactionStateTypes = "NOT_STARTED" | "STARTED" | "ROLLED_BACK" | "COMMITTED" | "FAILED_TO_ROLLBACK";
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
        enableQueryLogging: boolean;
        disableRollbackAndCommit: boolean;
        readonly queryLog: string[];
        dumpQueries: () => void;
    };
}
interface transactionFactoryArgs {
    autoRollback?: boolean;
    suppressErrorLogging?: boolean;
    preamble?: string[] | QueryUtilQuery[];
    enableConsoleTracing?: boolean;
    enableQueryLogging?: boolean;
    disableRollbackAndCommit?: boolean;
}
declare type transactionFactoryReturn = ({ autoRollback, suppressErrorLogging, preamble, enableConsoleTracing, enableQueryLogging, disableRollbackAndCommit }: transactionFactoryArgs) => Promise<QueryUtilTransaction>;
export declare function transactionFactory(dbConnection: QueryUtilsDbConnection): transactionFactoryReturn;
export declare function validateTransaction(possibleTransaction: any): void;
export {};
