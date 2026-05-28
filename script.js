(function () {
  "use strict";

  var calculatorCore = window.CalculatorCore;
  var calculatorStage = document.getElementById("calculator-stage");
  var expressionPanel = document.getElementById("expression-panel");
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
  var expressionScrollTimeoutId = null;
  var savedSelectionStart = 0;
  var savedSelectionEnd = 0;
  var HISTORY_STORAGE_KEY = "running-calculator-history";
  var historyEntries = [];
  var historyStorage = null;
  var hasResolvedHistoryStorage = false;
  var lastValidValue = 0;

  function registerServiceWorker() {
    var host = window.location.hostname;
    var isLocalhost =
      host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    var isSupportedProtocol = window.location.protocol === "https:" ||
      (window.location.protocol === "http:" && isLocalhost);

    if (!("serviceWorker" in navigator) || !isSupportedProtocol) {
      return;
    }

    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function (error) {
        console.error("Service worker registration failed.", error);
      });
    });
  }

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

  function getHistoryStorage() {
    if (hasResolvedHistoryStorage) {
      return historyStorage;
    }

    hasResolvedHistoryStorage = true;

    try {
      historyStorage = window.localStorage;
    } catch (error) {
      console.error("Calculation history storage is unavailable.", error);
      historyStorage = null;
    }

    return historyStorage;
  }

  function clearSavedHistory() {
    var storage = getHistoryStorage();

    if (!storage) {
      return;
    }

    try {
      storage.removeItem(HISTORY_STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear saved calculation history.", error);
    }
  }

  function isValidHistoryEntry(entry) {
    return !!entry &&
      typeof entry.expression === "string" &&
      entry.expression.trim() !== "" &&
      typeof entry.value === "number" &&
      isFinite(entry.value);
  }

  function saveHistory() {
    var storage = getHistoryStorage();

    if (!storage) {
      return;
    }

    try {
      storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyEntries));
    } catch (error) {
      console.error("Failed to save calculation history.", error);
    }
  }

  function loadHistory() {
    var storage = getHistoryStorage();
    var savedHistory = null;
    var parsedHistory = null;
    var nextHistoryEntries = [];
    var foundInvalidEntries = false;

    if (!storage) {
      return;
    }

    try {
      savedHistory = storage.getItem(HISTORY_STORAGE_KEY);
    } catch (error) {
      console.error("Failed to read saved calculation history.", error);
      return;
    }

    if (!savedHistory) {
      return;
    }

    try {
      parsedHistory = JSON.parse(savedHistory);
    } catch (error) {
      console.error("Saved calculation history could not be parsed.", error);
      clearSavedHistory();
      return;
    }

    if (!Array.isArray(parsedHistory)) {
      console.error("Saved calculation history has an invalid format.");
      clearSavedHistory();
      return;
    }

    for (var index = 0; index < parsedHistory.length; index += 1) {
      var entry = parsedHistory[index];

      if (!isValidHistoryEntry(entry)) {
        foundInvalidEntries = true;
        continue;
      }

      nextHistoryEntries.push({
        expression: entry.expression,
        value: entry.value
      });
    }

    historyEntries = nextHistoryEntries;

    if (foundInvalidEntries) {
      console.error("Saved calculation history contained invalid entries and was repaired.");
      saveHistory();
    }
  }

  function renderHistory() {
    historyList.textContent = "";
    historyEmptyState.hidden = historyEntries.length > 0;

    for (var index = 0; index < historyEntries.length; index += 1) {
      var entry = historyEntries[index];
      var item = document.createElement("li");
      var expression = document.createElement("button");
      var result = document.createElement("button");

      item.className = "history-list__item";
      expression.type = "button";
      expression.className = "history-list__expression";
      expression.textContent = entry.expression;
      expression.dataset.historyValue = entry.expression;
      expression.setAttribute("aria-label", "Insert expression " + entry.expression);
      result.type = "button";
      result.className = "history-list__result";
      result.textContent = "= " + calculatorCore.formatNumber(entry.value);
      result.dataset.historyValue = getInsertableNumber(entry.value);
      result.setAttribute("aria-label", "Insert value " + result.dataset.historyValue);

      item.append(expression, result);
      historyList.append(item);
    }
  }

  function addHistoryEntry(expression, value) {
    historyEntries.unshift({
      expression: expression,
      value: value
    });
    saveHistory();
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

  function syncExpressionSelection() {
    var start =
      typeof expressionInput.selectionStart === "number"
        ? expressionInput.selectionStart
        : savedSelectionStart;
    var end =
      typeof expressionInput.selectionEnd === "number"
        ? expressionInput.selectionEnd
        : savedSelectionEnd;
    var maxLength = expressionInput.value.length;

    savedSelectionStart = Math.max(0, Math.min(maxLength, start));
    savedSelectionEnd = Math.max(savedSelectionStart, Math.min(maxLength, end));
  }

  function syncPhoneInputMode() {
    var isPhoneLayout = !!(phoneKeyboardMedia && phoneKeyboardMedia.matches);

    expressionInput.readOnly = isPhoneLayout;
    expressionInput.setAttribute("inputmode", isPhoneLayout ? "none" : "text");
    expressionInput.setAttribute(
      "aria-label",
      isPhoneLayout
        ? "Expression. Use the calculator buttons on mobile without opening the keyboard."
        : "Expression"
    );

    if (expressionInput.value.trim() === "") {
      setStatus(getEmptyStatusMessage());
    }
  }

  function getEmptyStatusMessage() {
    return phoneKeyboardMedia && phoneKeyboardMedia.matches
      ? "Use the calculator pad."
      : "Start typing to calculate.";
  }

  function performExpressionScroll() {
    var scrollTarget = expressionPanel || expressionInput;

    if (!(phoneKeyboardMedia && phoneKeyboardMedia.matches)) {
      return;
    }

    if (!scrollTarget) {
      return;
    }

    if (typeof scrollTarget.getBoundingClientRect === "function" &&
      typeof window.scrollTo === "function") {
      var rect = scrollTarget.getBoundingClientRect();
      var currentScrollTop =
        typeof window.pageYOffset === "number"
          ? window.pageYOffset
          : 0;
      var nextScrollTop = Math.max(0, currentScrollTop + rect.top - 12);

      window.scrollTo({
        top: nextScrollTop,
        behavior: "smooth"
      });
      return;
    }

    if (typeof scrollTarget.scrollIntoView !== "function") {
      return;
    }

    try {
      scrollTarget.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest"
      });
    } catch (error) {
      scrollTarget.scrollIntoView();
    }
  }

  function scrollExpressionIntoView() {
    performExpressionScroll();

    if (typeof window.setTimeout !== "function") {
      return;
    }

    if (expressionScrollTimeoutId !== null &&
      typeof window.clearTimeout === "function") {
      window.clearTimeout(expressionScrollTimeoutId);
    }

    expressionScrollTimeoutId = window.setTimeout(function () {
      expressionScrollTimeoutId = null;
      performExpressionScroll();
    }, 80);
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

  function getInsertableNumber(value) {
    return calculatorCore.formatNumber(value).replace(/,/g, "");
  }

  function updateDisplay() {
    syncExpressionSelection();

    var state = calculatorCore.getExpressionState(expressionInput.value);

    if (state.status === "valid") {
      lastValidValue = state.value;
      resultOutput.textContent = calculatorCore.formatNumber(state.value);
      setStatus(state.message, "success");
    } else if (state.status === "empty") {
      lastValidValue = 0;
      resultOutput.textContent = "0";
      setStatus(getEmptyStatusMessage());
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
    var start =
      typeof expressionInput.selectionStart === "number"
        ? expressionInput.selectionStart
        : savedSelectionStart;
    var end =
      typeof expressionInput.selectionEnd === "number"
        ? expressionInput.selectionEnd
        : savedSelectionEnd;
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

  function insertHistoryValue(value) {
    expressionInput.focus();
    expressionInput.setSelectionRange(savedSelectionStart, savedSelectionEnd);
    replaceSelection(value);
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
  expressionInput.addEventListener("click", function () {
    syncExpressionSelection();
    syncParenthesisButton();
    scrollExpressionIntoView();
  });
  expressionInput.addEventListener("focus", function () {
    syncExpressionSelection();
    syncParenthesisButton();
    scrollExpressionIntoView();
  });
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
  expressionInput.addEventListener("keyup", syncExpressionSelection);
  expressionInput.addEventListener("select", function () {
    syncExpressionSelection();
    syncParenthesisButton();
  });
  historyToggle.addEventListener("click", function () {
    setHistoryOpen(historyPanel.hidden);
  });
  historyList.addEventListener("click", function (event) {
    var target = event.target;

    if (!(target instanceof HTMLButtonElement) || !target.dataset.historyValue) {
      return;
    }

    insertHistoryValue(target.dataset.historyValue);
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
  loadHistory();
  renderHistory();
  registerServiceWorker();
  syncPhoneInputMode();
  updateDisplay();
})();
