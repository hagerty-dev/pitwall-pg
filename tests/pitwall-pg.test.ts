import { expect } from "chai";
import {
  query,
  param,
  canonicalize,
  PitwallQuery,
  transactionFactory,
  PitwallDbConnection,
  validateTransaction,
  comment,
  cond,
  condFn,
  executeQueryFactory
} from "../src/pitwall-pg";
import { expectErrorType } from "./testUtils";

describe("suite", async function() {
  describe("query``", async function() {
    it("allows you to create a query", async function() {
      const q = query`SELECT 1`;

      expect(q.sql).to.equal(`SELECT 1`);
    });
    it("allows you to create a query with a parameter", async function() {
      const q = query`
        SELECT 1
        WHERE foo = ${param("bar", "bar")}
      `;

      expect(canonicalize(q.dump())).to.equal(
        canonicalize(`
        SELECT 1
        WHERE foo = 'bar'
      `)
      );

      expect(canonicalize(q.sql)).to.equal(
        canonicalize(`
        SELECT 1
        WHERE foo = $1
      `)
      );

      expect(q.params).to.deep.equal([
        { __type: "__PARAM__", name: "bar", type: "", value: "bar" }
      ]);
    });

    it("should allow you conditionally include parts of the query", async function() {
      const q = query`
        SELECT
          1
          ${cond(false)`, 2`}
          ${cond(true)`, 3`}
        FROM
          a
        ${cond(false)`
          INNER
            JOIN b
            ON a.x = b.x
        `}
        ${cond(true)`
          INNER
            JOIN c
            ON a.x = c.x
        `}
    `;

      expect(canonicalize(q.sql)).to.equal(
        canonicalize(`
          SELECT 
              1
            , 3 
          FROM a 
          INNER 
            JOIN c 
            ON a.x = c.x
        `)
      );
    });

    it("should allow you to provide parameters to the query", async function() {
      const q = query`
        SELECT 1
        FROM a
        WHERE x = ${param("x", 1, "Int")}
        AND y = ${param("y", "foo")}
      `;

      expect(canonicalize(q.sql)).to.equal(
        canonicalize(`
          SELECT 1
          FROM a
          WHERE x = $1
          AND y = $2
        `)
      );

      expect(q.params).to.deep.equal([
        { __type: "__PARAM__", name: "x", type: "Int", value: 1 },
        { __type: "__PARAM__", name: "y", type: "", value: "foo" }
      ]);
    });

    it("should allow you to provide and array of parameters to the query", async function() {
      const q = query`
            SELECT 1
            FROM a
            WHERE x in (${param("x", [1, 2, 3], "Int")})
          `;

      expect(canonicalize(q.sql)).to.equal(
        canonicalize(`
              SELECT 1
              FROM a
              WHERE x in ($1, $2, $3)
            `)
      );

      expect(q.params).to.deep.equal([
        { __type: "__PARAM__", name: "x_0", type: "Int", value: 1 },
        { __type: "__PARAM__", name: "x_1", type: "Int", value: 2 },
        { __type: "__PARAM__", name: "x_2", type: "Int", value: 3 }
      ]);
    });

    it("should error if you provide multiple types in an param array", async function() {
      await expectErrorType("INCONSISTENT_ARRAY_TYPES", function() {
        const q = query`
            SELECT 1
            FROM a
            WHERE x in (${[query`1`, param("x", 2)]})
          `;
      });

      await expectErrorType("INCONSISTENT_ARRAY_TYPES", function() {
        const q = query`
            SELECT 1
            FROM a
            WHERE x in (${[param("x", 2), query`1`]})
          `;
      });

      await expectErrorType("ARRAY_OF_UNDEFINED", function() {
        const q = query`
            SELECT 1
            FROM a
            WHERE x in (${[undefined]})
          `;
      });

      await expectErrorType("UNHANDLED_ARRAY_TYPE", function() {
        const q = query`
            SELECT 1
            FROM a
            WHERE x in (${[1, 2, 3]})
          `;
      });

      await expectErrorType("UNHANDLED_CASE", function() {
        const q = query`
            SELECT 1
            FROM a
            WHERE x in (${{ foo: "bar" }})
          `;
        console.log(q.debug());
      });
    });

    it("should allow you to construct queries from parts", async function() {
      const q = query`select ${query`1`}`;

      expect(canonicalize(q.debug())).to.equal(canonicalize(`select 1`));

      const q2 = query`select ${2}`;

      expect(canonicalize(q2.debug())).to.equal(canonicalize(`select 2`));
    });

    it("should allow you to provide parameters in conditions to the query", async function() {
      const q = query`
        SELECT 1
        FROM a
        WHERE x = ${param("x", 1, "Int")}
        AND y = ${param("y", "foo")}
        ${cond(true)`
          AND z = ${param("x", 1)}
        `}
      `;

      expect(canonicalize(q.sql)).to.equal(
        canonicalize(`
          SELECT 1
          FROM a
          WHERE x = $1
          AND y = $2
          AND z = $1
        `)
      );

      expect(q.params).to.deep.equal([
        { __type: "__PARAM__", name: "x", type: "Int", value: 1 },
        { __type: "__PARAM__", name: "y", type: "", value: "foo" }
      ]);
    });

    it("should allow you to provide unique parameters in conditions to the query", async function() {
      const q = query`
        SELECT 1
        FROM a
        WHERE 1 = 1
        ${cond(true)`
          AND z = ${param("z", 1)}
        `}
        AND x = ${param("x", 1, "Int")}
        AND y = ${param("y", "foo")}
      `;

      expect(canonicalize(q.sql)).to.equal(
        canonicalize(`
          SELECT 1
          FROM a
          WHERE 1 = 1
          AND z = $1
          AND x = $2
          AND y = $3
        `)
      );

      expect(q.params).to.deep.equal([
        { __type: "__PARAM__", name: "z", type: "", value: 1 },
        { __type: "__PARAM__", name: "x", type: "Int", value: 1 },
        { __type: "__PARAM__", name: "y", type: "", value: "foo" }
      ]);
    });

    it("should allow you to provide unique parameters in conditions to the query in any order", async function() {
      const q = query`
        SELECT 1
        FROM a
        WHERE x = ${param("x", 1, "Int")}
        ${cond(true)`
        AND y = ${param("y", "foo")}
        `}
        AND z = ${param("z", 1)}
      `;
      expect(canonicalize(q.sql)).to.equal(
        canonicalize(`
          SELECT 1
          FROM a
          WHERE x = $1
          AND y = $2
          AND z = $3
        `)
      );

      expect(q.params).to.deep.equal([
        { __type: "__PARAM__", name: "x", type: "Int", value: 1 },
        { __type: "__PARAM__", name: "y", type: "", value: "foo" },
        { __type: "__PARAM__", name: "z", type: "", value: 1 }
      ]);
    });
    it("should allow you to use a conditional Function", function() {
      const isColumnIncluded = condFn(function(column) {
        return column === "t";
      });

      const q = query`
        SELECT
          1
          ${isColumnIncluded("f")`, 2`}
          ${isColumnIncluded("t")`, 3`}
        FROM
          a
        `;

      expect(canonicalize(q.sql)).to.equal(
        canonicalize(`
          SELECT 
              1
            , 3
          FROM
            a
        `)
      );
    });

    it("should allow you to dump out a representation of a query", function() {
      const q = query`
        SELECT 1
        FROM a
        WHERE x = ${param("x", 1, "Int")}
        AND y = ${param("y", "foo")}
        ${cond(true)`
          AND z = ${param("x", 1)}
        `}
      `;

      expect(canonicalize(q.dump())).to.equal(
        canonicalize(`
            SELECT 1
            FROM a
            WHERE x = 1
            AND y = 'foo'
            AND z = 1
        `)
      );

      const q2 = query`SELECT 1`;

      expect(canonicalize(q2.dump())).to.equal(
        canonicalize(`
            SELECT 1
        `)
      );
    });

    it("should allow you to use comment", function() {
      const q = query`
        SELECT 1
        ${comment`foo`}
      `;

      expect(canonicalize(q.dump())).to.equal(
        canonicalize(`
            SELECT 1
        `)
      );
    });

    it("should allow you to compose arrays of queries", function() {
      const q = query`
      select
        ${["a", "b", "c"].map((x, idx) => {
          return query`
            ${idx !== 0 ? "," : ""} "${x}" ${param(x + "_" + idx, idx)}`;
        })}
    `;

      expect(canonicalize(q.dump())).to.equal(
        canonicalize(`select "a" 0 , "b" 1 , "c" 2`)
      );
    });

    it("should allow you to compose an empty array", function() {
      const q = query`
        select 1 ${[]}
      `;

      expect(canonicalize(q.dump())).to.equal(canonicalize(`select 1`));
    });

    it("should throw an error for an empty query", async function() {
      await expectErrorType("INVALID_QUERY_TEMPLATE", async function() {
        // @ts-ignore
        const q = query();
      });

      await expectErrorType("INVALID_QUERY_TEMPLATE", async function() {
        // @ts-ignore
        const q = query([]);
      });
    });
  });

  describe("executeQueryFactory", async function() {
    let queryLog: string[] = [];
    let releaseWasCalled = false;
    const dbStub = {
      _pool: {
        connect: async function() {
          return {
            query: async function(q: any) {
              queryLog.push(q.text);
              return [];
            },
            release: async function() {
              releaseWasCalled = true;
            }
          };
        }
      }
    };

    beforeEach(function() {
      queryLog = [];
      releaseWasCalled = false;
    });

    it("should allow you to create an executor given a dbconnection", async function() {
      const executeQuery = executeQueryFactory(dbStub);

      expect(executeQuery).to.be.a("function");
    });

    it("should execute queries given to it", async function() {
      const executeQuery = executeQueryFactory(dbStub);

      await executeQuery(query`select 1;`);

      expect(queryLog).to.deep.equal(["begin;", "select 1;", "commit;"]);
      expect(releaseWasCalled).to.be.true;
    });

    it("should throw an error if given an empty query", async function() {
      const executeQuery = executeQueryFactory(dbStub);

      await expectErrorType("EMPTY_SQL", async function() {
        const q = query``;
        await executeQuery(q);
      });
      expect(releaseWasCalled).to.be.false;
      expect(queryLog.length).to.equal(0);
    });

    it("should allow you to provide a preamble", async function() {
      const executeQuery = executeQueryFactory(dbStub);

      await executeQuery(query`select ${param("x", 1)};`, {
        preamble: [`SET LOCAL foo = 'bar';`, `SET LOCAL bar = 'foo';`]
      });

      expect(queryLog).to.deep.equal([
        "begin;",
        `SET LOCAL foo = 'bar';`,
        `SET LOCAL bar = 'foo';`,
        "select $1;",
        "commit;"
      ]);

      expect(releaseWasCalled).to.be.true;
    });

    it("should allow you to provide query``s for the preamble", async function() {
      const executeQuery = executeQueryFactory(dbStub);

      await executeQuery(query`select 1;`, {
        preamble: [
          query`SET LOCAL foo = ${param("bar", "bar")};`,
          query`SET LOCAL bar = ${param("foo", "foo")};`
        ]
      });

      expect(queryLog).to.deep.equal([
        "begin;",
        `SET LOCAL foo = $1;`,
        `SET LOCAL bar = $1;`,
        "select 1;",
        "commit;"
      ]);

      expect(releaseWasCalled).to.be.true;
    });

    it("should allow you to request autoRollback", async function() {
      const executeQuery = executeQueryFactory(dbStub);

      await executeQuery(query`select 1;`, {
        autoRollback: true,
        preamble: [query`SET LOCAL foo = ${param("bar", "bar")};`]
      });

      expect(queryLog).to.deep.equal([
        "begin;",
        `SET LOCAL foo = $1;`,
        "select 1;",
        "rollback;"
      ]);

      expect(releaseWasCalled).to.be.true;
    });

    it("should allow you to suppress error logging", async function() {
      const dbStub = {
        _pool: {
          connect: async function() {
            return {
              query: async function(q: any) {
                queryLog.push(q.text);
                if (q.text.includes(`THROW_ERR`)) {
                  throw new Error("DB Error");
                }
                return [];
              },
              release: async function() {
                releaseWasCalled = true;
              }
            };
          }
        }
      };

      const executeQuery = executeQueryFactory(dbStub);

      let expectedError1: any = undefined;
      try {
        await executeQuery(query`select 1; /* THROW_ERR */`, {});
      } catch (err) {
        expectedError1 = err;
      }
      expect(expectedError1.message).to.equal("DB Error");

      expect(queryLog).to.deep.equal([
        "begin;",
        "select 1; /* THROW_ERR */",
        "rollback;"
      ]);

      queryLog = [];

      let expectedError2: any = undefined;
      try {
        await executeQuery(query`select 1; /* THROW_ERR */`, {
          suppressErrorLogging: true
        });
      } catch (err) {
        expectedError2 = err;
      }
      expect(expectedError2.message).to.equal("DB Error");

      expect(queryLog).to.deep.equal([
        "begin;",
        "select 1; /* THROW_ERR */",
        "rollback;"
      ]);

      expect(releaseWasCalled).to.be.true;
    });
  });

  describe("transactions", async function() {
    const dbStub = {
      _pool: {
        connect: async function() {
          return {
            query: async function(q: any) {
              return [];
            },
            release: async function() {}
          };
        }
      }
    };

    it("should allow you to create a transaction", async function() {
      const transactionHelper = transactionFactory(dbStub);
      expect(transactionHelper).to.be.a("function");
      const transaction = await transactionHelper({});

      expect(transaction.executeQuery).to.be.a("Function");
      expect(transaction.commit).to.be.a("Function");
      expect(transaction.rollback).to.be.a("Function");
    });

    it("should allow queries then commit", async function() {
      const transactionHelper = transactionFactory(dbStub);
      expect(transactionHelper).to.be.a("function");
      const transaction = await transactionHelper({
        enableQueryLogging: true,
        enableConsoleTracing: false
      });

      expect(transaction.debug.queryLog.length).to.equal(1);
      expect(transaction.debug.queryLog[0]).to.equal("begin;");

      await transaction.executeQuery(query`select 1;`);
      expect(transaction.debug.queryLog.length).to.equal(2);
      expect(transaction.debug.queryLog[1]).to.equal("select 1;");

      await transaction.executeQuery(query`select current_timestamp;`);
      expect(transaction.debug.queryLog.length).to.equal(3);
      expect(transaction.debug.queryLog[2]).to.equal(
        "select current_timestamp;"
      );

      await transaction.commit();

      expect(transaction.debug.queryLog.length).to.equal(4);

      expect(transaction.debug.queryLog[3]).to.equal("commit;");
      expect(transaction.debug.isTransactionInProgress).to.be.false;
      expect(transaction.debug.transactionState).to.equal("COMMITTED");
      expect(transaction.debug.wasCommitCalled).to.be.true;
      expect(transaction.debug.wasRollbackCalled).to.be.false;
      expect(transaction.debug.enableQueryLogging).to.be.true;
      expect(transaction.debug.disableRollbackAndCommit).to.be.false;
      expect(transaction.debug.id).to.not.be.undefined;
      expect(transaction.autoRollback).to.be.false;
      expect(transaction.suppressErrorLogging).to.be.false;
      expect(transaction.enableTracing).to.be.false;
      expect(transaction.debug.queryExecutionCount).to.equal(2);

      await expectErrorType("NO_TRANSACTION_IN_PROGRESS", async function() {
        await transaction.executeQuery(query`select 2`);
      });

      await expectErrorType("NO_TRANSACTION_IN_PROGRESS", async function() {
        await transaction.commit();
      });

      await expectErrorType("NO_TRANSACTION_IN_PROGRESS", async function() {
        await transaction.rollback();
      });
    });

    it("should allow queries then rollback", async function() {
      const transactionHelper = transactionFactory(dbStub);
      expect(transactionHelper).to.be.a("function");
      const transaction = await transactionHelper({
        autoRollback: false,
        enableQueryLogging: true
      });

      expect(transaction.debug.queryLog[0]).to.equal("begin;");

      await transaction.executeQuery(query`select 1;`);
      expect(transaction.debug.queryLog[1]).to.equal("select 1;");

      await transaction.executeQuery(query`select current_timestamp;`);
      expect(transaction.debug.queryLog[2]).to.equal(
        "select current_timestamp;"
      );

      await transaction.rollback();
      expect(transaction.debug.queryLog[3]).to.equal("rollback;");
    });

    it("should allow you to validate a transaction", async function() {
      const transactionHelper = transactionFactory(dbStub);
      expect(transactionHelper).to.be.a("function");
      const transaction = await transactionHelper({
        autoRollback: false
      });

      expect(validateTransaction(transaction)).to.be.undefined;

      await expectErrorType("INVALID_TRANSACTION", async function() {
        validateTransaction(undefined);
      });

      await expectErrorType("INVALID_TRANSACTION", async function() {
        validateTransaction({});
      });
    });

    it("should allow you to provide a preamble", async function() {
      const transactionHelper = transactionFactory(dbStub);
      expect(transactionHelper).to.be.a("function");
      const transaction = await transactionHelper({
        autoRollback: false,
        enableQueryLogging: true,
        enableConsoleTracing: true,
        preamble: [`SET LOCAL foo = 'bar'`]
      });

      await transaction.executeQuery(query`select current_timestamp;`);
      await transaction.rollback();

      expect(transaction.debug.queryLog).to.deep.equal([
        "begin;",
        "SET LOCAL foo = 'bar'",
        "select current_timestamp;",
        "rollback;"
      ]);
    });

    it("should allow you to provide a query object as a preamble", async function() {
      const transactionHelper = transactionFactory(dbStub);
      expect(transactionHelper).to.be.a("function");
      const transaction = await transactionHelper({
        autoRollback: false,
        enableQueryLogging: true,
        enableConsoleTracing: false,
        preamble: [query`SET LOCAL bar = ${param("foo", "foo")}`]
      });

      await transaction.executeQuery(query`select current_timestamp;`);
      await transaction.rollback();

      expect(transaction.debug.queryLog).to.deep.equal([
        "begin;",
        "SET LOCAL bar = 'foo'",
        "select current_timestamp;",
        "rollback;"
      ]);
    });

    it("should handle errors properly when exceptions thrown when creating the connection", async function() {
      const dbStub = {
        _pool: {
          connect: async function() {
            throw new Error("unit test error intentionally thrown");
          }
        }
      };

      const transactionHelper = transactionFactory(dbStub);
      expect(transactionHelper).to.be.a("function");

      let expectedError: any = undefined;
      try {
        const transaction = await transactionHelper({
          autoRollback: false,
          enableQueryLogging: true,
          enableConsoleTracing: false,
          preamble: [query`SET LOCAL bar = bar`]
        });
      } catch (err) {
        expectedError = err;
      }
      expect(expectedError.message).to.equal(
        "unit test error intentionally thrown"
      );
    });

    it("should handle errors properly when exceptions thrown during preamble", async function() {
      const dbStub = {
        _pool: {
          connect: async function() {
            return {
              query: async function(q: any) {
                if (q.text.includes(`THROW_ERR`)) {
                  throw new Error("unit test error intentionally thrown");
                }
                return [];
              },
              release: async function() {}
            };
          }
        }
      };

      const transactionHelper = transactionFactory(dbStub);
      expect(transactionHelper).to.be.a("function");

      let expectedError: any = undefined;
      try {
        const transaction = await transactionHelper({
          autoRollback: false,
          enableQueryLogging: true,
          enableConsoleTracing: true,
          preamble: [query`SET LOCAL bar = bar /* THROW_ERR */`]
        });
      } catch (err) {
        expectedError = err;
      }
      expect(expectedError.message).to.equal(
        "unit test error intentionally thrown"
      );
    });

    it("should not enable query logging by default", async function() {
      const transactionHelper = transactionFactory(dbStub);
      expect(transactionHelper).to.be.a("function");
      const transaction = await transactionHelper({});

      await transaction.executeQuery(
        query`select current_timestamp, ${param("foo", "bar")};`
      );
      await transaction.rollback();

      expect(transaction.debug.enableQueryLogging).to.be.false;
      expect(transaction.debug.queryLog).to.be.empty;
    });

    it("should allow you to autoRollback instead of commit", async function() {
      const transactionHelper = transactionFactory(dbStub);
      expect(transactionHelper).to.be.a("function");
      const transaction = await transactionHelper({
        autoRollback: true,
        enableQueryLogging: true
      });

      await transaction.executeQuery(
        query`select current_timestamp, ${param("foo", "bar")};`
      );
      await transaction.commit();

      expect(transaction.debug.queryLog).to.deep.equal([
        "begin;",
        "select current_timestamp, 'bar';",
        "rollback;"
      ]);
    });

    it("should allow you to disable rollback and commit for use in unit testing", async function() {
      const transactionHelper = transactionFactory(dbStub);
      expect(transactionHelper).to.be.a("function");
      const transaction = await transactionHelper({ enableQueryLogging: true });

      transaction.debug.disableRollbackAndCommit = true;

      await transaction.executeQuery(
        query`select current_timestamp, ${param("foo", "bar")};`
      );
      await transaction.rollback();

      expect(transaction.debug.queryLog).to.deep.equal([
        "begin;",
        "select current_timestamp, 'bar';"
      ]);

      await transaction.commit();
      expect(transaction.debug.queryLog).to.deep.equal([
        "begin;",
        "select current_timestamp, 'bar';"
      ]);

      transaction.debug.disableRollbackAndCommit = false;

      await transaction.commit();
      expect(transaction.debug.queryLog).to.deep.equal([
        "begin;",
        "select current_timestamp, 'bar';",
        "commit;"
      ]);
    });

    it("should handle a query error", async function() {
      const dbStub = {
        _pool: {
          connect: async function() {
            return {
              query: async function(q: any) {
                if (q.text.includes(`THROW_ERR`)) {
                  throw new Error("unit test error intentionally thrown");
                }
                return [];
              },
              release: async function() {}
            };
          }
        }
      };

      const transactionHelper = transactionFactory(dbStub);
      expect(transactionHelper).to.be.a("function");
      const transaction = await transactionHelper({});

      expect(transaction.debug.enableQueryLogging).to.be.false;
      transaction.debug.enableQueryLogging = true;
      expect(transaction.debug.enableQueryLogging).to.be.true;

      let expectedError1: any = undefined;
      try {
        await transaction.executeQuery(query`select 1 /* THROW_ERR */;`);
      } catch (err) {
        expectedError1 = err;
      }
      expect(expectedError1.message).to.equal(
        "unit test error intentionally thrown"
      );

      expect(transaction.autoRollback).to.be.false;

      expect(transaction.debug.queryLog).to.deep.equal([
        // no begin, because we didn't enable query logging until after the transaction had started.
        "select 1 /* THROW_ERR */;",
        "rollback;"
      ]);

      transaction.debug.dumpQueries();
    });

    it("should handle a commit error", async function() {
      let wasReleaseCalled = false;
      const dbStub = {
        _pool: {
          connect: async function() {
            return {
              query: async function(q: any) {
                if (q.text.includes(`commit;`)) {
                  throw new Error("unit test error intentionally thrown");
                }
                return [];
              },
              release: async function() {
                wasReleaseCalled = true;
              }
            };
          }
        }
      };

      const transactionHelper = transactionFactory(dbStub);
      expect(transactionHelper).to.be.a("function");
      const transaction = await transactionHelper({});

      expect(transaction.debug.enableQueryLogging).to.be.false;
      transaction.debug.enableQueryLogging = true;
      expect(transaction.debug.enableQueryLogging).to.be.true;

      await transaction.executeQuery(query`select 1;`);

      let expectedError1: any = undefined;
      try {
        await transaction.commit();
      } catch (err) {
        expectedError1 = err;
      }
      expect(expectedError1.message).to.equal(
        "unit test error intentionally thrown"
      );

      expect(transaction.autoRollback).to.be.false;

      expect(transaction.debug.queryLog).to.deep.equal([
        // no begin, because we didn't enable query logging until after the transaction had started.
        "select 1;",
        "rollback;"
      ]);

      expect(wasReleaseCalled).to.be.true;
      expect(transaction.debug.isTransactionInProgress).to.be.false;
      expect(transaction.debug.transactionState).to.equal("ROLLED_BACK");
      expect(transaction.debug.wasRollbackCalled).to.be.false;
      expect(transaction.debug.wasCommitCalled).to.be.true;
    });

    it("should handle a rollback error", async function() {
      let wasReleaseCalled = false;
      const dbStub = {
        _pool: {
          connect: async function() {
            return {
              query: async function(q: any) {
                if (q.text.includes(`rollback;`)) {
                  throw new Error("unit test error intentionally thrown");
                }
                return [];
              },
              release: async function() {
                wasReleaseCalled = true;
              }
            };
          }
        }
      };

      const transactionHelper = transactionFactory(dbStub);
      expect(transactionHelper).to.be.a("function");
      const transaction = await transactionHelper({
        enableQueryLogging: true,
        enableConsoleTracing: true
      });

      expect(transaction.debug.enableQueryLogging).to.be.true;

      await transaction.executeQuery(query`select 1;`);

      let expectedError1: any = undefined;
      try {
        await transaction.rollback();
      } catch (err) {
        expectedError1 = err;
      }
      expect(expectedError1.message).to.equal(
        "unit test error intentionally thrown"
      );

      expect(transaction.autoRollback).to.be.false;

      expect(transaction.debug.queryLog).to.deep.equal(["begin;", "select 1;"]);

      expect(transaction.debug.isTransactionInProgress).to.be.false;
      expect(transaction.debug.transactionState).to.equal("FAILED_TO_ROLLBACK");
      expect(transaction.debug.wasRollbackCalled).to.be.true;
      expect(transaction.debug.wasCommitCalled).to.be.false;
      expect(wasReleaseCalled).to.be.true;
    });
  });
});
