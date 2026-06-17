# Email Cleaner

A Mozilla Thunderbird Add-on for cleaning up your email folders by identifying and removing mail from repeat senders in bulk - with the option to unsubscribe. 

**Security note:** Your mailbox authentication is handled entirely by Thunderbird. This Add-on has no access to your username and password and will only delete (or send unsubscribe emails) which you tell it to.

## Features

- **Sender summary view** — groups repeat senders by domain, showing message count and total size.
- **Windowed and full scan modes** — start fast with a 6-month window, or switch to a full mailbox scan for a complete picture.
- **Message drilldown** — click any sender row to see each individual message from that sender across your entire inbox.
- **Open in Thunderbird** — click a message in the drilldown view to open it in the native Thunderbird client for review.
- **Bulk delete** — select messages and remove them in one action.
- **Unsubscribe** — simple one-click (sometimes two!) to unsubscribe when the last email was received < 60 days


## Scan modes

The app opens in **Windowed mode** by default, which scans only the last 6 months of mail and keeps the initial load fast.

Use the **Full scan** button in the toolbar to switch to a full mailbox scan. This queries every message in your inbox regardless of date, so it will take longer on large mailboxes. Your mode preference is saved and restored the next time you open the extension.

In windowed mode you can use the **Previous** and **Next** buttons to shift the 6-month window backwards or forwards through your mail history.

When you click into a sender row, the drilldown always shows all messages from that sender across your full inbox, regardless of which mode is active.

## Usage

### Install the Add-on
* Download `cleaner.zip` from the [release](release/) folder.
* In Thunderbird, go to **Tools > Developer Tools > Debug Add-ons**.
* Click **Load Temporary Add-on** and select the zip file (for personal usage). 
* _Alternatively if you wish to update the code, select the `manifest.json` and use **reload** to see any changes you make._

### User Guide
* Click the **Email Cleaner** button on the right of the top toolbar to select a mailbox and folder to review - the app will then load a summary of repeat senders from the last 6 months.
* Optionally click **Full scan** in the toolbar to scan your entire Inbox. **Note:** this has been tested against a 12GB mailbox so far - YMMV!
* Click a sender row to see all individual messages from that sender.
* Select/Deselect messages and click **Delete** when you are ready.

#### Optional features
* Use the **Unsubscribe** button to stop future email from that sender _(uses Unsubscribe info from the newest email in the group)_
* Clicking on a message will open it in Thunderbird to view the contents
* **History** provides a log of emails deleted/kept this session. The idea was to use this data to further automate the keep/delete process in future. _Note:_ you should not rely on this data to persist since it uses local storage and will be lost if the Extension is removed (reload is safe)

## Support

If you find this Thunderbird extension useful and would like to buy me a coffee, you can do so on Ko-fi - thank you!

https://ko-fi.com/oligray

## Development

No build step is required. The extension runs directly in Thunderbird as an Add-on.

To package the extension for distribution, run:

```
npm run zip
```

This produces `release/cleaner.zip`.