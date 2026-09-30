# Gateway

MicroMart's single REST front door. Proxies straight through to Auth/Catalog/Payment's own REST APIs where those are already complete, and translates REST into gRPC for checkout (Order) and a payment lookup (Payment) — the two places that actually demonstrate the REST -> gRPC pattern. See `setup.md`.
