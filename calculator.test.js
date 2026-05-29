const test = require("node:test");
const assert = require("node:assert/strict");

const calculator = require("./calculator.js");

test("keeps large integer powers exact", function () {
  assert.equal(
    calculator.evaluateExpression("111111111^2"),
    "12345678987654321"
  );
});

test("removes decimal subtraction artifacts", function () {
  assert.equal(
    calculator.evaluateExpression("5288.44-188.6"),
    "5099.84"
  );
});

test("keeps decimal addition exact through the public state api", function () {
  assert.deepEqual(
    calculator.getExpressionState("0.1+0.2"),
    {
      status: "valid",
      value: "0.3",
      message: "Live result is current."
    }
  );
});

test("formats large values without losing digits", function () {
  assert.equal(
    calculator.formatNumber("12345678987654321"),
    "12,345,678,987,654,321"
  );
});

test("serializes recurring decimals to twelve fractional digits", function () {
  assert.equal(
    calculator.serializeNumber(calculator.evaluateExpression("1/3")),
    "0.333333333333"
  );
});
