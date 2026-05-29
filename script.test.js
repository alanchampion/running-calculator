const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const calculator = require("./calculator.js");
const source = fs.readFileSync(__dirname + "\\script.js", "utf8");

function createEnvironment(initialHistory) {
  const listeners = new Map();

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
        selectionStart: 0,
        selectionEnd: 0,
        classList: { add() {}, remove() {} },
        append(...items) {
          this.children.push(...items);
        },
        focus() {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        getBoundingClientRect() {
          return { top: 0 };
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
    "history-clear": makeButton("history-clear")
  };

  const keypad = makeElement("keypad");
  keypad.querySelector = function () {
    return makeButton();
  };

  const storage = {
    data: {
      "running-calculator-history": JSON.stringify(initialHistory)
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

  return { elements, listeners, storage };
}

test("deletes an individual history item and keeps insertion working", function () {
  const environment = createEnvironment([
    { expression: "1+2", value: "3" },
    { expression: "4+5", value: "9" }
  ]);
  const historyClick = environment.listeners.get(environment.elements["history-list"]).click;
  const firstItem = environment.elements["history-list"].children[0];
  const deleteButton = firstItem.children[0].children[1].children[1].children[0];

  historyClick({ target: deleteButton });

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

test("clears all history and removes saved storage", function () {
  const environment = createEnvironment([
    { expression: "1+2", value: "3" }
  ]);

  environment.listeners.get(environment.elements["history-clear"]).click({});

  assert.equal(environment.storage.data["running-calculator-history"], undefined);
  assert.equal(environment.elements["history-list"].children.length, 0);
  assert.equal(environment.elements["history-empty"].hidden, false);
  assert.equal(environment.elements["history-clear"].disabled, true);
});
