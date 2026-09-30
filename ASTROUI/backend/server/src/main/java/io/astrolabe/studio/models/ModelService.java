package io.astrolabe.studio.models;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import io.astrolabe.studio.bridge.AutoProfile;
import io.astrolabe.studio.bridge.AutoProfiles;
import io.astrolabe.studio.bridge.fixture.FixtureBrain;
import io.astrolabe.studio.runtime.TransportService;
import io.astrolabe.studio.settings.Preferences;
import io.astrolabe.studio.settings.ProfileStore;
import io.astrolabe.studio.support.Json;
import io.astrolabe.studio.support.StudioError;

import net.ai.gate.Llm;
import net.ai.gate.model.Capability;
import net.ai.gate.model.Modality;
import net.ai.gate.model.Model;
import net.ai.gate.model.ReasoningLevel;
import net.ai.gate.model.SupportLevel;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Usable models (Studio 2 §6.4, BE-3) and what happens when one is chosen (§6.5, BE-4): an automatic profile, the
 * non-billable validation, and one model serving every function. No qualification: it is billable and optional.
 */
@Service
public class ModelService {
    private static final Logger log = LoggerFactory.getLogger(ModelService.class);
    private static final Pattern REDUCED = Pattern.compile("(?i)(^|[-_./:])(mini|nano|flash|lite|small|tiny)($|[-_./:0-9])");
    private static final Set<String> EFFORTS = Set.of("low", "medium", "high");

    private final TransportService transport;
    private final ProfileStore profiles;
    private final Preferences preferences;

    public ModelService(TransportService transport, ProfileStore profiles, Preferences preferences) {
        this.transport = transport;
        this.profiles = profiles;
        this.preferences = preferences;
    }

    /** A model reference as the API carries it: `<provider>/<model id>` (model ids may contain slashes). */
    public record Ref(String provider, String model) {
        public static Ref parse(String ref) {
            if (ref == null) return null;
            int slash = ref.indexOf('/');
            if (slash <= 0 || slash == ref.length() - 1) return null;
            return new Ref(ref.substring(0, slash), ref.substring(slash + 1));
        }

        public String text() { return provider + "/" + model; }
    }

    private Llm llm() { return transport.llm(); }

    /** Text output and tool calling; no embedding, image, audio, realtime or deprecated model (§6.4). */
    static boolean usable(Model m) { return usable(m, false); }

    /**
     * [listedOnly]: the account is a local or custom server, whose listing names models and says nothing about what
     * they can do. There a model counts unless it is known to lack tool calling; calibration measures the rest.
     */
    static boolean usable(Model m, boolean listedOnly) {
        SupportLevel tools = m.capabilities().support(Capability.TOOLS);
        if (listedOnly ? tools == SupportLevel.UNSUPPORTED : tools != SupportLevel.SUPPORTED) return false;
        if (m.capabilities().support(Capability.EMBEDDINGS) == SupportLevel.SUPPORTED) return false;
        if (!m.output().isEmpty() && !m.output().equals(Set.of(Modality.TEXT))) return false;
        if (m.deprecatedAt().isPresent()) return false;
        String id = m.id().toLowerCase(Locale.ROOT);
        return !(id.contains("realtime") || id.contains("embedding") || id.contains("-tts") || id.contains("whisper") || id.contains("-live") || id.endsWith(":batch")
            || id.contains("moderation") || id.contains("guard"));
    }

    /** `included` for a subscription, `free`, `$`, `$$`, `$$$`, or null when the price is unknown. */
    static String priceMark(Model m, String accountKind) {
        if ("oauth".equals(accountKind) && m.prices().isEmpty()) return "included";
        if ("local".equals(accountKind) || "demo".equals(accountKind)) return "free";
        if (m.prices().isEmpty()) return null;
        BigDecimal in = m.prices().get().inputPerMillion().orElse(null);
        BigDecimal out = m.prices().get().outputPerMillion().orElse(null);
        if (in == null && out == null) return null;
        double blended = (in == null ? 0 : in.doubleValue()) + (out == null ? 0 : out.doubleValue()) / 4;
        if (blended == 0) return "free";
        if (blended < 1.5) return "$";
        if (blended < 8) return "$$";
        return "$$$";
    }

