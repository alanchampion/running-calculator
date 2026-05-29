const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const calculator = require("./calculator.js");
const source = fs.readFileSync(__dirname + "\\script.js", "utf8");

function createEnvironment(initialHistory, initialSaved, options) {
  const listeners = new Map();
  const environmentOptions = options || {};
  const confirmDecisions = Array.isArray(environmentOptions.confirmDecisions)
    ? environmentOptions.confirmDecisions.slice()
    : [environmentOptions.confirmResult !== false];
  const confirmCalls = [];

  function registerListener(target, type, handler) {
    if (!listeners.has(target)) {
      listeners.set(target, {});
    }

    listeners.get(target)[type] = handler;
  }

  function makeElement(id, options) {
    const element = Object.assign(
      {
        id,
        hidden: false,
        value: "",
        dataset: {},
        attributes: {},
        children: [],
        className: "",
        disabled: false,
        style: {},
        parentElement: null,
        selectionStart: 0,
        selectionEnd: 0,
        classList: { add() {}, remove() {} },
        append(...items) {
          for (const item of items) {
            if (item && typeof item === "object") {
              item.parentElement = this;
            }

            this.children.push(item);
          }
        },
        focus() {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        getBoundingClientRect() {
          return {
            top: 0,
            left: 0,
            bottom: 72,
            right: 120,
            width: 120,
            height: 72
          };
        },
        scrollIntoView() {},
        setSelectionRange(start, end) {
          this.selectionStart = start;
          this.selectionEnd = end;
        },
        addEventListener(type, handler) {
          registerListener(this, type, handler);
        },
        querySelector() {
          return makeButton();
        }
      },
      options
    );

    let textValue = "";
    Object.defineProperty(element, "textContent", {
      get() {
        return textValue;
      },
      set(value) {
        textValue = String(value);
        if (value === "") {
          this.children = [];
        }
      }
    });

    return element;
  }

  function HTMLButtonElement() {}

  function makeButton(id) {
    const button = Object.create(HTMLButtonElement.prototype);
    return Object.assign(button, makeElement(id || "button", { type: "button" }));
  }

  const elements = {
    "calculator-stage": makeElement("calculator-stage"),
    "expression-panel": makeElement("expression-panel"),
    expression: makeElement("expression"),
    result: makeElement("result"),
    "status-message": makeElement("status-message"),
    "history-drawer": makeElement("history-drawer"),
    "history-toggle": makeButton("history-toggle"),
    "history-panel": makeElement("history-panel"),
    "history-list": makeElement("history-list"),
    "history-empty": makeElement("history-empty"),
    "history-clear": makeButton("history-clear"),
    "saved-toggle": makeButton("saved-toggle"),
    "saved-panel": makeElement("saved-panel"),
    "saved-list": makeElement("saved-list"),
    "saved-empty": makeElement("saved-empty"),
    "saved-clear": makeButton("saved-clear")
  };

  const keypad = makeElement("keypad");
  keypad.querySelector = function () {
    return makeButton();
  };

  const storage = {
    data: {
      "running-calculator-history": JSON.stringify(initialHistory || []),
      "running-calculator-saved": JSON.stringify(initialSaved || [])
    },
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null;
    },
    setItem(key, value) {
      this.data[key] = String(value);
    },
    removeItem(key) {
      delete this.data[key];
    }
  };

  const context = {
    console,
    window: {
      CalculatorCore: calculator,
      matchMedia() {
        return null;
      },
      location: { hostname: "localhost", protocol: "http:" },
      addEventListener() {},
      confirm(message) {
        confirmCalls.push(message);
        return confirmDecisions.length === 0 ? true : confirmDecisions.shift();
      },
      localStorage: storage,
      setTimeout(handler) {
        handler();
        return 1;
      },
      clearTimeout() {},
      scrollTo() {},
      pageYOffset: 0
    },
    document: {
      getElementById(id) {
        return elements[id];
      },
      addEventListener(type, handler) {
        registerListener(this, type, handler);
      },
      querySelector(selector) {
        if (selector === ".keypad") {
          return keypad;
        }

        return null;
      },
      createElement(tagName) {
        return tagName === "button" ? makeButton(tagName) : makeElement(tagName);
      }
    },
    navigator: {},
    HTMLButtonElement,
    URL,
    setTimeout(handler) {
      handler();
      return 1;
    },
    clearTimeout() {},
    isFinite,
    JSON
  };

  vm.createContext(context);
  vm.runInContext(source, context);

  return { elements, listeners, storage, confirmCalls };
}

