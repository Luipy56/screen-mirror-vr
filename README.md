# Screen Mirror VR

Web app to mirror your PC screen to your phone. On the receiver (mobile), choose **full screen** or **VR (SBS)** split view for cardboard-style headsets.

**Fully local** — no remote servers. Everything runs on your machine.

## Features

- **Screen capture** via `getDisplayMedia()` (Screen Capture API)
- **WebRTC** peer-to-peer video and audio
- **Local signaling** over WebSocket (Node.js server you run with `npm start`)
- **View modes** on mobile: Normal or VR Side-by-Side (SBS)
- **WiFi or USB tethering** — same flow; phone gets an IP and uses the URL shown in the app

## Requirements

- **Node.js** 18+
- Browser with **getDisplayMedia** and **WebRTC** (Chrome, Edge, Firefox on Windows or Linux)
- PC and phone on the **same network** (WiFi or USB tethering)

## Quick start

1. Clone and install:

   ```bash
   git clone <repo-url>
   cd screen-mirror-vr
   npm install
   ```

2. Start the server on your PC:

   ```bash
   npm start
   ```

3. **On the PC:** Open `http://localhost:3000`, click **Share screen (PC)** then **Share screen**. Accept the capture permission. The app will show a URL.

4. **On the phone** (same WiFi, or USB tethering): Open that URL in the browser (e.g. `http://192.168.1.x:3000`), click **View screen (mobile)** then **View screen**.

5. Signaling goes through the WebSocket server on your PC; video and audio are **P2P** between the two browsers. On the phone you can switch between **Normal** and **VR (SBS)** view.

No accounts or cloud backend — the only process is the one you run with `npm start`.

## Connecting the phone

- **Wireless:** PC and phone on the same WiFi. The app on the PC shows a URL with your local IP (e.g. `http://192.168.1.x:3000`). Open it in the phone’s browser.
- **Wired:** Connect the phone to the PC via USB and enable **USB tethering**. The phone gets an IP on the PC’s network; use the URL shown in the app on the PC.

## STUN / TURN (optional)

By default no STUN or TURN server is used. The app can work on the same LAN (PC and phone on the same WiFi) if the browser provides reachable ICE candidates.

If **the receiver doesn’t show the screen** (phone or second tab):

1. **Open the browser console** (F12 → Console) on both sender and receiver. You should see messages like `[Sender] Offer sent`, `[Receiver] Offer received`, `[Receiver] Answer sent`, `[Sender] Answer received`, and `Connection state: connected`. If the state stays at `checking` or goes to `failed`, it’s usually a network/NAT issue.
2. **Use STUN** so WebRTC can discover reachable addresses. Restart the server with:

   ```bash
   STUN_URL=stun:stun.l.google.com:19302 npm start
   ```

   To avoid external services, you can run your own STUN server (e.g. [coturn](https://github.com/coturn/coturn)) on your network:

   ```bash
   STUN_URL=stun:192.168.1.10:3478 npm start
   ```

   Video and audio remain P2P; STUN is only used for address discovery.

## Port

The server uses port **3000** by default. To use another:

```bash
PORT=8080 npm start
```

## License

MIT
