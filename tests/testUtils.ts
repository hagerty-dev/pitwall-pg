import { PitwallError } from "../src/pitwall-pg";
import { expect } from "chai";

export async function expectErrorType(expectedType: string, fn: Function) {
  if (typeof fn === "function") {
    let expectedErr: undefined | PitwallError;
    try {
      await fn();
    } catch (err) {
      expectedErr = err as PitwallError;
    }

    if (!(expectedErr instanceof PitwallError)) {
      const e = new Error();
      console.log(e.stack);
      expect(expectedErr).to.be.instanceOf(
        PitwallError,
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
