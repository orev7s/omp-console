/** Errors raised by the OMP RPC client. Codes are stable strings. */

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export class RpcProtocolError extends RpcError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "RpcProtocolError";
  }
}

export class RpcTimeoutError extends RpcError {
  constructor(message: string, code = "timeout") {
    super(message, code);
    this.name = "RpcTimeoutError";
  }
}

export class RpcClosedError extends RpcError {
  constructor(message = "the omp process is not running") {
    super(message, "closed");
    this.name = "RpcClosedError";
  }
}