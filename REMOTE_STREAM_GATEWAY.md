# VIZEX Remote Stream Gateway

This is the practical first version for viewing local Dahua cameras from the public Vercel app.

## Architecture

Public app:

```text
Vercel app -> HTTPS tunnel URL -> VIZEX Dahua Gateway -> local Dahua camera
```

The Vercel app cannot reach `192.168.x.x` camera addresses directly. The gateway must run on a device inside the same local network as the cameras.

## Start the local gateway

From the project folder:

```powershell
npm run gateway
```

By default it starts on:

```text
http://127.0.0.1:8787
```

Health check:

```text
http://127.0.0.1:8787/health
```

## Optional gateway token

For public tests, set a token before starting the gateway:

```powershell
$env:GATEWAY_TOKEN="change-this-token"
npm run gateway
```

Then use the same token in the camera form field `Gateway token`.

## Public HTTPS tunnel

Expose the local gateway with a HTTPS tunnel tool, for example Cloudflare Tunnel or ngrok.

For the current prototype, the included npm fallback is:

```powershell
npm run tunnel
```

Example target for the tunnel:

```text
http://127.0.0.1:8787
```

The tunnel will give a public HTTPS URL, for example:

```text
https://example.trycloudflare.com
```

or:

```text
https://example.loca.lt
```

Use that URL in the app camera form field:

```text
Remote gateway URL
```

## Camera form fields

Use the same camera fields as before:

```text
Name
IP
Channel
User
Password
Remote gateway URL
Gateway token
```

If `Remote gateway URL` is empty, the app uses the local Vite gateway path:

```text
/api/dahua/mjpeg
```

If `Remote gateway URL` is filled, the app uses:

```text
https://your-gateway-url/api/dahua/mjpeg
```

## Notes

This is a prototype gateway for testing. Production should move camera passwords and gateway tokens out of browser-visible query strings and into a secured backend/session model.
