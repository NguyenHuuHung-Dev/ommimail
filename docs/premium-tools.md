# Premium: OTP and mailbox organization

Premium costs 2,000 VND per calendar month. The first productivity features are
OTP detection and personal mailbox groups/pins. Existing Basic capabilities stay
available. Admin accounts can also use these tools.

## Using the features

- Open a Gmail, Outlook or Temp Mail message. Premium shows an OTP card above the
  body with copy buttons for clearly identified verification codes. If no code is
  identified, the original message remains readable. Ambiguous matches are shown
  separately; code expiry is determined by the sender, not OmniMail.
- In the mailbox sidebar, use the pin icon to move a mailbox to **Đã ghim**.
- Select your mailbox, enter a group name in **Nhóm cho mailbox đang mở**, and
  choose **Lưu nhóm**. Existing groups appear as suggestions. Clear the name and
  save to remove that mailbox from its group.
- **Lọc nhóm** filters the mailbox sidebar. Groups can contain different mail
  providers. Groups and pins also work in Temp Mail.

## Access and storage

- `GET /api/messages/:id/otp` uses the same mailbox permission checks as reading
  the original message, plus a current Premium/Admin requirement. It parses
  subject/body locally on the API with no AI or external extraction service.
  Individual shared-message snapshots do not grant access to this endpoint.
- Numeric codes (4–8 digits, including leading zeroes and 3+3 grouped codes) and
  uppercase mixed alphanumeric codes (6–8 characters) require nearby verification
  wording. HTML attributes, quoted blocks, common reply delimiters and obvious
  durations/order numbers are excluded. This is heuristic; not every format is
  recognized and a match is not proof that a code is still valid.
- `GET/PUT /api/mailbox-organization` are authenticated and Premium/Admin only.
  Users can organize only mailboxes they own; this never changes sharing rights.
- Preferences are stored per mailbox under
  `users/{uid}/mailboxOrganization/{sha256(accountId)}` in Firestore. Each update
  replaces only that mailbox's group/pin, so other mailbox preferences are not
  overwritten. The latest save wins for concurrent edits of the same mailbox.
  Development without configured persistence uses process memory.
- Basic/expired users cannot read or change these preferences. Preferences remain
  stored for renewal, disconnected mailboxes are excluded, and deleting the user
  removes the collection via the existing recursive user deletion.
- The web refreshes the current role every 30 seconds while open; every API call
  independently checks the current entitlement. No new environment keys or
  Firestore client permissions are required.

Saved search filters and browser notifications are not included in this release.
