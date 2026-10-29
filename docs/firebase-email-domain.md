# Firebase verification email delivery

The browser calls Firebase Auth `sendEmailVerification` with the verified return domain `https://omnimail.io.vn/verify-email`. A successful request means Firebase accepted the request; it does not prove Gmail delivered the email. The application keeps unverified accounts outside the workspace, including when email delivery fails.

The sender display name and public-facing app name are **OmniMail**. The custom sender domain was verified and applied on 2026-10-29; new authentication emails use `noreply@omnimail.io.vn`. The former default sender was `noreply@ommimail.firebaseapp.com`.

## Sender domain setup

These records were read from the project's Firebase Authentication → Templates → Custom domain instructions for `omnimail.io.vn`. The domain uses Tenten nameservers.

| Type  | Host in the `omnimail.io.vn` DNS zone | Value                                                    |
| ----- | ------------------------------------- | -------------------------------------------------------- |
| TXT   | `@`                                   | `v=spf1 include:_spf.firebasemail.com ~all`              |
| TXT   | `@`                                   | `firebase=ommimail`                                      |
| CNAME | `firebase1._domainkey`                | `mail-omnimail-io-vn.dkim1._domainkey.firebasemail.com.` |
| CNAME | `firebase2._domainkey`                | `mail-omnimail-io-vn.dkim2._domainkey.firebasemail.com.` |

If the domain already has an SPF TXT record, merge the Firebase include into that record rather than adding a second SPF record. Keep existing web hosting and MX records.

All four records are published. Firebase successfully verified the domain and the configuration has `customDomain: "omnimail.io.vn"` and `useCustomDomain: true`. If setting this up again, verify the domain in Firebase Authentication → Templates after publishing the records, then apply the verified domain. DNS changes alone do not activate the sender domain. Firebase notes that verification can take up to 48 hours.

Check the published records, send a verification email to a real controlled Gmail inbox, check Inbox and Spam, then click its verification link and confirm the account can enter the app. Do not mark accounts verified through the Admin SDK as a delivery workaround.

Validation on 2026-10-29: an actual SDK verification request delivered an email from `noreply@omnimail.io.vn` with the subject `Xác minh email của bạn cho OmniMail`; its verification link successfully verified a disposable test identity. The user also confirmed receiving the Gmail delivery test in Inbox. All disposable Firebase identities and test inboxes were removed afterwards.

## Troubleshooting

- The verification page distinguishes a new send request from a cooldown; returning during the cooldown does not claim that another email was sent.
- A failed initial send keeps the newly created account on the verification page. It retains the error and offers a manual retry instead of asking the user to register again.
- Network failures, rate limits, daily quota errors and invalid email sender/return URL configuration have separate messages.
- Search new emails in Gmail using `in:anywhere from:noreply@omnimail.io.vn`. Older emails may still use `noreply@ommimail.firebaseapp.com`.
- If authenticated-domain emails still do not arrive, investigate delivery with Firebase Support or use an authenticated transactional SMTP provider configured in Firebase. Sender-domain verification improves authentication; it is not a guarantee of inbox placement.

References: [Firebase email templates](https://support.google.com/firebase/answer/7000714), [sending limits](https://firebase.google.com/docs/auth/limits).
