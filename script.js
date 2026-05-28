(function () {
  "use strict";

  var calculatorCore = window.CalculatorCore;
  var expressionInput = document.getElementById("expression");
  var resultOutput = document.getElementById("result");
  var statusMessage = document.getElementById("status-message");
  var keypad = document.querySelector(".keypad");
  var parenthesisButton = keypad.querySelector('[data-action="parenthesis"]');
  var lastValidValue = 0;

  function setStatus(message, tone) {
    statusMessage.textContent = message;
    statusMessage.classList.remove("is-warning", "is-error");

    if (tone === "warning") {
      statusMessage.classList.add("is-warning");
    }

    if (tone === "error") {
      statusMessage.classList.add("is-error");
    }
  }

  function syncParenthesisButton() {
    var start = expressionInput.selectionStart;
    var end = expressionInput.selectionEnd;
    var expressionWithoutSelection =
      expressionInput.value.slice(0, start) +
      expressionInput.value.slice(end);
    var nextParenthesis =
      calculatorCore.getSmartParenthesisValue(expressionWithoutSelection, start);

    parenthesisButton.disabled = !nextParenthesis;
    parenthesisButton.setAttribute(
      "aria-label",
      nextParenthesis === ")"
        ? "Insert closing parenthesis"
        : nextParenthesis === "("
          ? "Insert opening parenthesis"
          : "No parenthesis fits here"
    );
  }

  function updateDisplay() {
    var state = calculatorCore.getExpressionState(expressionInput.value);

    if (state.status === "valid") {
      lastValidValue = state.value;
      resultOutput.textContent = calculatorCore.formatNumber(state.value);
      setStatus(state.message, "success");
    } else if (state.status === "empty") {
      lastValidValue = 0;
      resultOutput.textContent = "0";
      setStatus("Start typing to calculate.");
    } else {
      resultOutput.textContent = calculatorCore.formatNumber(lastValidValue);

      if (state.status === "incomplete") {
        setStatus(state.message, "warning");
      } else {
        setStatus(state.message, "error");
      }
    }

    syncParenthesisButton();
  }

  function replaceSelection(value) {
    var start = expressionInput.selectionStart;
    var end = expressionInput.selectionEnd;
    var existing = expressionInput.value;

    expressionInput.value =
      existing.slice(0, start) +
      value +
      existing.slice(end);

    var cursor = start + value.length;
    expressionInput.setSelectionRange(cursor, cursor);
    expressionInput.focus();
    updateDisplay();
  }

  function removeCharacter() {
    var start = expressionInput.selectionStart;
    var end = expressionInput.selectionEnd;

    if (start === 0 && end === 0) {
      return;
    }

    if (start !== end) {
      replaceSelection("");
      return;
    }

    expressionInput.value =
      expressionInput.value.slice(0, start - 1) +
      expressionInput.value.slice(end);

    var cursor = start - 1;
    expressionInput.setSelectionRange(cursor, cursor);
    expressionInput.focus();
    updateDisplay();
  }

  function clearExpression() {
    expressionInput.value = "";
    expressionInput.focus();
    updateDisplay();
  }

  function insertSmartParenthesis() {
    var start = expressionInput.selectionStart;
    var end = expressionInput.selectionEnd;
    var expressionWithoutSelection =
      expressionInput.value.slice(0, start) +
      expressionInput.value.slice(end);
    var nextParenthesis =
      calculatorCore.getSmartParenthesisValue(expressionWithoutSelection, start);

    if (!nextParenthesis) {
      syncParenthesisButton();
      return;
    }

    replaceSelection(nextParenthesis);
  }

  function commitResult() {
    var state = calculatorCore.getExpressionState(expressionInput.value);

    if (state.status !== "valid") {
      updateDisplay();
      return;
    }

    var nextValue = String(state.value);
    expressionInput.value = nextValue;
    expressionInput.setSelectionRange(nextValue.length, nextValue.length);
    expressionInput.focus();
    updateDisplay();
  }

  expressionInput.addEventListener("input", updateDisplay);
  expressionInput.addEventListener("click", syncParenthesisButton);
  expressionInput.addEventListener("focus", syncParenthesisButton);
  expressionInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitResult();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      clearExpression();
    }
  });
  expressionInput.addEventListener("keyup", syncParenthesisButton);
  expressionInput.addEventListener("select", syncParenthesisButton);

  keypad.addEventListener("click", function (event) {
    var target = event.target;

    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    var action = target.dataset.action;
    var value = target.dataset.value;

    if (action === "clear") {
      clearExpression();
      return;
    }

    if (action === "backspace") {
      removeCharacter();
      return;
    }

    if (action === "parenthesis") {
      insertSmartParenthesis();
      return;
    }

    if (action === "evaluate") {
      commitResult();
      return;
    }

    if (value) {
      replaceSelection(value);
    }
  });

  updateDisplay();
})();
