import { beforeEach, describe, expect, it } from "vitest";

import { consumeChatReturnTo, rememberChatReturnTo } from "./return-to";

const KEY = "hc.chatReturnTo";

function navigateTo(path: string): void {
  window.history.replaceState(null, "", path);
}

describe("rememberChatReturnTo / consumeChatReturnTo", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    navigateTo("/en/works/bag");
  });

  it("stores the current path+search so Back can restore it", () => {
    navigateTo("/en/works/bag?ref=fab");
    rememberChatReturnTo();
    expect(window.sessionStorage.getItem(KEY)).toBe("/en/works/bag?ref=fab");
  });

  it("is a no-op on the chat page itself (every locale)", () => {
    navigateTo("/en/chat");
    rememberChatReturnTo();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();

    navigateTo("/ar/chat?x=1");
    rememberChatReturnTo();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();

    // /en/chat/… (the thread view) counts as the chat page too.
    navigateTo("/en/chat/some-thread");
    rememberChatReturnTo();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("consume returns the stored path exactly once", () => {
    navigateTo("/en/works");
    rememberChatReturnTo();
    expect(consumeChatReturnTo()).toBe("/en/works");
    expect(consumeChatReturnTo()).toBeNull();
  });

  it("consume returns null for a fresh tab (nothing stored)", () => {
    expect(consumeChatReturnTo()).toBeNull();
  });

  it("consume rejects absolute URLs (defensive: tampered storage)", () => {
    window.sessionStorage.setItem(KEY, "https://evil.example/x");
    expect(consumeChatReturnTo()).toBeNull();
  });
});
