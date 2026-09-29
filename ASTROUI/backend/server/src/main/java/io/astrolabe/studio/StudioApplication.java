package io.astrolabe.studio;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * ASTROLABE Studio host (§25): a local, single-user Spring Boot server bound to loopback that embeds the ASTROLABE
 * harness through the Kotlin bridge, serves the Angular workspace, REST (§28) and the ASTRO-WS/1 protocol (§27).
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class StudioApplication {
    public static void main(String[] args) {
        SpringApplication app = new SpringApplication(StudioApplication.class);
        app.run(args);
    }
}
