import test from "node:test";
import assert from "node:assert/strict";
import { translate, resolveLocale, locales, localeNames } from "../src/i18n/dictionary.ts";

test("every locale renders every key, and none leak the key name", () => {
  const keys = ["guest.needStaff", "queue.called", "slip.queueTicket", "call.nowCalling", "guest.total"];
  for (const locale of locales) for (const key of keys) {
    const value = translate(locale, key);
    assert.ok(value && value.length > 0, `${locale}/${key} empty`);
    assert.notEqual(value, key, `${locale}/${key} fell through to the key`);
  }
});

test("Thai and Chinese actually differ from English", () => {
  for (const key of ["queue.yourNumber", "call.nowCalling", "guest.send"]) {
    assert.notEqual(translate("th", key), translate("en", key), key);
    assert.notEqual(translate("zh", key), translate("en", key), key);
    assert.notEqual(translate("th", key), translate("zh", key), key);
  }
});

test("a browser language header picks the closest supported locale", () => {
  assert.equal(resolveLocale("th-TH,th;q=0.9,en;q=0.8"), "th");
  assert.equal(resolveLocale("zh-CN,zh;q=0.9"), "zh");
  assert.equal(resolveLocale("zh-Hant-TW"), "zh");
  assert.equal(resolveLocale("en-GB,en;q=0.9"), "en");
  assert.equal(resolveLocale("cmn-Hans"), "zh");
});

test("an explicit choice beats the header, and junk falls back to English", () => {
  assert.equal(resolveLocale("th", "zh-CN"), "th");
  assert.equal(resolveLocale(null, "zh-CN"), "zh");
  assert.equal(resolveLocale(undefined, null, ""), "en");
  assert.equal(resolveLocale("klingon"), "en");
  assert.equal(resolveLocale("../../etc/passwd"), "en");
});

test("an unsupported language falls back without throwing", () => {
  assert.equal(resolveLocale("fr-FR,fr;q=0.9"), "en");
  assert.equal(resolveLocale("ja,ko;q=0.5"), "en");
});

test("every locale has a display name", () => {
  for (const locale of locales) assert.ok(localeNames[locale]?.length);
});
