package io.astrolabe.studio.runtime;

import io.astrolabe.studio.bridge.StudioHost;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Service;

/**
 * Owns the bridge (§25.1 `host`). Shutdown follows §25.13: the bridge cancels campaign jobs (never the cancellation
 * token, R-BE-01) so every interrupted campaign stays resumable, then closes projects and the bus.
 */
@Service
public class HostService implements DisposableBean {
    private static final Logger log = LoggerFactory.getLogger(HostService.class);
    private final StudioHost host = new StudioHost();

    public StudioHost host() { return host; }

    @Override
    public void destroy() {
        log.info("stopping campaigns (jobs cancelled; outcomes stay resumable)");
        Thread closer = Thread.ofPlatform().name("studio-host-close").start(host::close);
        try {
            closer.join(90_000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