    /**
     * The effort [ref] works with when [wanted] is asked for: the same level if the model has it, else the nearest
     * lower one, else the nearest higher one. A model without levels, or one nobody knows, keeps what was asked.
     */
    public String fitEffort(String ref, String wanted) {
        Ref r = Ref.parse(ref);
        if (r == null || wanted == null) return wanted;
        List<String> has;
        try {
            has = efforts(llm().models().require(r.provider(), r.model()));
        } catch (RuntimeException e) {
            return wanted;
        }
        if (has.isEmpty() || has.contains(wanted)) return wanted;
        List<String> order = List.of("low", "medium", "high");
        int at = order.indexOf(wanted);
        String lower = null;
        String higher = null;
        for (String e : order) {
            if (!has.contains(e)) continue;
            if (order.indexOf(e) < at) lower = e;
            else if (higher == null) higher = e;
        }
        return lower != null ? lower : higher != null ? higher : wanted;
    }

    static List<String> efforts(Model m) {
        List<String> out = new ArrayList<>();
        for (ReasoningLevel level : m.reasoningLevels()) {
            String name = level.name().toLowerCase(Locale.ROOT);
            if (EFFORTS.contains(name)) out.add(name);
        }
        return out;
    }

    private Map<String, List<Pattern>> recommendations() {
        Map<String, List<Pattern>> out = new LinkedHashMap<>();
        try {
            Path override = transport.dataDir().resolve("recommended-models.json");
            String json;
            if (Files.isRegularFile(override)) {
                json = Files.readString(override);
            } else {
                try (var in = ModelService.class.getResourceAsStream("/recommended-models.json")) {
                    json = in == null ? "{}" : new String(in.readAllBytes(), StandardCharsets.UTF_8);
                }
            }
            JsonNode providers = Json.parse(json).path("providers");
            for (var e : providers.properties()) {
                List<Pattern> patterns = new ArrayList<>();
                for (JsonNode p : Json.each(e.getValue())) patterns.add(Pattern.compile(Pattern.quote(p.asString()).replace("*", "\\E.*\\Q")));
                out.put(e.getKey(), patterns);
            }
        } catch (java.io.IOException | RuntimeException e) {
            log.warn("recommended-models.json not read: {}", e.getMessage());
        }
        return out;
    }

    /**
     * The recommended model among [models] of one provider: the first pattern of the file that exists, else tool
     * calling and reasoning, largest context, newest, not a reduced variant unless nothing else exists.
     */
    Model recommended(String providerId, List<Model> models, Map<String, List<Pattern>> file) {
        if (models.isEmpty()) return null;
        for (Pattern p : file.getOrDefault(providerId, List.of())) {
            for (Model m : models) if (p.matcher(m.id()).matches()) return m;
        }
        Comparator<Model> order = Comparator
            .comparing((Model m) -> REDUCED.matcher(m.id()).find())
            .thenComparing(m -> m.capabilities().support(Capability.REASONING) != SupportLevel.SUPPORTED && m.reasoningLevels().isEmpty())
            .thenComparing(m -> -m.contextWindow().orElse(0))
            .thenComparing(m -> m.updatedAt().map(i -> -i.getEpochSecond()).orElse(0L))
            .thenComparing(Model::id);
        return models.stream().min(order).orElse(null);
    }

    /** One usable account as the picker needs it. */
    public record Account(String provider, String name, String kind) { }