function getMenuToggle(item) {
  return item.children[0].children[1].children[0];
}

function getMenuPopover(environment) {
  const drawerChildren = environment.elements["history-drawer"].children;
  return drawerChildren[drawerChildren.length - 1];
}

function getMenuButton(environment, index) {
  return getMenuPopover(environment).children[index];
}

test("saves a history item into saved and keeps saved items insertable", function () {
  const environment = createEnvironment([
    { expression: "1+2", value: "3" },
    { expression: "4+5", value: "9" }
  ]);
  const historyClick = environment.listeners.get(environment.elements["history-list"]).click;
  const savedClick = environment.listeners.get(environment.elements["saved-list"]).click;
  const firstHistoryItem = environment.elements["history-list"].children[0];
  const menuToggle = getMenuToggle(firstHistoryItem);

  historyClick({ target: menuToggle });
  environment.listeners.get(getMenuPopover(environment)).click({
    target: getMenuButton(environment, 0)
  });

  assert.deepEqual(JSON.parse(environment.storage.data["running-calculator-saved"]), [
    { expression: "1+2", value: "3" }
  ]);
  assert.equal(environment.elements["saved-list"].children.length, 1);
  assert.equal(environment.elements["saved-panel"].hidden, false);
  assert.equal(environment.elements["history-panel"].hidden, true);

  historyClick({ target: getMenuToggle(environment.elements["history-list"].children[0]) });
  const rerenderedSaveButton = getMenuButton(environment, 0);
  assert.equal(rerenderedSaveButton.textContent, "Saved");
  assert.equal(rerenderedSaveButton.disabled, true);

  const savedResultButton = environment.elements["saved-list"].children[0].children[1];
  environment.elements.expression.value = "7*";
  environment.elements.expression.selectionStart = 2;
  environment.elements.expression.selectionEnd = 2;
  environment.listeners.get(environment.elements.expression).click({});
  savedClick({ target: savedResultButton });

  assert.equal(environment.elements.expression.value, "7*3");
});

test("deletes an individual history item and keeps insertion working", function () {
  const environment = createEnvironment([
    { expression: "1+2", value: "3" },
    { expression: "4+5", value: "9" }
  ]);
  const historyClick = environment.listeners.get(environment.elements["history-list"]).click;
  const firstItem = environment.elements["history-list"].children[0];
  const menuToggle = getMenuToggle(firstItem);

  historyClick({ target: menuToggle });
  environment.listeners.get(getMenuPopover(environment)).click({
    target: getMenuButton(environment, 1)
  });

  const savedHistory = JSON.parse(environment.storage.data["running-calculator-history"]);
  assert.deepEqual(savedHistory, [{ expression: "4+5", value: "9" }]);
  assert.equal(environment.elements["history-list"].children.length, 1);

  const remainingExpressionButton = environment.elements["history-list"].children[0].children[0].children[0];
  environment.elements.expression.value = "7*";
  environment.elements.expression.selectionStart = 2;
  environment.elements.expression.selectionEnd = 2;
  environment.listeners.get(environment.elements.expression).click({});
  historyClick({ target: remainingExpressionButton });

  assert.equal(environment.elements.expression.value, "7*4+5");
});

