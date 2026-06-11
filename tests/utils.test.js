import test from "node:test";
import assert from "node:assert/strict";

import { CONDITIONS, DEALER_EXPORT_PLATFORMS, PLATFORM_FEES, PLATFORMS } from "../src/lib/constants.js";
import { condOf, download, escapeHtml, fmt$, fmtShort, uid } from "../src/lib/utils.js";

test("fmt$ formats values as CAD currency with two decimals", () => {
  assert.equal(fmt$(0), "$0.00 CAD");
  assert.equal(fmt$("12.5"), "$12.50 CAD");
  assert.equal(fmt$(19.999), "$20.00 CAD");
});

test("fmtShort formats values as dollar amount with two decimals", () => {
  assert.equal(fmtShort(0), "$0.00");
  assert.equal(fmtShort("5"), "$5.00");
  assert.equal(fmtShort(8.456), "$8.46");
});

test("condOf returns the matched condition when found", () => {
  const condition = condOf("mint");
  assert.equal(condition.v, "mint");
  assert.equal(condition.l, "Mint 9");
});

test("condOf falls back to near_mint for unknown values", () => {
  const condition = condOf("not-a-real-condition");
  assert.deepEqual(condition, CONDITIONS[2]);
});

test("platform metadata includes consignment dealer export support", () => {
  assert.ok(PLATFORMS.some((platform) => platform.v === "consignment"));
  assert.equal(PLATFORM_FEES.consignment, 0.20);
  assert.deepEqual(
    DEALER_EXPORT_PLATFORMS.map((platform) => platform.v),
    ["ebay", "comc", "consignment", "shopify"],
  );
});

test("uid returns a non-empty string identifier", () => {
  const id = uid();
  assert.equal(typeof id, "string");
  assert.ok(id.length > 0);
});

test("escapeHtml escapes potentially unsafe markup", () => {
  const originalDocument = globalThis.document;
  const fakeDocument = {
    createElement() {
      return {
        _text: "",
        appendChild(node) {
          this._text = String(node.textContent ?? "");
        },
        get innerHTML() {
          return this._text
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#39;");
        },
      };
    },
    createTextNode(text) {
      return { textContent: text };
    },
  };

  globalThis.document = fakeDocument;
  try {
    const escaped = escapeHtml(`<img src=x onerror='alert(1)'>`);
    assert.equal(escaped, "&lt;img src=x onerror=&#39;alert(1)&#39;&gt;");
  } finally {
    globalThis.document = originalDocument;
  }
});

test("download creates a temporary link, clicks it, and schedules URL cleanup", () => {
  const originalDocument = globalThis.document;
  const originalUrl = globalThis.URL;
  const originalSetTimeout = globalThis.setTimeout;

  const events = [];
  const fakeAnchor = {
    href: "",
    download: "",
    click() {
      events.push("click");
    },
  };

  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "a");
      return fakeAnchor;
    },
    body: {
      appendChild(node) {
        assert.equal(node, fakeAnchor);
        events.push("append");
      },
      removeChild(node) {
        assert.equal(node, fakeAnchor);
        events.push("remove");
      },
    },
  };
  globalThis.URL = {
    createObjectURL(blob) {
      assert.equal(blob.type, "text/plain");
      events.push("createObjectURL");
      return "blob:test-url";
    },
    revokeObjectURL(url) {
      assert.equal(url, "blob:test-url");
      events.push("revokeObjectURL");
    },
  };
  globalThis.setTimeout = (fn, ms) => {
    assert.equal(ms, 1000);
    events.push("setTimeout");
    fn();
    return 1;
  };

  try {
    download("hello", "report.txt", "text/plain");
    assert.equal(fakeAnchor.href, "blob:test-url");
    assert.equal(fakeAnchor.download, "report.txt");
    assert.deepEqual(events, [
      "createObjectURL",
      "append",
      "click",
      "remove",
      "setTimeout",
      "revokeObjectURL",
    ]);
  } finally {
    globalThis.document = originalDocument;
    globalThis.URL = originalUrl;
    globalThis.setTimeout = originalSetTimeout;
  }
});
