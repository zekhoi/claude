# RFC: move signup emails to a queue

## Problem

`POST /signup` sends the welcome email inline. When the email provider is slow (p99 4 s), signups time out. About 300 signups a day.

## Proposal

1. Deploy Kafka (3 brokers) and a schema registry.
2. `POST /signup` writes the user row, then publishes a `UserSignedUp` event to Kafka.
3. A new `email-service` microservice, in Go, consumes the event and calls the provider. On failure it retries immediately up to 3 times, then drops the event.
4. Build a generic event bus library so other teams can adopt it later.

## Rollout

Ship everything in one release on Friday.

## Out of scope

Monitoring.
