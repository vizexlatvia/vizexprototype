# VIZEXAPP tehniskais blueprint

## 1. Produkta arhitektūras sākums

VIZEXAPP ieteicams būvēt kā SaaS platformu ar atdalītu klienta portālu un admin portālu, bet kopīgu backend/API slāni.

Galvenie slāņi:

- Klienta web panelis: tiešraides skats, ieraksti, kameru saraksts, objekti, AI notikumi, paziņojumi.
- Admin web panelis: klienti, objekti, kameras, lietotāji, serveri, plūsmu statuss, audit logs, atbalsta darbības.
- API backend: autentifikācija, lomas, datu piekļuve, kameru metadati, ierakstu meklēšana, AI notikumi.
- Video gateway slānis: RTSP/NVR/kameru pieslēgumi, WebRTC/HLS pārveide pārlūkam, stream tokeni.
- Ierakstu un failu glabāšana: NVR, lokāls serveris vai objektu glabātuve; API glabā metadatus un piekļuves tiesības.
- AI/analītikas servisi: notikumu detekcija, objekti, kustība, līnijas šķērsošana, sejas/auto numuru analītika, ja juridiski atļauts.
- Observability: health checks, serveru statuss, plūsmu statuss, kļūdu žurnāli, audit logs.

Sākuma tehnoloģiskais virziens:

- Frontend: React/Vue vai pašreizējais statiskais prototips kā UX pamats.
- Backend: Node.js/NestJS, Python/FastAPI vai .NET; svarīgi ir skaidri REST API un WebSocket/SSE statusiem.
- Datu bāze: PostgreSQL kā galvenā transakciju datu bāze.
- Cache/queue: Redis + worker queue video/AI apstrādei.
- Video: RTSP ieeja, WebRTC zemai aizturei, HLS ierakstu/mazāk kritiskai tiešraidei.
- Faili: S3-compatible storage vai klienta/NVR lokālā glabāšana ar metadatiem datu bāzē.

## 2. Lietotāji un lomas

Sistēmā jābūt vairākiem identitātes līmeņiem.

Lomas:

- `client_owner`: klienta uzņēmuma galvenais lietotājs.
- `client_user`: klienta darbinieks ar ierobežotu piekļuvi.
- `client_viewer`: tikai skatīšanās tiesības.
- `vizex_admin`: VIZEX administrators.
- `vizex_operator`: tehniskais operators/atbalsts.
- `vizex_installer`: uzstādītājs, kurš redz tikai uzticētos objektus/kameras.
- `system_service`: servisa konti integrācijām un worker procesiem.

Atļauju princips:

- Klienta lietotājs redz tikai savam klientam piesaistītos objektus un kameras.
- Admin lietotājs redz visus klientus, bet darbības tiek auditētas.
- Uzstādītājs redz tikai piešķirtos objektus un konfigurācijas, ne vienmēr ierakstu saturu.

## 3. Datu modelis

### `users`

- `id`
- `email`
- `phone`
- `full_name`
- `password_hash` vai ārējā identitātes provaidera ID
- `status`: `active`, `invited`, `suspended`, `deleted`
- `last_login_at`
- `created_at`, `updated_at`

### `roles`

- `id`
- `code`
- `name`
- `description`

### `user_roles`

- `user_id`
- `role_id`
- `client_id` opcional, ja loma attiecas uz konkrētu klientu
- `site_id` opcional, ja loma attiecas uz konkrētu objektu

### `clients`

- `id`
- `name`
- `registration_number`
- `billing_email`
- `support_contact_name`
- `support_contact_phone`
- `status`: `active`, `trial`, `paused`, `terminated`
- `plan_code`
- `created_at`, `updated_at`

### `sites`

Objekts vai lokācija, kur izvietotas kameras.

- `id`
- `client_id`
- `name`
- `address`
- `timezone`
- `status`: `active`, `maintenance`, `offline`, `archived`
- `security_level`: `standard`, `restricted`, `critical`
- `created_at`, `updated_at`

### `cameras`

- `id`
- `client_id`
- `site_id`
- `camera_number`
- `name`
- `location_label`
- `model`
- `vendor`
- `serial_number`
- `ip_address`
- `mac_address`
- `stream_profile_main_id`
- `stream_profile_sub_id`
- `status`: `online`, `offline`, `degraded`, `maintenance`, `disabled`
- `recording_enabled`
- `ai_enabled`
- `installed_at`
- `last_seen_at`
- `created_at`, `updated_at`

