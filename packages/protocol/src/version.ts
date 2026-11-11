/** Protocol and product version constants. Single source of truth. */

/** HTTP API version, used in the `/v1` path prefix and in responses. */
export const API_VERSION = 1 as const;

/** WebSocket frame protocol version, carried as `v` on every frame. */
export const WS_PROTOCOL_VERSION = 1 as const;

/** Human-readable product name. */
export const PRODUCT_NAME = "OMP Console" as const;

/** Software version of the control plane. */
export const SOFTWARE_VERSION = "0.1.0" as const;

/** The HTTP path prefix for the public API. */
export const API_PREFIX = "/v1" as const;

/** The WebSocket endpoint path. */
export const WS_PATH = "/v1/ws" as const;
