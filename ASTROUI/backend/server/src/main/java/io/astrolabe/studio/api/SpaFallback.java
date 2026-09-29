package io.astrolabe.studio.api;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** Serves the Angular shell for client routes (§4.1 deep links reload into the workspace). */
@Controller
public class SpaFallback {
    @GetMapping({"/new", "/p/**", "/inbox", "/activity", "/settings", "/settings/**", "/providers", "/providers/**", "/stats", "/diagnostics", "/knowledge", "/knowledge/**", "/onboarding"})
    public String index() { return "forward:/index.html"; }
}
