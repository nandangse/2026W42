"use client";
/**
 * "ADD TO YOUR DESKTOP" (Dr Raghu, 8 Sep 2026: "can you popup to 'Add to your
 * desktop', so they can put this as a shortcut app on the shortcut, then they
 * can click it and open").
 *
 * Two hundred men have no Genie login and reach this page through a link in a
 * mail. A link in a mail is lost by next month; an icon on the phone is not.
 *
 * ANDROID AND CHROME hand the page a `beforeinstallprompt` event, which can be
 * held and fired when the man presses a button of ours. That is the good case.
 *
 * IOS GIVES NOTHING. Safari has no such event and never has, so on an iPhone
 * the only honest thing is to show him the two taps: Share, then Add to Home
 * Screen. Pretending to have a button there would be a button that does
 * nothing.
 *
 * It asks ONCE. Dismissed or installed, it stays quiet — remembered in this
 * browser, because a banner that returns every visit is an advertisement.
 */
import { useEffect, useState } from "react";

const KEY = "genie-install-asked";

interface Choice { outcome: "accepted" | "dismissed" }
interface Prompt extends Event { prompt: () => Promise<void>; userChoice: Promise<Choice> }

export default function InstallPrompt() {
  const [evt, setEvt] = useState<Prompt | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    /* already installed? then there is nothing to ask */
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    let asked = "";
    try { asked = localStorage.getItem(KEY) || ""; } catch { /* private window */ }
    if (asked) return;

    const ua = navigator.userAgent || "";
    const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);
    if (isIos && isSafari) { setIos(true); setShow(true); return; }

    const onPrompt = (e: Event) => {
      e.preventDefault();                 // hold it; we fire it on his press
      setEvt(e as Prompt);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const quiet = () => {
    try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* private window */ }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div style={{
      position: "fixed", left: 12, right: 12, bottom: 84, zIndex: 60,
      background: "#fff", border: "1px solid #DCE0E8", borderRadius: 14,
      boxShadow: "0 8px 30px rgba(27,34,51,.18)", padding: 14,
      maxWidth: 520, margin: "0 auto", fontFamily: '"Source Sans 3", system-ui, sans-serif',
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/app-icon-192.png" alt="" style={{ width: 44, height: 44, borderRadius: 10, flex: "none" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, fontFamily: "Barlow, system-ui, sans-serif" }}>
            Keep Genie on your phone
          </div>
          <div style={{ fontSize: 13.5, color: "#5C6577", marginTop: 2, lineHeight: 1.45 }}>
            {ios
              ? <>Tap <b>Share</b> below, then <b>Add to Home Screen</b>. It opens straight to your sheet, without the browser.</>
              : <>Add it as an app and it opens straight to your sheet — no link to find, no browser bar.</>}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
        <button onClick={quiet} style={{
          padding: "9px 14px", borderRadius: 10, border: "1.5px solid #C5CAD6",
          background: "#fff", fontWeight: 600, fontSize: 14.5, cursor: "pointer",
        }}>
          Not now
        </button>
        {!ios && (
          <button
            onClick={async () => {
              if (!evt) return quiet();
              await evt.prompt();
              try { await evt.userChoice; } catch { /* he closed it */ }
              quiet();
            }}
            style={{
              padding: "9px 16px", borderRadius: 10, border: 0,
              background: "#E4580B", color: "#fff", fontWeight: 700, fontSize: 14.5, cursor: "pointer",
            }}>
            Add to home screen
          </button>
        )}
      </div>
    </div>
  );
}
