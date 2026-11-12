# strafes-bot

A Discord bot for https://strafes.fiveman1.net/ related things.

## Commands

| Command | What it does |
|---|---|
| `/verify` | Sends you (only you) a link to link your Roblox account, through the site's Roblox login |
| `/unlink` | Unlinks your Roblox account |
| `/whois [user]` | Shows which Roblox account someone has linked |

Linking goes through the site's public API ([docs](https://strafes.fiveman1.net/public-api/docs)):

1. `/verify` creates a link request and replies with its link, ephemerally.
2. The user opens it, logs in with Roblox, and confirms on the site.
3. The site sends a signed `link.completed` event to this bot's webhook server, which updates the reply and gives
   the verified role (if `VERIFIED_ROLE_ID` is set).

Unlinking doesn't take the role away: it's there to show someone verified a real account, and they did, so they can
unlink if they'd rather not stay linked.

Someone who's already linked but doesn't have the verified role (they linked before joining, say) gets it straight
from `/verify`, without linking again. Once they have it, `/verify` is how to link a different account.

With `SET_NICKNAMES=true`, it also sets people's nickname to their Roblox username in servers with the verified role
(when they link, change accounts, or get the role from `/verify`), and clears it when they unlink, unless they've
changed it since. Discord doesn't let bots rename the server owner, or anyone whose highest role is above the bot's.

Optionally, the bot also posts:

- A welcome in `WELCOME_CHANNEL_ID` when someone gets the verified role in that channel's server, with their Roblox
  headshot. Changing which account is linked doesn't welcome them again.
- A log entry in `LOG_CHANNEL_ID` for every completed link, and when `/verify` gives the role to someone already
  linked: both accounts, the account it replaced, and whether the role was given.

## Setup

1. Make an application at https://discord.com/developers/applications, and invite the bot with the `bot` and
   `applications.commands` scopes. It needs **Manage Roles** if you use `VERIFIED_ROLE_ID`, and its role has to be
   above the verified role. `SET_NICKNAMES` needs **Manage Nicknames**. For `WELCOME_CHANNEL_ID` and
   `LOG_CHANNEL_ID`, it needs **View Channel**, **Send Messages** and **Embed Links** in those channels. No privileged
   intents.
2. On the site's server, make an API key with a webhook pointing at this bot:
   ```sh
   yarn workspace server run keys create --name "strafes bot" --owner <your discord id> --permissions lookup,link --webhook http://127.0.0.1:8090/link-events
   ```
   The name is shown to users on the link page.
3. `cp .env.example .env` and fill it in.
4. ```sh
   yarn install
   yarn build
   yarn register   # after adding or changing commands
   yarn start
   ```

For development, `yarn dev` runs from source with reloading, and `yarn register:dev` registers without building. Set
`DISCORD_DEV_GUILD_ID` so commands are registered to just your test server, where they show up right away (global
commands can take a while). Point `STRAFES_API_URL` at a local site with `http://127.0.0.1:8080/public-api/v1`.

## Hosting

It runs fine next to the site: it only makes outgoing connections to Discord, and the webhook server only listens on
`127.0.0.1`.

If it ever moves to another machine, set `WEBHOOK_HOST=0.0.0.0`, put it behind https, and update the key's webhook
with `keys webhook <id> <url>` (which makes a new secret). Events are signed either way, so nothing unsigned is
trusted.