    public ArrayNode usable(List<Account> accounts) {
        ArrayNode a = Json.arr();
        Map<String, List<Pattern>> file = recommendations();
        for (Account account : accounts) {
            List<Model> models;
            try {
                boolean listedOnly = "local".equals(account.kind()) || "custom".equals(account.kind());
                models = llm().models().all(account.provider()).stream().filter(m -> usable(m, listedOnly)).toList();
            } catch (RuntimeException e) {
                continue;
            }
            Model best = recommended(account.provider(), models, file);
            for (Model m : models) a.add(dto(m, account, best != null && best.id().equals(m.id())));
        }
        return a;
    }

    private ObjectNode dto(Model m, Account account, boolean recommended) {
        ObjectNode o = Json.obj();
        o.put("ref", new Ref(m.providerId(), m.id()).text());
        o.put("id", m.id());
        o.put("name", m.name());
        o.put("provider", account.provider());
        o.put("account", account.name());
        o.put("recommended", recommended);
        String price = priceMark(m, account.kind());
        if (price != null) o.put("price", price);
        m.contextWindow().ifPresent(c -> o.put("context", c));
        ArrayNode efforts = o.putArray("efforts");
        efforts(m).forEach(efforts::add);
        o.put("demo", FixtureBrain.PROVIDER.equals(m.providerId()));
        return o;
    }

    /** The model picked for a new connection: the recommended one of [account], or null when it lists none. */
    public String recommendedRef(Account account) {
        for (JsonNode m : usable(List.of(account))) if (m.path("recommended").asBoolean()) return Json.text(m, "ref");
        return null;
    }

    public ObjectNode describe(String ref, List<Account> accounts) {
        Ref r = Ref.parse(ref);
        if (r == null) return null;
        for (Account a : accounts) {
            if (!a.provider().equals(r.provider())) continue;
            try {
                Model m = llm().models().require(r.provider(), r.model());
                return dto(m, a, false);
            } catch (RuntimeException e) {
                return null;
            }
        }
        return null;
    }

    /** What a task runs with (§6.5): the profile id to bind as `main`, stored and validated. */
    public record Bound(String profileId, String provider, String model, boolean estimated, long contextTokens) { }

    /**
     * Makes or refreshes the automatic profile of [ref] and validates it without a billable call. A failure is
     * `model_unavailable` with the adapter's words under "Details".
     */
    public Bound bind(String ref) {
        Ref r = Ref.parse(ref);
        if (r == null) throw StudioError.of(StudioError.MODEL_UNAVAILABLE, Json.obj().put("model", String.valueOf(ref)), "not a model reference: " + ref);
        ObjectNode params = Json.obj().put("model", r.model()).put("account", r.provider());
        AutoProfile made;
        try {
            made = AutoProfiles.make(llm(), r.provider(), r.model());
        } catch (RuntimeException e) {
            throw StudioError.of(StudioError.MODEL_UNAVAILABLE, params, e.getMessage() == null ? e.toString() : e.getMessage());
        }
        if (!made.getViolations().isEmpty()) {
            throw StudioError.of(StudioError.MODEL_UNAVAILABLE, params, String.join("; ", made.getViolations()));
        }
        profiles.save(made.getId(), made.getProfileJson(), made.getEstimated() ? "estimated" : "validated", null);
        long context = Json.parse(made.getProfileJson()).path("capabilities").path("contextLimitTokens").asLong(AutoProfiles.ESTIMATED_CONTEXT);
        return new Bound(made.getId(), r.provider(), r.model(), made.getEstimated(), context);
    }

    /** Keeps the default model valid: the stored one if its account is usable, else the first recommended, else none. */
    public String ensureDefault(List<Account> accounts) {
        String current = preferences.text(Preferences.DEFAULT_MODEL);
        Ref r = Ref.parse(current);
        if (r != null && accounts.stream().anyMatch(a -> a.provider().equals(r.provider()))) return current;
        String next = null;
        for (Account a : accounts) {
            next = recommendedRef(a);
            if (next != null) break;
        }
        if (next == null ? current != null : !next.equals(current)) {
            preferences.set(Preferences.DEFAULT_MODEL, next == null ? null : Json.MAPPER.valueToTree(next));
        }
        return next;
    }
}
