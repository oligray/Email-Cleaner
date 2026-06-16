# Email Cleaner

A Thunderbird WebExtension for cleaning up your email folders by identifying and removing mail from repeat senders in bulk - with the option to unsubscribe.

## Features

- **Sender summary view** — groups repeat senders by domain, showing message count and total size.
- **Windowed and full scan modes** — start fast with a 6-month window, or switch to a full mailbox scan for a complete picture.
- **Message drilldown** — click any sender row to see each individual message from that sender across your entire inbox.
- **Open in Thunderbird** — click a message in the drilldown view to open it in the native Thunderbird client for review.
- **Bulk delete** — select messages and remove them in one action.
- **Unsubscribe** — button provided for emails that were received in the last 60 days


## Scan modes

The app opens in **Windowed mode** by default, which scans only the last 6 months of mail and keeps the initial load fast.

Use the **Full scan** button in the toolbar to switch to a full mailbox scan. This queries every message in your inbox regardless of date, so it will take longer on large mailboxes. Your mode preference is saved and restored the next time you open the extension.

In windowed mode you can use the **Previous** and **Next** buttons to shift the 6-month window backwards or forwards through your mail history.

When you click into a sender row, the drilldown always shows all messages from that sender across your full inbox, regardless of which mode is active.

## Usage

1. Install the extension in Thunderbird.
2. Open the extension — it loads a summary of repeat senders from the last 6 months.
3. Optionally click **Full scan** in the toolbar to scan your entire inbox instead.
4. Click a sender row to see all individual messages from that sender.
5. Select the messages you want to remove and click **Delete**.

## Development

No build step is required. The extension runs directly in Thunderbird as a WebExtension.

To package the extension for distribution, run:

```
npm run zip
```

This produces a `.zip` file ready for installation or submission.