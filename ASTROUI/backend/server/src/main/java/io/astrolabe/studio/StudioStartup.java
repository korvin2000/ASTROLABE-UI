package io.astrolabe.studio;

import io.astrolabe.studio.campaigns.CampaignService;
import io.astrolabe.studio.live.EventPipeline;
import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.runtime.Telemetry;
import io.astrolabe.studio.support.Json;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Start sequence: subscribe the live pipeline before any campaign can run, create the demo repository in fixture
 * mode, open registered projects (ASTROLABE's project lock) and refresh the campaign index from each store.
 */
@Component
public class StudioStartup {
    private static final Logger log = LoggerFactory.getLogger(StudioStartup.class);

    private final EventPipeline pipeline;
    private final ProjectService projects;
    private final CampaignService campaigns;
    private final StudioProperties properties;
    private final Telemetry telemetry;
    private final TopicBroker broker;
    private final io.astrolabe.studio.runtime.TransportService transport;

    public StudioStartup(EventPipeline pipeline, ProjectService projects, CampaignService campaigns, StudioProperties properties, Telemetry telemetry, TopicBroker broker,
                         io.astrolabe.studio.runtime.TransportService transport) {
        this.transport = transport;
        this.pipeline = pipeline;
        this.projects = projects;
        this.campaigns = campaigns;
        this.properties = properties;
        this.telemetry = telemetry;
        this.broker = broker;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Order(0)
    public void ready() {
        pipeline.start();
        telemetry.onChange(() -> broker.publishApp("activity.changed", Json.obj().put("inFlight", telemetry.inFlight().size())));
        if (transport.demoMode()) {
            try {
                projects.ensureDemo();
            } catch (RuntimeException e) {
                log.warn("demo repository not created: {}", e.getMessage());
            }
        }
        projects.openAll();
        for (var p : projects.rows()) {
            try {
                campaigns.syncProject(p.id());
            } catch (RuntimeException e) {
                log.warn("campaign index of {} not refreshed: {}", p.name(), e.getMessage());
            }
        }
    }
}
