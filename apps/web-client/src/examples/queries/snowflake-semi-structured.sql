-- Snowflake semi-structured data
-- VARIANT, OBJECT, ARRAY with FLATTEN, GET_PATH, colon-path access.
-- Works without any external data - uses literals.
WITH events AS (
  SELECT PARSE_JSON($${
    "user": "ada",
    "event": "purchase",
    "items": [
      {"sku": "A001", "qty": 2, "price": 19.99},
      {"sku": "B042", "qty": 1, "price": 89.00},
      {"sku": "C300", "qty": 5, "price": 4.50}
    ],
    "metadata": {
      "session": "abc-123",
      "country": "US",
      "device": {"type": "mobile", "os": "iOS"}
    }
  }$$) AS payload
)
SELECT
  -- Top-level access via colon notation (Snowflake-specific)
  payload:user::STRING        AS user_name,
  payload:event::STRING       AS event_type,
  payload:metadata.session    AS session_id,
  payload:metadata.device.os  AS device_os,

  -- Array length and item access
  ARRAY_SIZE(payload:items)   AS item_count,
  payload:items[0].sku        AS first_sku,

  -- Total via FLATTEN + aggregation
  (
    SELECT SUM(item.value:qty::NUMBER * item.value:price::NUMBER)
    FROM events,
    LATERAL FLATTEN(input => payload:items) AS item
  ) AS total_value
FROM events;
