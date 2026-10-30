# SpendDesk Supabase Auth emails

Apply these templates in **Supabase Dashboard → Authentication → Email Templates**:

- **Confirm signup**: `ConfirmSignup.html`
- **Reset password**: `ResetPassword.html`

Set each email subject in the dashboard to:

- Confirm signup: `Confirm your SpendDesk account`
- Reset password: `Reset your SpendDesk password`

For a real SpendDesk sender (rather than Supabase's default sender), configure
**Authentication → SMTP Settings** with a verified domain/mail provider and set
the sender name to `SpendDesk`. Also add the production app URL and allowed
redirect URL under **Authentication → URL Configuration**:

`https://jeyageethan-official.github.io/spend-desk/`
