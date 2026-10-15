//! Pluggable transport factory.

use std::future::Future;
use std::pin::Pin;

use crate::transport::BoxedTransport;
use crate::TransportError;

use super::types::HostId;

/// Factory that opens (or re-opens) a transport for a host.
///
/// The supervisor calls this on every connect attempt — including
/// reconnects — so consumers can refresh tokens, rotate URLs, or pick
/// different backends per attempt.
///
/// Any closure of shape `Fn(HostId) -> impl Future<Output = Result<BoxedTransport, TransportError>>`
/// implements this trait via the blanket impl below — you only need
/// to implement it manually for stateful factories.
///
/// ```no_run
/// use ahp::hosts::HostTransportFactory;
/// use ahp::transport::BoxedTransport;
/// use ahp::TransportError;
///
/// async fn open_ws(host_id: ahp::hosts::HostId) -> Result<BoxedTransport, TransportError> {
///     // Look up the URL for `host_id`, refresh tokens, etc.
///     # let _ = host_id;
///     # unimplemented!()
/// }
///
/// // `open_ws` already implements `HostTransportFactory`.
/// fn use_factory<F: HostTransportFactory>(_: F) {}
/// use_factory(open_ws);
/// ```
pub trait HostTransportFactory: Send + Sync + 'static {
    /// Connection windowing defaults. Does not enable any subscription.
    fn windowing_config(&self) -> crate::WindowingConfig {
        crate::WindowingConfig::default()
    }
    /// Open a fresh transport for `host_id`.
    ///
    /// Errors are surfaced as the host's `last_error` and trigger the
    /// reconnect schedule (or `Failed` state if reconnects are disabled
    /// or attempts are exhausted).
    fn open_transport(
        &self,
        host_id: HostId,
    ) -> Pin<Box<dyn Future<Output = Result<BoxedTransport, TransportError>> + Send + '_>>;
}

impl<F, Fut> HostTransportFactory for F
where
    F: Fn(HostId) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<BoxedTransport, TransportError>> + Send + 'static,
{
    fn open_transport(
        &self,
        host_id: HostId,
    ) -> Pin<Box<dyn Future<Output = Result<BoxedTransport, TransportError>> + Send + '_>> {
        Box::pin(self(host_id))
    }
}

pub(super) struct ConfiguredFactory {
    pub(super) inner: std::sync::Arc<dyn HostTransportFactory>,
    pub(super) windowing: crate::WindowingConfig,
}
impl HostTransportFactory for ConfiguredFactory {
    fn windowing_config(&self) -> crate::WindowingConfig {
        self.windowing.clone()
    }
    fn open_transport(
        &self,
        host_id: HostId,
    ) -> Pin<Box<dyn Future<Output = Result<BoxedTransport, TransportError>> + Send + '_>> {
        self.inner.open_transport(host_id)
    }
}
