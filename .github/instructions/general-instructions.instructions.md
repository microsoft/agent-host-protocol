---
description: Rules for iterating on protocol types
applyTo: 'types/**/*.ts'
---

- Always prefer dispatching state actions (that can cause side effects) rather than making imperative RPC calls. For example, rather than a `sendMessage` command, we have a `session/turnStarted` message.
- If a state is invalid, it should be inexpressible. For example, don't do something like

  ```
  interface IApproval {
    denied: boolean;
    reason?: string; // only present if denied=true
  }
  ```

  Instead, use a discriminated union:

  ```
  interface IDenial {
    denied: true;
    reason: string;
  }
  interface IApproval {
    denied: false;
  }
  type IApproval = IDenial | IApproval;
  ```

  Or just inline it if it's a single property:

  ```
  interface IApproval {
    deniedReason?: string; // if present, implies denied
  }
  ```

- After making a change, always add compatibility checks to the resulting file (current tip: `types/version/v1.ts`) so that any future incompatible changes will be caught by the compiler. See [Versioning](../../docs/specification/versioning.md) for details.
- For actions or commands that could be implemented by returning an array `T[]` directly, still prefer to wrap it in `{ items: T[] }` for forward compatibility. This allows adding additional fields later without breaking the shape.
- After making your changes, check to make sure the documentation in `docs` is up to date. For significant new flows or features, consider adding new documentation for it. Note that Mermaid diagrams are allowed.
- Whenever you change or add an action, you must review the reducers in `types/reducers.ts` to see if that needs to be propagated into the state. If it does, add the appropriate logic and unit tests for it.
