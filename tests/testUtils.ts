import { QueryUtilsError } from "../src/queryUtils";
import { expect } from "chai";

export async function expectErrorType(expectedType: string, fn: Function) {
  if (typeof fn === "function") {
    let expectedErr: undefined | QueryUtilsError;
    try {
      await fn();
    } catch (err) {
      expectedErr = err as QueryUtilsError;
    }

    if (!(expectedErr instanceof QueryUtilsError)) {
      const e = new Error();
      console.log(e.stack);
      expect(expectedErr).to.be.instanceOf(
        QueryUtilsError,
        "this means the expected error was not thrown"
      );
    } else {
      if (expectedErr.type !== expectedType) {
        console.log(expectedErr.stack);
        expect(expectedErr.type).to.equal(expectedType);
      }
    }
  }
}
