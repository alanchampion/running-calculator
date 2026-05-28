(function () {
  "use strict";

  var calculatorCore = window.CalculatorCore;
  var calculatorStage = document.getElementById("calculator-stage");
  var expressionInput = document.getElementById("expression");
  var resultOutput = document.getElementById("result");
  var statusMessage = document.getElementById("status-message");
  var historyDrawer = document.getElementById("history-drawer");
  var historyToggle = document.getElementById("history-toggle");
  var historyPanel = document.getElementById("history-panel");
  var historyList = document.getElementById("history-list");
  var historyEmptyState = document.getElementById("history-empty");
  var keypad = document.querySelector(".keypad");
  var parenthesisButton = keypad.querySelector('[data-action="parenthesis"]');
  var phoneKeyboardMedia =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(hover: none) and (pointer: coarse) and (max-width: 768px)")
      : null;
  var historyEntries = [];
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

  function renderHistory() {
    historyList.textContent = "";
    historyEmptyState.hidden = historyEntries.length > 0;

    for (var index = 0; index < historyEntries.length; index += 1) {
      var entry = historyEntries[index];
      var item = document.createElement("li");
      var expression = document.createElement("p");
      var result = document.createElement("p");

      item.className = "history-list__item";
      expression.className = "history-list__expression";
      expression.textContent = entry.expression;
      result.className = "history-list__result";
      result.textContent = "= " + calculatorCore.formatNumber(entry.value);

      item.append(expression, result);
      historyList.append(item);
    }
  }

  function addHistoryEntry(expression, value) {
    historyEntries.unshift({
      expression: expression,
      value: value
    });
    renderHistory();

    if (historyEntries.length === 1) {
      setHistoryOpen(true);
    }
  }

  function syncHistoryDrawer() {
    var isOpen = !historyPanel.hidden;
    var openState = String(isOpen);

    calculatorStage.dataset.historyOpen = openState;
    historyDrawer.dataset.open = openState;
    historyToggle.setAttribute("aria-expanded", openState);
    historyToggle.setAttribute(
      "aria-label",
      isOpen ? "Collapse history" : "Expand history"
    );
  }

  function setHistoryOpen(nextOpen) {
    historyPanel.hidden = !nextOpen;
    syncHistoryDrawer();
  }

  function syncPhoneInputMode() {
    var hidePhoneKeyboard = !!(phoneKeyboardMedia && phoneKeyboardMedia.matches);

    expressionInput.readOnly = hidePhoneKeyboard;
    expressionInput.setAttribute("inputmode", hidePhoneKeyboard ? "none" : "text");
    expressionInput.setAttribute(
      "aria-label",
      hidePhoneKeyboard
        ? "Expression. Use the calculator buttons to enter values on mobile."
        : "Expression"
    );
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

    var committedExpression = expressionInput.value.trim();
    var nextValue = String(state.value);

    addHistoryEntry(committedExpression, state.value);
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
  historyToggle.addEventListener("click", function () {
    setHistoryOpen(historyPanel.hidden);
  });

  if (phoneKeyboardMedia) {
    if (typeof phoneKeyboardMedia.addEventListener === "function") {
      phoneKeyboardMedia.addEventListener("change", syncPhoneInputMode);
    } else if (typeof phoneKeyboardMedia.addListener === "function") {
      phoneKeyboardMedia.addListener(syncPhoneInputMode);
    }
  }

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

  setHistoryOpen(false);
  renderHistory();
  syncPhoneInputMode();
  updateDisplay();
})();
