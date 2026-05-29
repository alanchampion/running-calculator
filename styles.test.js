const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("history panels stay hidden when the hidden attribute is present", function () {
  const styles = fs.readFileSync(__dirname + "\\styles.css", "utf8");

  assert.match(
    styles,
    /\.history-panel\[hidden\]\s*\{\s*display:\s*none;\s*\}/
  );
});

test("history drawer content stays pinned to the top", function () {
  const styles = fs.readFileSync(__dirname + "\\styles.css", "utf8");

  assert.match(
    styles,
    /\.history-panel\s*\{[\s\S]*grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\);[\s\S]*min-height:\s*0;[\s\S]*align-content:\s*start;[\s\S]*\}/
  );
  assert.match(
    styles,
    /\.history-list\s*\{[\s\S]*min-height:\s*0;[\s\S]*align-content:\s*start;[\s\S]*grid-auto-rows:\s*max-content;[\s\S]*\}/
  );
});

test("history clear action is anchored in the top right of the panel header", function () {
  const styles = fs.readFileSync(__dirname + "\\styles.css", "utf8");

  assert.match(
    styles,
    /\.history-panel__header\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;[\s\S]*align-items:\s*start;[\s\S]*\}/
  );
  assert.match(
    styles,
    /\.history-panel__action\s*\{[\s\S]*justify-self:\s*end;[\s\S]*align-self:\s*start;[\s\S]*\}/
  );
});

test("history item menus overlay cards instead of resizing them", function () {
  const styles = fs.readFileSync(__dirname + "\\styles.css", "utf8");

  assert.match(
    styles,
    /\.history-drawer__menu-popover\s*\{[\s\S]*position:\s*absolute;[\s\S]*z-index:\s*5;[\s\S]*\}/
  );
  assert.match(
    styles,
    /\.history-drawer__menu-popover\[hidden\]\s*\{[\s\S]*display:\s*none;[\s\S]*\}/
  );
  assert.match(
    styles,
    /\.history-list__menu-toggle\s*\{[\s\S]*border:\s*none;[\s\S]*\}/
  );
});

test("saved item names use a dedicated compact label style", function () {
  const styles = fs.readFileSync(__dirname + "\\styles.css", "utf8");

  assert.match(
    styles,
    /\.history-list__name\s*\{[\s\S]*color:\s*var\(--accent\);[\s\S]*font-size:\s*0\.82rem;[\s\S]*font-weight:\s*700;[\s\S]*\}/
  );
});
