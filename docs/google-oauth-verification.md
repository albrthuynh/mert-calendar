# Removing Google's unverified-app warning

The app currently requests `openid email profile` plus:

- `https://www.googleapis.com/auth/calendar.events`: read/write synchronization and guest invitations.
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`: selecting additional calendars to import.

Both Calendar scopes need to be included in the Google Auth Platform verification request. Removing them would remove existing functionality. The warning cannot be hidden by application code, and changing the audience from Testing to In production alone does not remove it.

## Verification checklist

1. Select the production OAuth project's Google Auth Platform in Google Cloud Console.
2. Complete **Branding**: accurate app name, support email, developer contact details, public homepage and privacy policy URLs. Verify ownership of the associated domains (Google Search Console). A personal hosting subdomain may complicate domain ownership verification; confirm the exact domain requirements before buying anything.
3. Ensure the public homepage identifies the application, explains calendar access, and links to its privacy policy. The policy should accurately explain Google data access, storage, sharing, retention, deletion, and Limited Use compliance. A public deletion/support process is still needed; the current Settings account tab only signs users out.
4. In **Data Access**, include exactly the scopes above. Explain why each is necessary. The existing additional-calendar import and read/write sync features justify them.
5. Prepare a demonstration video showing the OAuth consent flow and each scope's functionality. Follow the verification form's requirements for reviewer access and video visibility.
6. Configure **Audience** for external production use and submit branding/sensitive-scope verification through **Verification Center**. Respond to review requests. Approval for every requested sensitive scope is what removes the warning; normal permission consent remains.

Google's sensitive-scope verification path normally does not require enabling Cloud billing or adding a credit card. The paid external security-assessment process associated with restricted scopes is distinct. Standard Calendar API use is available at no additional cost under Google's current usage limits; domain registration and hosting are separate possible expenses. Do not enable paid services or request paid quota increases just to pursue verification.

A Workspace-internal app can qualify for a verification exception, but only for members of that organization. It is not a general solution for personal Gmail accounts. Personal-use/testing exceptions can avoid mandatory submission, but do not remove the unverified-app warning. Using `calendar.app.created` could reduce access for a different product that only manages an app-created calendar; it would not preserve this app's current primary-calendar and additional-calendar sync.

This document does not mean the app is ready to submit: public policy pages, support/deletion handling, domain ownership, and Google project configuration must be completed and verified first. No Google Console settings were changed.

## Official references

- [Sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Submit an app for verification](https://support.google.com/cloud/answer/13461325)
- [Verification FAQ](https://support.google.com/cloud/answer/13463817)
- [Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Calendar API usage and pricing](https://developers.google.com/workspace/calendar/api/guides/quota)
