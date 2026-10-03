# iPhone/PWA transfer test plan

The application contains no native iOS project. File bytes use the existing
PeerJS v2 DataChannel protocol, 64 KiB chunks and incremental SHA-256.

## Automated checks

```bash
npm ci
npm run check
npx playwright install --with-deps chromium webkit
npm run test:browser
```

`npm test` checks code validation, legacy/new URL routing, untrusted metadata,
optional wake lock failures/races and backpressure cleanup. Browser tests cover
file picking, QR invite routing, downloaded byte/hash equality, multiple files,
Android's actual POST service-worker handler, cancellation, expiration, 320px
layout, hash corruption and the 250 MiB memory-only receiver rejection.

The default browser suite uses real WebRTC and a **test-only**, same-origin
PeerJS signaling relay at localhost. It sends SDP/ICE, not file contents. The
local test server is never included in `dist/` or the production deployment.

Restricted CI can run with `BULUTSUZ_TEST_TRANSPORT=1`. This substitutes a
BroadcastChannel for the RTC transport while exercising the real PeerJS
serialization, app messages, File API, service worker and SHA-256. This cannot
verify encryption, NAT traversal, ICE, TURN, throughput or physical iPhones.
The fixture is only under `e2e/`; Vite never imports it.

## Execution record — 4 October 2026

- Unit tests: 14 passed; production build passed.
- Real RTC attempted in this workspace: signaling exchanged SDP, but Chromium
  produced no usable ICE candidates. Network-interface enumeration is restricted
  here. The real transfer test timed out; it is **not** recorded as passed.
- WebKit browser download was unavailable in this workspace. Safari/PWA device
  results below remain pending.
- Controlled-transport browser checks: 26 passed (13 desktop Chromium + 13 Chromium with iPhone viewport/user agent). Fixtures of 1, 10, 50 and 110 MiB were downloaded and SHA-256 compared; multi-file, Android POST handler, cancel/expiry, narrow layout, drag-and-drop, install-tip dismissal, oversized rejection and deliberately corrupted hash also passed. This is application/protocol validation, not a successful P2P network test.

## Physical device matrix — pending, never inferred from emulation

Run the updated deployment on both devices, keeping screens visible. Use a
non-sensitive fixture. Check downloaded bytes/SHA-256 against the original.

| Sender | Receiver | Files | Status |
| --- | --- | --- | --- |
| iPhone Safari | Android Chrome | 1 / 10 / 50 / 110 MiB | Pending real devices |
| iPhone Home Screen PWA | Android Chrome | 1 / 10 / 50 / 110 MiB | Pending real devices |
| iPhone Safari | Windows Chrome/Edge | 1 / 10 / 50 / 110 / 250 MiB | Pending real devices |
| iPhone Home Screen PWA | iPhone Safari | 1 / 10 / 50 / 110 MiB | Pending real devices |
| Android Share Target | iPhone Safari | 1 / 10 / 50 / 110 MiB | Pending real devices |
| Windows/Mac browser | iPhone Safari | 1 / 10 / 50 / 110 MiB | Pending real devices |

250 MiB **to Safari** must show the 200 MiB receiver limit, without attempting a
full-file memory allocation. 250 MiB to desktop Chromium requires a user gesture
in **Kabul et ve kaydet** to open a save picker, followed by streaming and hash
verification. Do not increase the mobile cap to claim large-file support.

For each pair verify:

1. File picker accepts PDF, image, Office, TXT and ZIP. Pick from local Files and,
   where configured, iCloud Drive/third-party providers.
2. Picking a file immediately shows its name/size and QR. QR/link recipient needs
   no app, code entry or extra confirmation for memory-safe downloads.
3. Same Wi-Fi transfer; then different Wi-Fi/mobile networks. Default deployment
   has STUN only, so cross-NAT success is not guaranteed. Repeat with configured
   TURN, inspect the relay badge, verify no central file upload exists.
4. Multiple files and manual BT code flow. Manual receive approval must still
   work; old `?join=BT-...` links must remain compatible.
5. Cancel before receiving, cancel during transfer, deny the large-file picker,
   close receiver, offline/online, Wi-Fi → mobile, signaling loss and ICE failure.
6. Background Safari, lock the screen and return. No false success. When both
   pages stay alive, reconnect the same peer and choose **Yeniden dene** on sender.
   Partial file must resume by chunk index and still pass full-file SHA-256.
7. Home Screen install, standalone display, portrait/landscape, 320px width,
   dark mode, screen reader, file name overflow and safe areas.
8. Wake lock denial/unsupported browser should not prevent transfer. A lock
   request does not override a user's manual screen lock.
9. Download/share from iPhone saves to Files where iOS supports it; clearing
   completed cards frees Blob URLs. Do not clear a file before saving it.

## Sources used for platform decisions

- [Apple Safari web app configuration](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
- [WebKit: Home Screen web APIs and icons](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [WebKit wake lock lifecycle and Home Screen fix](https://bugs.webkit.org/show_bug.cgi?id=254545)
- [WebKit user activation and sharing](https://webkit.org/blog/13862/the-user-activation-api/)