test("clears saved items and re-enables saving from history", function () {
  const environment = createEnvironment(
    [{ expression: "1+2", value: "3" }],
    [{ expression: "1+2", value: "3" }]
  );
  const historyClick = environment.listeners.get(environment.elements["history-list"]).click;

  historyClick({ target: getMenuToggle(environment.elements["history-list"].children[0]) });
  const initialSaveButton = getMenuButton(environment, 0);

  assert.equal(initialSaveButton.textContent, "Saved");
  assert.equal(initialSaveButton.disabled, true);

  environment.listeners.get(environment.elements["saved-clear"]).click({});

  assert.deepEqual(environment.confirmCalls, [
    "Are you sure you want to clear all saved items?"
  ]);
  assert.equal(environment.storage.data["running-calculator-saved"], undefined);
  assert.equal(environment.elements["saved-list"].children.length, 0);
  assert.equal(environment.elements["saved-empty"].hidden, false);
  assert.equal(environment.elements["saved-clear"].disabled, true);

  historyClick({ target: getMenuToggle(environment.elements["history-list"].children[0]) });
  const rerenderedSaveButton = getMenuButton(environment, 0);
  assert.equal(rerenderedSaveButton.textContent, "Save");
  assert.equal(rerenderedSaveButton.disabled, false);
});

test("clears all history and removes saved storage", function () {
  const environment = createEnvironment([
    { expression: "1+2", value: "3" }
  ]);

  environment.listeners.get(environment.elements["history-clear"]).click({});

  assert.deepEqual(environment.confirmCalls, [
    "Are you sure you want to clear all history?"
  ]);
  assert.equal(environment.storage.data["running-calculator-history"], undefined);
  assert.equal(environment.elements["history-list"].children.length, 0);
  assert.equal(environment.elements["history-empty"].hidden, false);
  assert.equal(environment.elements["history-clear"].disabled, true);
});

test("keeps entries when clear confirmation is cancelled", function () {
  const environment = createEnvironment(
    [{ expression: "1+2", value: "3" }],
    [],
    { confirmResult: false }
  );

  environment.listeners.get(environment.elements["history-clear"]).click({});

  assert.deepEqual(environment.confirmCalls, [
    "Are you sure you want to clear all history?"
  ]);
  assert.deepEqual(JSON.parse(environment.storage.data["running-calculator-history"]), [
    { expression: "1+2", value: "3" }
  ]);
  assert.equal(environment.elements["history-list"].children.length, 1);
  assert.equal(environment.elements["history-clear"].disabled, false);
});

test("history item menus render in a shared drawer popover", function () {
  const environment = createEnvironment([
    { expression: "1+2", value: "3" }
  ]);
  const historyClick = environment.listeners.get(environment.elements["history-list"]).click;
  const menuToggle = getMenuToggle(environment.elements["history-list"].children[0]);

  environment.elements["history-drawer"].getBoundingClientRect = function () {
    return { top: 0, left: 0, bottom: 420, right: 320, width: 320, height: 420 };
  };
  menuToggle.getBoundingClientRect = function () {
    return { top: 80, left: 220, bottom: 116, right: 256, width: 36, height: 36 };
  };

  historyClick({ target: menuToggle });

  const popover = getMenuPopover(environment);

  assert.equal(popover.hidden, false);
  assert.equal(popover.className, "history-drawer__menu-popover");
  assert.equal(popover.parentElement, environment.elements["history-drawer"]);
  assert.equal(menuToggle.attributes["aria-expanded"], "true");
});

test("bottom drawer menus clamp upward within the drawer viewport", function () {
  const environment = createEnvironment([], [
    { expression: "1+2", value: "3" }
  ]);
  const savedClick = environment.listeners.get(environment.elements["saved-list"]).click;
  const menuToggle = getMenuToggle(environment.elements["saved-list"].children[0]);

  environment.elements["history-drawer"].getBoundingClientRect = function () {
    return { top: 0, left: 0, bottom: 240, right: 240, width: 240, height: 240 };
  };
  menuToggle.getBoundingClientRect = function () {
    return { top: 210, left: 180, bottom: 246, right: 216, width: 36, height: 36 };
  };

  savedClick({ target: menuToggle });

  const popover = getMenuPopover(environment);

  assert.equal(popover.style.top, "132px");
});
