# Team chat

Group chats and direct messages for a business's team, with one level of threads. Staff only. Clients never see it.

## Decisions
- Conversations are `group` (named, any members) or `direct` (exactly two people, one per pair).
- A thread is a set of replies to a top-level message. Replies cannot be replied to. This keeps the screen simple.
- Anyone on the team can start a direct message or a group. Managers can delete any message, and anyone can delete their own. Deleted messages stay in the database (soft delete) and show as "Message deleted".
- No editing in v1.
- Only people in a conversation can read or post in it. Every query checks the business and the membership.
- Unread count per person per conversation comes from a last-read time, not per-message flags.
- Real time without websockets: the web screen refreshes every 5 seconds while open. Phones get a push notification. A socket service can come later if polling is not enough.
- Push text is privacy safe: the conversation name and "Ana sent a message", never the message text, since it can show on a lock screen.
- People can mute a conversation. A global "message pushes off" switch exists in the database (`memberships.push_messages`) but its toggle ships with the phone app.
- Removing someone from the team does not delete their messages. Their name stays on what they wrote.

## Data
- `conversations`: workspace, kind, title, created by, last message time.
- `conversation_members`: conversation, membership, last read time, muted. Leaving sets deleted_at.
- `messages`: conversation, sender, optional parent message, body (up to 4000 characters), deleted_at.
- `memberships.push_messages`: boolean, default on.

## Not in v1
- File and photo attachments, reactions, editing, search, read receipts per person, typing indicators, @mentions.
- The phone screens. The app build comes last, and the API will be added then.
- Automatic "Everyone" membership for new hires: a manager adds them for now.
