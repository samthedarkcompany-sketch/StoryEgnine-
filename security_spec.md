# Security Spec

## Data Invariants
1. A draft cannot exist without a valid userId that matches the currently authenticated user.
2. A lore item cannot exist without a valid userId that matches the currently authenticated user.
3. System fields like createdAt must match the server timestamp on creation and must never be modified thereafter.
4. updatedAt must match the server timestamp on updates.
5. Users can only read, create, update, or delete profiles, drafts, and lore that belong to them (i.e., where their document ID or `userId` matches `request.auth.uid`).

## The "Dirty Dozen" Payloads
1. Create draft with different userId
2. Create draft missing title
3. Update draft modifying createdAt
4. Update draft with wrong type for timeline
5. Add unauthorized field to draft (e.g., `isAdmin: true`)
6. List drafts without filtering by `userId == request.auth.uid`
7. Read another user's draft by knowing its draftId
8. Update another user's lore
9. Delete another user's lore
10. Update user profile to change email
11. Send payload with > 1MB string for title
12. Inject 1500-char string for document ID.

## The Test Runner
A `firestore.rules.test.ts` will verify these.
