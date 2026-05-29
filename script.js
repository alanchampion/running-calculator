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
  var historyClearButton = document.getElementById("history-clear");
  var savedToggle = document.getElementById("saved-toggle");
  var savedPanel = document.getElementById("saved-panel");
  var savedList = document.getElementById("saved-list");
  var savedEmptyState = document.getElementById("saved-empty");
  var savedClearButton = document.getElementById("saved-clear");
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
  var SAVED_STORAGE_KEY = "running-calculator-saved";
  var entryCollections = {
    history: {
      key: "history",
      title: "History",
      storageKey: HISTORY_STORAGE_KEY,
      toggle: historyToggle,
      panel: historyPanel,
      listElement: historyList,
      emptyStateElement: historyEmptyState,
      clearButton: historyClearButton,
      entries: []
    },
    saved: {
      key: "saved",
      title: "Saved",
      storageKey: SAVED_STORAGE_KEY,
      toggle: savedToggle,
      panel: savedPanel,
      listElement: savedList,
      emptyStateElement: savedEmptyState,
      clearButton: savedClearButton,
      entries: []
    }
  };
  var activeDrawerName = "";
  var menuPopover = null;
  var activeMenuCollectionName = "";
  var activeMenuIndex = -1;
  var activeMenuToggle = null;
  var historyStorage = null;
  var hasResolvedHistoryStorage = false;
  var lastValidValue = "0";

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

  function getCollection(collectionName) {
    return entryCollections[collectionName] || null;
  }

  function getCollectionLogLabel(collection) {
    return collection.key === "history"
      ? "calculation history"
      : "saved calculations";
  }

  function isCollectionDrawerAvailable(collection) {
    return !!(collection && collection.toggle && collection.panel);
  }

  function clearStoredEntries(collection) {
    var storage = getHistoryStorage();

    if (!storage) {
      return;
    }

    try {
      storage.removeItem(collection.storageKey);
    } catch (error) {
      console.error("Failed to clear saved " + getCollectionLogLabel(collection) + ".", error);
    }
  }

  function persistEntries(collection) {
    var storage = getHistoryStorage();

    if (!storage) {
      return;
    }

    if (collection.entries.length === 0) {
      clearStoredEntries(collection);
      return;
    }

    try {
      storage.setItem(collection.storageKey, JSON.stringify(collection.entries));
    } catch (error) {
      console.error("Failed to save " + getCollectionLogLabel(collection) + ".", error);
    }
  }

  function normalizeEntry(entry) {
    var normalizedValue = null;

    if (!entry ||
      typeof entry.expression !== "string" ||
      entry.expression.trim() === "") {
      return null;
    }

    try {
      normalizedValue = calculatorCore.serializeNumber(entry.value);
    } catch (error) {
      return null;
    }

    return {
      expression: entry.expression,
      value: normalizedValue
    };
  }

  function loadEntries(collection) {
    var storage = getHistoryStorage();
    var savedEntries = null;
    var parsedEntries = null;
    var nextEntries = [];
    var repairedEntries = false;

    if (!storage) {
      return;
    }

    try {
      savedEntries = storage.getItem(collection.storageKey);
    } catch (error) {
      console.error("Failed to read saved " + getCollectionLogLabel(collection) + ".", error);
      return;
    }

    if (!savedEntries) {
      return;
    }

    try {
      parsedEntries = JSON.parse(savedEntries);
    } catch (error) {
      console.error("Saved " + getCollectionLogLabel(collection) + " could not be parsed.", error);
      clearStoredEntries(collection);
      return;
    }

    if (!Array.isArray(parsedEntries)) {
      console.error("Saved " + getCollectionLogLabel(collection) + " has an invalid format.");
      clearStoredEntries(collection);
      return;
    }

    for (var index = 0; index < parsedEntries.length; index += 1) {
      var normalizedEntry = normalizeEntry(parsedEntries[index]);

      if (!normalizedEntry) {
        repairedEntries = true;
        continue;
      }

      if (normalizedEntry.value !== parsedEntries[index].value) {
        repairedEntries = true;
      }

      nextEntries.push(normalizedEntry);
    }

    collection.entries = nextEntries;

    if (repairedEntries) {
      console.error("Saved " + getCollectionLogLabel(collection) + " contained invalid entries and was repaired.");
      persistEntries(collection);
    }
  }

  function createEntryCopy(entry) {
    return {
      expression: entry.expression,
      value: entry.value
    };
  }

  function isSameEntry(leftEntry, rightEntry) {
    return !!leftEntry &&
      !!rightEntry &&
      leftEntry.expression === rightEntry.expression &&
      leftEntry.value === rightEntry.value;
  }

  function hasSavedEntry(entry) {
    var savedCollection = getCollection("saved");

    for (var index = 0; index < savedCollection.entries.length; index += 1) {
      if (isSameEntry(savedCollection.entries[index], entry)) {
        return true;
      }
    }

    return false;
  }

  function renderCollection(collection) {
    var listElement = collection.listElement;
    var emptyStateElement = collection.emptyStateElement;
    var clearButton = collection.clearButton;

    if (listElement) {
      listElement.textContent = "";
    }

    if (emptyStateElement) {
      emptyStateElement.hidden = collection.entries.length > 0;
    }

    if (clearButton) {
      clearButton.disabled = collection.entries.length === 0;
    }

    if (!listElement) {
      return;
    }

    for (var index = 0; index < collection.entries.length; index += 1) {
      var entry = collection.entries[index];
      var item = document.createElement("li");
      var row = document.createElement("div");
      var expression = document.createElement("button");
      var result = document.createElement("button");
      var menu = document.createElement("div");
      var menuToggle = document.createElement("button");

      item.className = "history-list__item";
      row.className = "history-list__row";
      expression.type = "button";
      expression.className = "history-list__expression";
      expression.textContent = entry.expression;
      expression.dataset.entryValue = entry.expression;
      expression.setAttribute("aria-label", "Insert expression " + entry.expression);
      result.type = "button";
      result.className = "history-list__result";
      result.textContent = "= " + calculatorCore.formatNumber(entry.value);
      result.dataset.entryValue = getInsertableNumber(entry.value);
      result.setAttribute("aria-label", "Insert value " + result.dataset.entryValue);
      menu.className = "history-list__menu";
      menu.dataset.collectionName = collection.key;
      menuToggle.className = "history-list__menu-toggle";
      menuToggle.type = "button";
      menuToggle.textContent = "...";
      menuToggle.dataset.entryMenu = "toggle";
      menuToggle.dataset.entryIndex = String(index);
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-haspopup", "menu");
      menuToggle.setAttribute("aria-label", collection.title + " item options for " + entry.expression);
      menu.append(menuToggle);
      row.append(expression, menu);
      item.append(row, result);
      listElement.append(item);
    }
  }

  function renderCollections() {
    renderCollection(getCollection("history"));
    renderCollection(getCollection("saved"));
  }

  function ensureMenuPopover() {
    if (menuPopover || !historyDrawer) {
      return;
    }

    menuPopover = document.createElement("div");
    menuPopover.className = "history-drawer__menu-popover";
    menuPopover.hidden = true;
    historyDrawer.append(menuPopover);
  }

  function getRectHeight(rect) {
    if (!rect || typeof rect.height !== "number") {
      return 0;
    }

    return rect.height;
  }

  function getRectWidth(rect) {
    if (!rect || typeof rect.width !== "number") {
      return 0;
    }

    return rect.width;
  }

  function isMenuToggleButton(target) {
    return !!(target && target.dataset && target.dataset.entryMenu === "toggle");
  }

  function isNodeWithin(node, ancestor) {
    while (node) {
      if (node === ancestor) {
        return true;
      }

      node = node.parentElement || null;
    }

    return false;
  }

  function getMenuPopoverHeight() {
    if (!menuPopover) {
      return 0;
    }

    if (typeof menuPopover.offsetHeight === "number" && menuPopover.offsetHeight > 0) {
      return menuPopover.offsetHeight;
    }

    if (typeof menuPopover.getBoundingClientRect === "function") {
      return getRectHeight(menuPopover.getBoundingClientRect());
    }

    return 0;
  }

  function getMenuPopoverWidth() {
    if (!menuPopover) {
      return 0;
    }

    if (typeof menuPopover.offsetWidth === "number" && menuPopover.offsetWidth > 0) {
      return menuPopover.offsetWidth;
    }

    if (typeof menuPopover.getBoundingClientRect === "function") {
      return getRectWidth(menuPopover.getBoundingClientRect());
    }

    return 0;
  }

  function setMenuToggleExpanded(menuToggle, isExpanded) {
    if (!menuToggle) {
      return;
    }

    menuToggle.setAttribute("aria-expanded", String(isExpanded));
  }

  function closeEntryMenu() {
    setMenuToggleExpanded(activeMenuToggle, false);
    activeMenuCollectionName = "";
    activeMenuIndex = -1;
    activeMenuToggle = null;

    if (!menuPopover) {
      return;
    }

    menuPopover.hidden = true;
    menuPopover.textContent = "";
    menuPopover.style.top = "";
    menuPopover.style.left = "";
    menuPopover.style.visibility = "";
  }

  function addMenuPopoverAction(label, className, actionName, ariaLabel, isDisabled) {
    var actionButton = document.createElement("button");

    actionButton.type = "button";
    actionButton.className = className;
    actionButton.textContent = label;
    actionButton.disabled = !!isDisabled;
    actionButton.dataset.entryAction = actionName;
    actionButton.setAttribute("aria-label", ariaLabel);
    menuPopover.append(actionButton);
  }

  function populateMenuPopover(collectionName, index) {
    var collection = getCollection(collectionName);
    var entry = collection && collection.entries[index];
    var isSavedAlready = false;

    if (!menuPopover || !collection || !entry) {
      return false;
    }

    menuPopover.textContent = "";
    menuPopover.setAttribute("aria-label", collection.title + " item options");

    if (collectionName === "history") {
      isSavedAlready = hasSavedEntry(entry);

      addMenuPopoverAction(
        isSavedAlready ? "Saved" : "Save",
        "history-list__menu-action history-list__menu-action--primary",
        "save",
        (isSavedAlready ? "Saved " : "Save ") + "history item " + entry.expression,
        isSavedAlready
      );
    }

    addMenuPopoverAction(
      "Delete",
      "history-list__menu-action",
      "delete",
      "Delete " + collection.title.toLowerCase() + " item " + entry.expression,
      false
    );

    return true;
  }

  function positionMenuPopover(menuToggle) {
    var drawerRect = null;
    var toggleRect = null;
    var popoverHeight = 0;
    var popoverWidth = 0;
    var margin = 12;
    var gap = 6;
    var nextTop = 0;
    var nextLeft = 0;
    var maxTop = 0;
    var maxLeft = 0;

    if (!historyDrawer ||
      !menuPopover ||
      typeof historyDrawer.getBoundingClientRect !== "function" ||
      !menuToggle ||
      typeof menuToggle.getBoundingClientRect !== "function") {
      return;
    }

    drawerRect = historyDrawer.getBoundingClientRect();
    toggleRect = menuToggle.getBoundingClientRect();
    popoverHeight = getMenuPopoverHeight();
    popoverWidth = getMenuPopoverWidth();
    maxTop = Math.max(margin, drawerRect.height - popoverHeight - margin);
    maxLeft = Math.max(margin, drawerRect.width - popoverWidth - margin);
    nextTop = toggleRect.bottom - drawerRect.top + gap;

    if (nextTop + popoverHeight > drawerRect.height - margin) {
      nextTop = toggleRect.top - drawerRect.top - popoverHeight - gap;
    }

    nextTop = Math.max(margin, Math.min(nextTop, maxTop));
    nextLeft = toggleRect.right - drawerRect.left - popoverWidth;
    nextLeft = Math.max(margin, Math.min(nextLeft, maxLeft));

    menuPopover.style.top = nextTop + "px";
    menuPopover.style.left = nextLeft + "px";
    menuPopover.style.visibility = "";
  }

  function openEntryMenu(collectionName, index, menuToggle) {
    ensureMenuPopover();

    if (!menuPopover) {
      return;
    }

    if (activeMenuCollectionName === collectionName &&
      activeMenuIndex === index &&
      activeMenuToggle === menuToggle &&
      !menuPopover.hidden) {
      closeEntryMenu();
      return;
    }

    closeEntryMenu();

    if (!populateMenuPopover(collectionName, index)) {
      return;
    }

    activeMenuCollectionName = collectionName;
    activeMenuIndex = index;
    activeMenuToggle = menuToggle;
    setMenuToggleExpanded(menuToggle, true);
    menuPopover.hidden = false;
    menuPopover.style.top = "0px";
    menuPopover.style.left = "0px";
    menuPopover.style.visibility = "hidden";
    positionMenuPopover(menuToggle);
  }

  function addHistoryEntry(expression, value) {
    var historyCollection = getCollection("history");
    var normalizedValue = calculatorCore.serializeNumber(value);

    historyCollection.entries.unshift({
      expression: expression,
      value: normalizedValue
    });
    persistEntries(historyCollection);
    renderCollection(historyCollection);

    if (historyCollection.entries.length === 1) {
      setDrawerView("history");
    }
  }

  function syncDrawerToggle(collection, isActive) {
    if (collection.panel) {
      collection.panel.hidden = !isActive;
    }

    if (!collection.toggle) {
      return;
    }

    collection.toggle.setAttribute("aria-expanded", String(isActive));
    collection.toggle.setAttribute(
      "aria-label",
      (isActive ? "Collapse " : "Expand ") + collection.title.toLowerCase() + (collection.key === "saved" ? " items" : "")
    );
  }

  function syncDrawerState() {
    var isOpen = activeDrawerName !== "";

    if (calculatorStage) {
      calculatorStage.dataset.drawerOpen = isOpen ? activeDrawerName : "false";
    }

    if (historyDrawer) {
      historyDrawer.dataset.open = String(isOpen);
      historyDrawer.dataset.view = isOpen ? activeDrawerName : "none";
    }

    syncDrawerToggle(getCollection("history"), activeDrawerName === "history");
    syncDrawerToggle(getCollection("saved"), activeDrawerName === "saved");
  }

  function setDrawerView(nextDrawerName) {
    var nextCollection = nextDrawerName ? getCollection(nextDrawerName) : null;

    closeEntryMenu();
    activeDrawerName =
      nextDrawerName && isCollectionDrawerAvailable(nextCollection)
        ? nextDrawerName
        : "";
    syncDrawerState();
  }

  function toggleDrawerView(drawerName) {
    setDrawerView(activeDrawerName === drawerName ? "" : drawerName);
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
    return calculatorCore.serializeNumber(value);
  }

  function updateDisplay() {
    syncExpressionSelection();

    var state = calculatorCore.getExpressionState(expressionInput.value);

    if (state.status === "valid") {
      lastValidValue = state.value;
      resultOutput.textContent = calculatorCore.formatNumber(state.value);
      setStatus(state.message, "success");
    } else if (state.status === "empty") {
      lastValidValue = "0";
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

  function insertEntryValue(value) {
    expressionInput.focus();
    expressionInput.setSelectionRange(savedSelectionStart, savedSelectionEnd);
    replaceSelection(value);
  }

  function removeCollectionEntry(collectionName, index) {
    var collection = getCollection(collectionName);

    if (!collection ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= collection.entries.length) {
      return;
    }

    closeEntryMenu();
    collection.entries.splice(index, 1);
    persistEntries(collection);
    renderCollection(collection);

    if (collectionName === "saved") {
      renderCollection(getCollection("history"));
    }
  }

  function clearCollection(collectionName) {
    var collection = getCollection(collectionName);
    var confirmMessage = "";
    var isConfirmed = true;

    if (!collection || collection.entries.length === 0) {
      return;
    }

    confirmMessage = collection.key === "history"
      ? "Are you sure you want to clear all history?"
      : "Are you sure you want to clear all saved items?";

    if (typeof window.confirm === "function") {
      isConfirmed = window.confirm(confirmMessage);
    }

    if (!isConfirmed) {
      return;
    }

    closeEntryMenu();
    collection.entries = [];
    persistEntries(collection);
    renderCollection(collection);

    if (collectionName === "saved") {
      renderCollection(getCollection("history"));
    }
  }

  function saveHistoryEntry(index) {
    var historyCollection = getCollection("history");
    var savedCollection = getCollection("saved");
    var entry = historyCollection.entries[index];

    if (!entry || hasSavedEntry(entry)) {
      setDrawerView("saved");
      return;
    }

    closeEntryMenu();
    savedCollection.entries.unshift(createEntryCopy(entry));
    persistEntries(savedCollection);
    renderCollection(savedCollection);
    renderCollection(historyCollection);
    setDrawerView("saved");
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
    var nextValue = calculatorCore.serializeNumber(state.value);

    addHistoryEntry(committedExpression, nextValue);
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
  function handleCollectionListClick(collectionName, event) {
    var target = event.target;

    if (!(target instanceof HTMLButtonElement) || target.disabled) {
      return;
    }

    if (isMenuToggleButton(target)) {
      openEntryMenu(collectionName, Number(target.dataset.entryIndex), target);
      return;
    }

    if (!target.dataset.entryValue) {
      return;
    }

    closeEntryMenu();
    insertEntryValue(target.dataset.entryValue);
  }

  ensureMenuPopover();

  if (menuPopover) {
    menuPopover.addEventListener("click", function (event) {
      var target = event.target;

      if (!(target instanceof HTMLButtonElement) || target.disabled) {
        return;
      }

      if (target.dataset.entryAction === "delete") {
        removeCollectionEntry(activeMenuCollectionName, activeMenuIndex);
        return;
      }

      if (target.dataset.entryAction === "save" && activeMenuCollectionName === "history") {
        saveHistoryEntry(activeMenuIndex);
      }
    });
  }

  if (historyToggle) {
    historyToggle.addEventListener("click", function () {
      toggleDrawerView("history");
    });
  }
  if (savedToggle) {
    savedToggle.addEventListener("click", function () {
      toggleDrawerView("saved");
    });
  }
  if (historyClearButton) {
    historyClearButton.addEventListener("click", function () {
      clearCollection("history");
    });
  }
  if (savedClearButton) {
    savedClearButton.addEventListener("click", function () {
      clearCollection("saved");
    });
  }
  if (historyList) {
    historyList.addEventListener("click", function (event) {
      handleCollectionListClick("history", event);
    });
    historyList.addEventListener("scroll", closeEntryMenu);
  }
  if (savedList) {
    savedList.addEventListener("click", function (event) {
      handleCollectionListClick("saved", event);
    });
    savedList.addEventListener("scroll", closeEntryMenu);
  }

  if (typeof document.addEventListener === "function") {
    document.addEventListener("click", function (event) {
      var target = event.target;

      if (menuPopover &&
        !menuPopover.hidden &&
        !isNodeWithin(target, menuPopover) &&
        !isNodeWithin(target, activeMenuToggle)) {
        closeEntryMenu();
      }
    });
  }

  if (typeof window.addEventListener === "function") {
    window.addEventListener("resize", closeEntryMenu);
  }

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

  setDrawerView("");
  loadEntries(getCollection("history"));
  loadEntries(getCollection("saved"));
  renderCollections();
  registerServiceWorker();
  syncPhoneInputMode();
  updateDisplay();
})();
