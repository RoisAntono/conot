# Dashboard API Contract (v1)

Base path: `/v1`

## Response Shape

Success:
```json
{ "ok": true, "data": {} }
```

Error:
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validasi gagal."
  },
  "traceId": "..."
}
```

## Auth

`GET /auth/discord/login`  
Generate Discord OAuth login URL.  
Query:
- `redirect=true|false` (optional, redirect langsung ke Discord OAuth)
- `return_to=<url>` (optional, redirect target setelah callback sukses)

`GET /auth/discord/callback`  
OAuth callback endpoint. Mendukung:
- `mock` mode (local bootstrap)
- `discord` mode (`code` exchange ke Discord API)

`POST /auth/logout`  
Destroy current session.

`GET /auth/me`  
Return current session user + guild context. Successful authenticated requests refresh the session cookie lifetime.

## Guild

`GET /guilds`  
Return list guilds from authenticated user session.

`GET /guilds/:guildId/permissions`  
Return guild access and `MANAGE_GUILD` capability.

`GET /guilds/:guildId/discord/channels`  
Return daftar text channel Discord yang bisa dipakai wizard/settings.

`GET /guilds/:guildId/discord/roles`  
Return daftar role Discord yang bisa dipakai tracker/title watch role picker.

`POST /guilds/:guildId/youtube/resolve`  
Resolve handle/URL/channel ID YouTube menjadi channel metadata tanpa YouTube Data API.  
Body:
```json
{ "source": "@channel atau URL atau UC..." }
```

## Tracker

`GET /guilds/:guildId/trackers`

Tracker timestamp semantics:
- `configUpdatedAt`: last dashboard/command configuration change.
- `stateUpdatedAt`: last tracker runtime state write.
- `lastCheckedAt`: last successful tracker RSS/poller check.
- `lastPublishedAt` / `lastVideoPublishedAt`: published timestamp for the stored latest video.
- `updatedAt` remains for backward compatibility and should not be used for new UI labels.

`POST /guilds/:guildId/trackers`

`PATCH /guilds/:guildId/trackers/:trackerId`

`DELETE /guilds/:guildId/trackers/:trackerId`

## Title Watch

`GET /guilds/:guildId/title-watches`

Title watch timestamp semantics:
- `configUpdatedAt`: last dashboard/command configuration change.
- `stateUpdatedAt`: last title-watch runtime state write.
- `lastMatchedAt`: last time a title-watch search result/history state was matched and saved.
- `updatedAt` remains for backward compatibility and should not be used for new UI labels.

`POST /guilds/:guildId/title-watches`

`PATCH /guilds/:guildId/title-watches/:watchId`

`DELETE /guilds/:guildId/title-watches/:watchId`

## Settings

`GET /guilds/:guildId/settings`

`PATCH /guilds/:guildId/settings`

## Health / Logs / Preview

`GET /guilds/:guildId/health`

`GET /guilds/:guildId/logs?level=warn|error&scope=tracker|rss|titlewatch|preview&q=&from=<iso>&to=<iso>&limit=200`
`GET /guilds/:guildId/logs/export?format=csv|json&level=&scope=&q=&from=&to=&limit=`

`GET /guilds/:guildId/notifications?source=tracker|titlewatch&status=sent|blocked|failed&event=new|followup&q=&from=<iso>&to=<iso>&limit=200`
`GET /guilds/:guildId/notifications/export?format=csv|json&source=&status=&event=&q=&from=&to=&limit=`

`GET /guilds/:guildId/audit-logs?limit=100&action=&resourceType=&actorUserId=&q=&from=<iso>&to=<iso>`
`GET /guilds/:guildId/audit-logs/export?format=csv|json&limit=&action=&resourceType=&actorUserId=&q=&from=&to=`

`POST /guilds/:guildId/preview/send-test`

## Internal (Bot Sync)

`GET /internal/config/export`  
Requires `Authorization: Bearer <CONFIG_SERVICE_TOKEN>`.  
Optional query: `guildId` untuk export satu guild.

## Notes
- Mutating endpoints require:
  - valid session
  - guild access
  - `MANAGE_GUILD`
  - valid CSRF header token
- Endpoint mutasi (`trackers`, `title-watches`, `settings`, `preview/send-test`) dilindungi rate-limit per guild+user.
- In current MVP shell, OAuth is mock-first to unblock UI/API integration.