UI vajadzībām svarīgi: `camera_number`, `name`, `site`, `status`, `last_seen_at`, `recording_enabled`, `ai_enabled`.

### `video_streams`

- `id`
- `camera_id`
- `type`: `rtsp`, `webrtc`, `hls`, `snapshot`
- `purpose`: `live_main`, `live_sub`, `recording`, `snapshot`
- `source_url_encrypted`
- `public_playback_url` opcional, īslaicīgs/tokenizēts
- `codec`: `h264`, `h265`, `aac`
- `resolution`
- `fps`
- `bitrate_kbps`
- `status`: `active`, `unreachable`, `auth_failed`, `disabled`
- `last_checked_at`

### `recordings`

- `id`
- `camera_id`
- `site_id`
- `client_id`
- `start_at`
- `end_at`
- `duration_seconds`
- `storage_provider`: `nvr`, `local_server`, `s3`
- `storage_path`
- `thumbnail_path`
- `size_bytes`
- `recording_type`: `continuous`, `motion`, `manual`, `event`
- `status`: `available`, `processing`, `expired`, `deleted`, `missing`
- `retention_until`
- `created_at`

### `ai_events`

- `id`
- `client_id`
- `site_id`
- `camera_id`
- `event_type`: `motion`, `person`, `vehicle`, `line_crossing`, `intrusion`, `tamper`, `offline`, `custom`
- `severity`: `info`, `low`, `medium`, `high`, `critical`
- `title`
- `description`
- `occurred_at`
- `thumbnail_path`
- `clip_recording_id`
- `confidence`
- `metadata_json`
- `status`: `new`, `acknowledged`, `resolved`, `false_positive`
- `acknowledged_by`
- `acknowledged_at`

### `servers`

- `id`
- `name`
- `type`: `nvr`, `video_gateway`, `ai_worker`, `storage`, `api`
- `site_id` opcional
- `client_id` opcional
- `host`
- `region`
- `status`: `online`, `offline`, `degraded`, `maintenance`
- `cpu_load`
- `memory_usage`
- `disk_usage`
- `last_heartbeat_at`
- `created_at`, `updated_at`

### `audit_logs`

- `id`
- `actor_user_id`
- `actor_role`
- `client_id` opcional
- `site_id` opcional
- `action`: piemēram, `camera.created`, `recording.viewed`, `user.invited`, `stream.token.created`
- `entity_type`
- `entity_id`
- `ip_address`
- `user_agent`
- `metadata_json`
- `created_at`

Audit logs jāveido arī skatīšanās darbībām, ne tikai konfigurācijas izmaiņām.

## 4. Klienta paneļa API

Ieteicamais prefikss: `/api/client`.

