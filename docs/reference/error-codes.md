# Error Codes

AHP uses [JSON-RPC 2.0](https://www.jsonrpc.org/specification) error codes. In addition to the standard JSON-RPC codes, AHP defines application-specific error codes in the `-32000` to `-32099` range.

## Standard JSON-RPC Codes

These codes are defined by the JSON-RPC 2.0 specification:

| Code | Name | Description |
|---|---|---|
| `-32700` | Parse error | Invalid JSON |
| `-32600` | Invalid request | Not a valid JSON-RPC request |
| `-32601` | Method not found | Unknown method name |
| `-32602` | Invalid params | Invalid method parameters |
| `-32603` | Internal error | Unspecified server error |

## AHP Application Codes

| Code | Name | Description |
|---|---|---|
| `-32001` | `SessionNotFound` | The referenced session URI does not exist |
| `-32002` | `ProviderNotFound` | The requested agent provider is not registered |
| `-32003` | `SessionAlreadyExists` | A session with the given URI already exists |
| `-32004` | `TurnInProgress` | The operation requires no active turn, but one is in progress |
| `-32005` | `UnsupportedProtocolVersion` | The client's protocol version is not supported by the server |
| `-32006` | `ContentNotFound` | The requested content URI does not exist |

## Error Response Format

All error responses follow the JSON-RPC 2.0 error format:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32002,
    "message": "No agent registered for provider 'unknown'",
    "data": {}
  }
}
```

The `data` field is OPTIONAL and MAY contain additional structured information about the error. Its shape is not defined by the protocol.

## Version Introduction

All error codes listed above were introduced in protocol version **1**.
