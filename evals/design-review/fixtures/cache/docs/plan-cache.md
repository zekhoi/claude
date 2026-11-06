# Plan: cache product prices

Product pages call the pricing service, which takes 40 ms. We will add a Redis cache in front of it with keys `price:{productId}` and a TTL of 24 hours. The pricing team changes prices a few times a day, and checkout reads the price from the same cache so the price the customer sees matches what they pay. When Redis is down, the service returns HTTP 503.