Autentifikācija:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/refresh`

Klienta sākuma dati:

- `GET /api/client/dashboard`
- `GET /api/client/sites`
- `GET /api/client/sites/{siteId}`

Kameras:

- `GET /api/client/cameras`
- `GET /api/client/sites/{siteId}/cameras`
- `GET /api/client/cameras/{cameraId}`
- `GET /api/client/cameras/{cameraId}/status`
- `POST /api/client/cameras/{cameraId}/stream-token`
- `GET /api/client/cameras/{cameraId}/snapshot`

Ieraksti:

- `GET /api/client/recordings?cameraId=&siteId=&from=&to=&type=`
- `GET /api/client/recordings/{recordingId}`
- `POST /api/client/recordings/{recordingId}/playback-token`
- `GET /api/client/recordings/{recordingId}/download` tikai ar tiesībām

AI notikumi:

- `GET /api/client/events?siteId=&cameraId=&from=&to=&severity=&status=`
- `GET /api/client/events/{eventId}`
- `POST /api/client/events/{eventId}/acknowledge`
- `POST /api/client/events/{eventId}/resolve`

Reāllaika statuss:

- `GET /api/client/realtime` ar SSE vai WebSocket
- Notikumi: `camera.status_changed`, `ai_event.created`, `recording.ready`, `server.degraded`

## 5. Admin paneļa API

Ieteicamais prefikss: `/api/admin`.

Klienti:

- `GET /api/admin/clients`
- `POST /api/admin/clients`
- `GET /api/admin/clients/{clientId}`
- `PATCH /api/admin/clients/{clientId}`
- `POST /api/admin/clients/{clientId}/suspend`

Lietotāji:

- `GET /api/admin/users`
- `POST /api/admin/users/invite`
- `PATCH /api/admin/users/{userId}`
- `POST /api/admin/users/{userId}/reset-mfa`
- `POST /api/admin/users/{userId}/disable`

Objekti:

- `GET /api/admin/sites`
- `POST /api/admin/sites`
- `PATCH /api/admin/sites/{siteId}`
- `GET /api/admin/sites/{siteId}/health`

Kameras un plūsmas:

- `GET /api/admin/cameras`
- `POST /api/admin/cameras`
- `PATCH /api/admin/cameras/{cameraId}`
- `POST /api/admin/cameras/{cameraId}/test-connection`
- `POST /api/admin/cameras/{cameraId}/rotate-stream-secret`
- `GET /api/admin/cameras/{cameraId}/streams`
- `PATCH /api/admin/streams/{streamId}`

Serveri:

- `GET /api/admin/servers`
- `POST /api/admin/servers`
- `GET /api/admin/servers/{serverId}/health`
- `PATCH /api/admin/servers/{serverId}`

Ieraksti un glabāšana:

- `GET /api/admin/recordings`
- `GET /api/admin/storage/usage`
- `PATCH /api/admin/clients/{clientId}/retention-policy`

Audit logs:

- `GET /api/admin/audit-logs?actor=&clientId=&action=&from=&to=`

## 6. Video plūsmu integrācija

Praktiska pieeja pa posmiem:

1. Sākums: API glabā kameru un RTSP/NVR metadatus, UI rāda demo/placeholder plūsmas.
2. Video gateway: RTSP plūsma tiek pārkodēta vai pārsūtīta uz WebRTC/HLS, lai pārlūks to varētu atskaņot.
3. Tokenizēta piekļuve: frontend nekad nesaņem pastāvīgu RTSP paroli; tas saņem īslaicīgu playback/stream tokenu.
4. Health checks: backend regulāri pārbauda, vai kamera/NVR ir sasniedzama, un atjauno `status`, `last_seen_at`.
5. Multi-profile: galvenā plūsma ierakstiem, sub-stream režģa skatam, snapshot ātrai priekšskatīšanai.

Ieteikums: klienta kameru režģim izmantot zemākas kvalitātes sub-stream, bet pilnekrāna skatam main stream.

## 7. NVR un kameru sistēmas

Jāparedz integrācijas adapteru slānis:

- Hikvision adapteris.
- Dahua adapteris.
- ONVIF adapteris.
- Generic RTSP adapteris.
- NVR adapteris, ja ieraksti dzīvo NVR pusē.

Adaptera uzdevumi:

- Kameru saraksta sinhronizācija.
- Stream URL iegūšana.
- Ierakstu meklēšana pēc laika.
- Snapshot iegūšana.
- Notikumu saņemšana, ja ražotājs to atbalsta.

## 8. Ierakstu glabāšana

Atbalstāmi varianti:

- NVR glabā ierakstus, VIZEXAPP rāda metadatus un pieprasot ģenerē atskaņošanas URL.
- VIZEX serveris ieraksta plūsmas lokāli un saglabā failus.
- Mākonī/S3-compatible glabāšana ilgtermiņa arhīvam.

Jābūt retention politikai:

- pēc klienta plāna;
- pēc objekta;
- pēc kameras;
- pēc ieraksta tipa;
- juridiski sensitīviem objektiem atsevišķi.

## 9. AI un datu analītika

Sākumā AI notikumi var būt tikai simulēti UI un strukturēti datu modelī. Vēlāk tos ģenerē AI worker servisi.

Analītikas piemēri:

- cilvēku skaits zonā;
- transportlīdzekļu detekcija;
- kustība ārpus darba laika;
- līnijas šķērsošana;
- kameras aizsegšana vai signāla zudums;
- biežākie notikumi pēc objekta/kameras;
- SLA un uptime atskaites.

AI servisu arhitektūra:

- Worker saņem video fragmentu vai snapshot.
- Modelis ģenerē notikumu ar confidence un metadata.
- API saglabā `ai_events`.
- UI saņem notikumu caur realtime kanālu.

## 10. Drošība

Minimālās prasības:

- HTTPS visur.
- Īslaicīgi video tokeni.
- Šifrēti stream secreti datu bāzē.
- MFA admin lietotājiem.
- Lomu un klienta robežu pārbaude katrā API endpointā.
- Audit logs skatīšanās, lejupielādes un admin izmaiņām.
- IP allowlist iespēja adminam vai kritiskiem klientiem.
- Ierakstu lejupielāde tikai ar īpašu tiesību.

## 11. UI stāvokļi, kas jāparedz prototipā

Kamerai:

- Online.
- Offline.
- Degraded.
- Maintenance.
- Recording on/off.
- AI on/off.
- Last seen.
- Stream loading.
- Stream error.
- No permission.

Ierakstam:

- Available.
- Processing.
- Expired.
- Missing.
- Download restricted.

AI notikumam:

- New.
- Acknowledged.
- Resolved.
- False positive.
- Severity: info, low, medium, high, critical.

Objektam:

- Active.
- Maintenance.
- Offline.
- Archived.

Serverim:

- Online.
- Degraded.
- Offline.
- Maintenance.

## 12. Dati, ko nodot dizaina/prototipa pavedienam

Klienta paneļa kartēm un sarakstiem:

- Klienta nosaukums.
- Objektu saraksts: nosaukums, adrese, statuss, kameru skaits.
- Kameru saraksts: numurs, nosaukums, objekts, statuss, ieraksts ieslēgts/izslēgts, AI ieslēgts/izslēgts, pēdējais signāls.
- Tiešraides karte: kamera, statuss, snapshot/video placeholder, darbības `Atvērt`, `Ieraksti`, `Notikumi`.
- Ierakstu tabula: kamera, sākums, beigas, tips, ilgums, statuss.
- AI notikumu saraksts: tips, kamera, laiks, severity, status, thumbnail.
- Dashboard metriku piemēri: online kameras, offline kameras, šodienas notikumi, pieejamie ieraksti, sistēmas statuss.

Admin paneļa ekrāniem:

- Klientu saraksts: nosaukums, statuss, objektu skaits, kameru skaits, plāns.
- Objektu saraksts: klients, nosaukums, adrese, statuss.
- Kameru konfigurācija: IP, modelis, serial, stream statuss, ieraksts, AI.
- Serveru statuss: tips, host, CPU, RAM, disks, heartbeat.
- Audit logs: aktors, darbība, entītija, laiks, IP.

## 13. Jautājumi Gatim

- Vai VIZEXAPP sākumā būs tikai web platforma vai arī mobilā lietotne?
- Vai klienti drīkstēs lejupielādēt ierakstus, vai tikai skatīties?
- Kāds ir standarta ierakstu glabāšanas termiņš: 7, 14, 30 vai vairāk dienas?
- Kādi kameru/NVR ražotāji šobrīd ir visbiežāk izmantoti?
- Vai VIZEX grib sākumā pieslēgt reālas RTSP plūsmas vai demonstrēt prototipu ar demo video?
- Vai admin lietotājiem obligāti vajag MFA jau pirmajā versijā?
- Vai katram klientam būs viens uzņēmuma konts ar vairākiem lietotājiem?
- Vai klientam jāspēj pašam piešķirt lietotājus un tiesības?
- Vai AI analītika sākumā ir pārdošanas/prototipa funkcija vai reāla MVP prasība?
- Kādas atskaites Gatim ir svarīgākās: uptime, notikumi, objektu drošība, servisa darbi, glabāšanas izmaksas?

## 14. MVP prioritāte

Pirmajai tehniskajai versijai pietiek ar:

- autentifikāciju;
- klienta/objekta/kameras modeli;
- kameru sarakstu ar statusiem;
- demo tiešraides tokena API;
- ierakstu metadatu API;
- AI notikumu modeli un demo notikumiem;
- admin klientu/objektu/kameru pārvaldību;
- audit log sākuma versiju.

Reālu video gateway un NVR integrācijas var pieslēgt nākamajā posmā, kad ir zināmi konkrētie ražotāji, stream formāti un glabāšanas politika.
