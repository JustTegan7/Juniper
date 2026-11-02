# Build notes

The Evergreen Digital App Template was pulled from Grove on 2026-11-02 (Grove `main` at 423e971) and stripped to the parts every app needs. Grove itself started from the Evergreen Digital Website Template (Next.js 16, SEO setup, security headers, CI). See `docs/decisions.md`.

Removed from Grove: contacts (businesses), pipeline stages, cadence engine, tasks, activities, Today, Pipeline, Businesses, Tasks, CSV import, file uploads (Vercel Blob), undo tokens, command palette, waitlist, and Grove branding. The file upload, undo and command palette patterns are documented in decisions.md and can be copied back from Grove when an app needs them.

Improvements made in an app that every app should get (for example multi-business sign-up or an audit log) get copied back here, so the next app starts with them.
