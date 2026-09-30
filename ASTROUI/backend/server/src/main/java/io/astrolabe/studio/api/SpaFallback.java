package io.astrolabe.studio.api;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** Serves the Angular shell for the client routes of Studio 2 (section 4.3): a reloaded or bookmarked page opens the app. */
@Controller
public class SpaFallback {
    @GetMapping({"/welcome", "/new", "/t/**", "/settings", "/settings/**"})
    public String index() { return "forward:/index.html"; }
}
