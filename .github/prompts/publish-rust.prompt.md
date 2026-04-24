---
name: publish-rust
description: Bump version and publish Rust crates to crates.io
---

Publish the Rust crates (`ahp-types`, `ahp`, `ahp-ws`) to crates.io. These live under `clients/rust/`.

## Steps

### 1. Determine the new version

- Read the current version from `clients/rust/Cargo.toml` under `[workspace.package]`.
- Ask the user what the new version should be (patch, minor, or major bump — or a specific version string).

### 2. Update the version

- Update the `version` field in `clients/rust/Cargo.toml` under `[workspace.package]`.
- Update the `version` in `[workspace.dependencies]` for both `ahp-types` and `ahp` entries (these carry an explicit version alongside their path).
- Run `cargo check --workspace` from `clients/rust/` to make sure the workspace resolves correctly.

### 3. Validate before committing

From `clients/rust/`, run:

```
cargo fmt --all -- --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
cargo publish --dry-run -p ahp-types
cargo publish --dry-run -p ahp
cargo publish --dry-run -p ahp-ws
```

All commands must pass. Fix any issues before proceeding.

### 4. Commit and tag

- Commit the version bump with message: `chore: bump rust crates to vX.Y.Z`
- Create a Git tag: `rust/vX.Y.Z` (this tag pattern triggers the publish workflow)
- Push the commit and tag: `git push origin main && git push origin rust/vX.Y.Z`

### 5. User action required

Tell the user:

> The publish workflow has been triggered. Because the `publish` job uses the **crates-io** GitHub environment, it requires manual approval.
>
> Please go to **Actions → Publish Rust Crates** on GitHub and approve the deployment when prompted. You can monitor the run at:
>
> `https://github.com/microsoft/agent-host-protocol/actions/workflows/publish-rust.yml`

### 6. Verify publication

After the user confirms the workflow completed, verify the crates are live:

```
cargo search ahp-types
cargo search ahp
cargo search ahp-ws
```

Confirm the new version appears in the search results.
