# Device row identity follows the push token, not the device_id UUID

`POST /v1/devices` uses an upsert with `ON CONFLICT (push_token) DO UPDATE SET device_id = EXCLUDED.device_id`. When a push token already exists on a different `device_id` (reinstall, token reuse), the existing row's `device_id` is overwritten rather than creating a second row.

The natural expectation is that `device_id` — a client-generated UUID — is the stable key. But APNs/FCM occasionally reissue the same push token to a fresh install, which would cause a unique-constraint violation if `device_id` were the upsert key. More importantly, push token is the operationally meaningful identifier: the worker sends notifications to tokens, not UUIDs. Keeping one row per token ensures the notification routing table stays clean.

Consequence: favorites are lost on reinstall (the new `device_id` starts with no favorites). This is an accepted MVP limitation — there are no user accounts to restore from.
