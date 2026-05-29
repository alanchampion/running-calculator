(function (global) {
  "use strict";

  var DecimalSource = global.Decimal;
  var MAX_SERIALIZED_DECIMAL_PLACES = 12;
  var OPERATORS = {
    "+": { precedence: 1 },
    "-": { precedence: 1 },
    "*": { precedence: 2 },
    "/": { precedence: 2 },
    "^": { precedence: 3 }
  };

  if (!DecimalSource && typeof require === "function") {
    try {
      DecimalSource = require("./vendor/decimal.min.js");
    } catch (error) {
      DecimalSource = null;
    }
  }

  if (!DecimalSource || typeof DecimalSource.clone !== "function") {
    throw new Error("decimal.js is required for CalculatorCore.");
  }

  var Decimal = DecimalSource.clone({
    precision: 50,
    toExpNeg: -1000,
    toExpPos: 1000
  });

  function createError(message, code) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  function isOperatorCharacter(character) {
    return character === "+" || character === "-" ||
      character === "*" || character === "/" || character === "^";
  }

  function getPreviousMeaningfulCharacter(expression, cursorPosition) {
    for (var index = cursorPosition - 1; index >= 0; index -= 1) {
      if (!/\s/.test(expression[index])) {
        return expression[index];
      }
    }

    return "";
  }

  function getNextMeaningfulCharacter(expression, cursorPosition) {
    for (var index = cursorPosition; index < expression.length; index += 1) {
      if (!/\s/.test(expression[index])) {
        return expression[index];
      }
    }

    return "";
  }

  function getParenthesisBalance(expression, cursorPosition) {
    var balance = 0;

    for (var index = 0; index < cursorPosition; index += 1) {
      if (expression[index] === "(") {
        balance += 1;
      }

      if (expression[index] === ")") {
        balance -= 1;
      }
    }

    return balance;
  }

  function endsWithNumber(expressionSegment) {
    return /(?:\d+\.?\d*|\.\d+)\s*$/.test(expressionSegment);
  }

  function startsWithNumber(expressionSegment) {
    return /^\s*(?:\d+\.?\d*|\.\d+)/.test(expressionSegment);
  }

  function isValueCharacter(character) {
    return /[0-9.]/.test(character) || character === ")";
  }

  function shouldInsertImplicitMultiplication(previousToken, nextToken) {
    if (!previousToken) {
      return false;
    }

    var previousIsNumber = previousToken.type === "number";
    var previousIsClosingParenthesis =
      previousToken.type === "paren" && previousToken.value === ")";
    var nextIsNumber = nextToken.type === "number";
    var nextIsOpeningParenthesis =
      nextToken.type === "paren" && nextToken.value === "(";

    return (previousIsNumber && nextIsOpeningParenthesis) ||
      (previousIsClosingParenthesis && (nextIsOpeningParenthesis || nextIsNumber));
  }

  function pushToken(tokens, nextToken) {
    var previousToken = tokens[tokens.length - 1];

    if (shouldInsertImplicitMultiplication(previousToken, nextToken)) {
      tokens.push({ type: "operator", value: "*" });
    }

    tokens.push(nextToken);
  }

  function getSmartParenthesisValue(expression, cursorPosition) {
    var safeCursorPosition =
      typeof cursorPosition === "number"
        ? Math.max(0, Math.min(expression.length, cursorPosition))
        : expression.length;
    var prefix = expression.slice(0, safeCursorPosition);
    var suffix = expression.slice(safeCursorPosition);
    var previousCharacter = getPreviousMeaningfulCharacter(expression, safeCursorPosition);
    var nextCharacter = getNextMeaningfulCharacter(expression, safeCursorPosition);
    var balance = getParenthesisBalance(expression, safeCursorPosition);
    var canOpen = !previousCharacter ||
      isOperatorCharacter(previousCharacter) ||
      previousCharacter === "(" ||
      (isValueCharacter(previousCharacter) &&
        (!nextCharacter || nextCharacter === "(" || startsWithNumber(suffix)));
    var canClose = balance > 0 &&
      (endsWithNumber(prefix) || previousCharacter === ")") &&
      (!nextCharacter || isOperatorCharacter(nextCharacter) ||
        nextCharacter === ")" || nextCharacter === "(" || startsWithNumber(suffix));

    if (canClose) {
      return ")";
    }

    if (canOpen) {
      return "(";
    }

    return null;
  }

  function tokenize(expression) {
    var tokens = [];
    var index = 0;

    while (index < expression.length) {
      var character = expression[index];

      if (/\s/.test(character)) {
        index += 1;
        continue;
      }

      if (/[0-9.]/.test(character)) {
        var start = index;
        var hasDecimal = character === ".";

        index += 1;

        while (index < expression.length && /[0-9.]/.test(expression[index])) {
          if (expression[index] === ".") {
            if (hasDecimal) {
              throw createError("Numbers can only contain one decimal point.", "INVALID");
            }

            hasDecimal = true;
          }

          index += 1;
        }

        var value = expression.slice(start, index);

        if (value === ".") {
          throw createError("A decimal point needs digits around it.", "INCOMPLETE");
        }

        pushToken(tokens, { type: "number", value: value });
        continue;
      }

      if (OPERATORS[character]) {
        pushToken(tokens, { type: "operator", value: character });
        index += 1;
        continue;
      }

      if (character === "(" || character === ")") {
        pushToken(tokens, { type: "paren", value: character });
        index += 1;
        continue;
      }

      throw createError("Unsupported character: " + character, "INVALID");
    }

    return tokens;
  }

  function parse(tokens) {
    var index = 0;

    function currentToken() {
      return tokens[index];
    }

    function parseExpression() {
      var value = parseTerm();

      while (currentToken() && currentToken().type === "operator" &&
        (currentToken().value === "+" || currentToken().value === "-")) {
        var operator = currentToken().value;
        index += 1;
        var right = parseTerm();
        value = operator === "+" ? value.plus(right) : value.minus(right);
      }

      return value;
    }

    function parseTerm() {
      var value = parseUnary();

      while (currentToken() && currentToken().type === "operator" &&
        (currentToken().value === "*" || currentToken().value === "/")) {
        var operator = currentToken().value;
        index += 1;
        var right = parseUnary();

        if (operator === "/") {
          if (right.isZero()) {
            throw createError("Cannot divide by zero.", "INVALID");
          }

          value = value.div(right);
        } else {
          value = value.times(right);
        }
      }

      return value;
    }

    function parseUnary() {
      var token = currentToken();

      if (token && token.type === "operator" &&
        (token.value === "+" || token.value === "-")) {
        index += 1;
        var unaryValue = parseUnary();
        return token.value === "-" ? unaryValue.negated() : unaryValue;
      }

      return parsePower();
    }

    function parsePower() {
      var value = parsePrimary();
      var token = currentToken();

      if (token && token.type === "operator" && token.value === "^") {
        index += 1;
        value = Decimal.pow(value, parseUnary());
      }

      return value;
    }

    function parsePrimary() {
      var token = currentToken();

      if (!token) {
        throw createError("Expression is incomplete.", "INCOMPLETE");
      }

      if (token.type === "number") {
        index += 1;
        return createDecimal(token.value);
      }

      if (token.type === "paren" && token.value === "(") {
        index += 1;
        var value = parseExpression();
        var closingToken = currentToken();

        if (!closingToken) {
          throw createError("Missing a closing parenthesis.", "INCOMPLETE");
        }

        if (closingToken.type !== "paren" || closingToken.value !== ")") {
          throw createError("Expected a closing parenthesis.", "INVALID");
        }

        index += 1;
        return value;
      }

      if (token.type === "paren" && token.value === ")") {
        throw createError("Closing parenthesis does not have a match.", "INVALID");
      }

      throw createError("Unexpected token: " + token.value, "INVALID");
    }

    var result = parseExpression();

    if (index < tokens.length) {
      var leftover = tokens[index];

      if (leftover.type === "paren" && leftover.value === ")") {
        throw createError("Closing parenthesis does not have a match.", "INVALID");
      }

      if (leftover.type === "operator") {
        throw createError("Expression is incomplete.", "INCOMPLETE");
      }

      throw createError("Unexpected token: " + leftover.value, "INVALID");
    }

    return result;
  }

  function normalizeDecimal(value) {
    var decimalValue = value;

    try {
      if (!Decimal.isDecimal(decimalValue)) {
        decimalValue = new Decimal(decimalValue);
      }
    } catch (error) {
      throw createError("The result is not a finite number.", "INVALID");
    }

    if (decimalValue.isNaN()) {
      throw createError("The result is not a real number.", "INVALID");
    }

    if (!decimalValue.isFinite()) {
      throw createError("The result is not a finite number.", "INVALID");
    }

    return decimalValue.isZero() ? new Decimal(0) : decimalValue;
  }

  function createDecimal(value) {
    return normalizeDecimal(value);
  }

  function trimSerializedNumber(value) {
    if (value.indexOf(".") === -1) {
      return value === "-0" ? "0" : value;
    }

    var trimmedValue = value.replace(/0+$/, "").replace(/\.$/, "");
    return trimmedValue === "-0" ? "0" : trimmedValue;
  }

  function serializeExactDecimal(value) {
    var decimalValue = normalizeDecimal(value);

    if (decimalValue.isZero()) {
      return "0";
    }

    return trimSerializedNumber(decimalValue.toString());
  }

  function serializeRoundedDecimal(value) {
    var decimalValue = normalizeDecimal(value);

    if (decimalValue.isZero()) {
      return "0";
    }

    return trimSerializedNumber(decimalValue.toFixed(MAX_SERIALIZED_DECIMAL_PLACES));
  }

  function addThousandsSeparators(integerPart) {
    return integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function formatSerializedNumber(value) {
    var sign = "";
    var normalizedValue = value;
    var parts = null;
    var integerPart = "";
    var fractionalPart = "";

    if (normalizedValue[0] === "-") {
      sign = "-";
      normalizedValue = normalizedValue.slice(1);
    }

    parts = normalizedValue.split(".");
    integerPart = parts[0] || "0";
    fractionalPart = parts[1] ? "." + parts[1] : "";

    return sign + addThousandsSeparators(integerPart) + fractionalPart;
  }

  function serializeNumber(value) {
    return serializeRoundedDecimal(value);
  }

  function evaluateExpression(expression) {
    if (expression.trim() === "") {
      throw createError("Expression is empty.", "EMPTY");
    }

    var tokens = tokenize(expression);
    return serializeExactDecimal(parse(tokens));
  }

  function formatNumber(value) {
    return formatSerializedNumber(serializeNumber(value));
  }

  function getExpressionState(expression) {
    if (expression.trim() === "") {
      return {
        status: "empty",
        message: "Start typing to calculate."
      };
    }

    try {
      return {
        status: "valid",
        value: evaluateExpression(expression),
        message: "Live result is current."
      };
    } catch (error) {
      if (error && error.code === "INCOMPLETE") {
        return {
          status: "incomplete",
          message: error.message
        };
      }

      if (error && error.code === "EMPTY") {
        return {
          status: "empty",
          message: error.message
        };
      }

      return {
        status: "invalid",
        message: error && error.message ? error.message : "Expression is invalid."
      };
    }
  }

  var api = {
    evaluateExpression: evaluateExpression,
    formatNumber: formatNumber,
    getExpressionState: getExpressionState,
    getSmartParenthesisValue: getSmartParenthesisValue,
    serializeNumber: serializeNumber
  };

  global.CalculatorCore = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
