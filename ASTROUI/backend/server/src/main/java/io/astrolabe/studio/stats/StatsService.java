package io.astrolabe.studio.stats;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import io.astrolabe.studio.campaigns.CampaignService;
import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.runtime.Telemetry;
import io.astrolabe.studio.settings.SettingsService;
import io.astrolabe.studio.support.Json;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Statistics (§16) from the `usage` table priced with the attempt's frozen price tables. Unknown stays unknown
 * (R-STA-01): a call without usage, an unpriced dimension or an unknown quantity makes money "≥" with its coverage
 * stated; currencies are never summed (R-STA-04); totals include helpers, probes, reviews and retries (R-STA-05).
 * C16 (core D-417): a subscription model's calls at its official price are nominal spend — counted in the money, shown
 * apart from paid spend; its calls without a price have no money accounting and are counted as such, not as unknown.
 */
@Service
public class StatsService {
    private final HostService hosts;
    private final ProjectService projects;
    private final CampaignService campaigns;
    private final SettingsService settings;
    private final Telemetry telemetry;
    private final JdbcTemplate jdbc;

    public StatsService(HostService hosts, ProjectService projects, CampaignService campaigns, SettingsService settings, Telemetry telemetry, JdbcTemplate jdbc) {
        this.hosts = hosts;
        this.projects = projects;
        this.campaigns = campaigns;
        this.settings = settings;
        this.telemetry = telemetry;
        this.jdbc = jdbc;
    }

    static final class Totals {
        final Map<String, Long> tokens = new TreeMap<>();
        /** Paid and nominal spend together, per currency. */
        final Map<String, BigDecimal> money = new TreeMap<>();
        /** The nominal part of [money]. */
        final Map<String, BigDecimal> nominal = new TreeMap<>();
        int calls;
        int callsWithoutUsage;
        int unpriced;
        /** Calls of a subscription model without a price (charge `unpriced`): no money accounting. */
        int withoutMoney;

        void add(Totals o) {
            o.tokens.forEach((k, v) -> tokens.merge(k, v, Long::sum));
            o.money.forEach((k, v) -> money.merge(k, v, BigDecimal::add));
            o.nominal.forEach((k, v) -> nominal.merge(k, v, BigDecimal::add));
            calls += o.calls;
            callsWithoutUsage += o.callsWithoutUsage;
            unpriced += o.unpriced;
            withoutMoney += o.withoutMoney;
        }

        private static void amounts(ArrayNode a, Map<String, BigDecimal> m) {
            m.forEach((cur, amount) -> a.addObject().put("currency", cur).put("amount", amount.setScale(4, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()));
        }

        ObjectNode json() {
            ObjectNode o = Json.obj();
            ObjectNode t = o.putObject("tokens");
            long total = 0;
            for (var e : tokens.entrySet()) {
                t.put(e.getKey(), e.getValue());
                total += e.getValue();
            }
            o.put("totalTokens", total);
            amounts(o.putArray("money"), money);
            Map<String, BigDecimal> paid = new TreeMap<>();
            money.forEach((cur, amount) -> paid.put(cur, amount.subtract(nominal.getOrDefault(cur, BigDecimal.ZERO))));
            amounts(o.putArray("paidMoney"), paid);
            amounts(o.putArray("nominalMoney"), nominal);
            o.put("calls", calls);
            o.put("callsWithoutUsage", callsWithoutUsage);
            o.put("unpricedCalls", unpriced);
            o.put("callsWithoutMoneyAccounting", withoutMoney);
            o.put("moneyComplete", callsWithoutUsage == 0 && unpriced == 0);
            o.put("coverage", "priced " + (calls - unpriced - callsWithoutUsage - withoutMoney) + " of " + calls + " calls"
                + (unpriced + callsWithoutUsage > 0 ? "; " + (unpriced + callsWithoutUsage) + " unknown" : "")
                + (withoutMoney > 0 ? "; " + withoutMoney + " without money accounting" : ""));
            return o;
        }
    }

    /** The priced totals of one campaign, by profile and by cell. */
    public ObjectNode campaign(String projectId, String work) {
        JsonNode usage = Json.parse(hosts.host().usage(projectId, work));
        Map<String, JsonNode> prices = priceTables(projectId, work);
        Totals total = new Totals();
        Map<String, Totals> byProfile = new LinkedHashMap<>();
        Map<String, Totals> byCell = new LinkedHashMap<>();
        ArrayNode calls = Json.arr();
        for (JsonNode row : usage) {
            Totals one = price(row, prices);
            total.add(one);
            byProfile.computeIfAbsent(Json.text(row, "profileId", "?"), k -> new Totals()).add(one);
            byCell.computeIfAbsent(Json.text(row, "contextId", "campaign"), k -> new Totals()).add(one);
            ObjectNode c = calls.addObject();
            c.put("invocationId", Json.text(row, "invocationId"));
            c.put("profileId", Json.text(row, "profileId"));
            c.put("contextId", Json.text(row, "contextId"));
            c.put("at", Json.text(row, "createdAt"));
            c.set("totals", one.json());
            c.set("unknown", row.path("normalized").path("unknown"));
        }
        ObjectNode o = Json.obj();
        o.put("workId", work);
        o.set("totals", total.json());
        ObjectNode bp = o.putObject("byProfile");
        byProfile.forEach((k, v) -> bp.set(k, v.json()));
        ObjectNode bc = o.putObject("byCell");
        byCell.forEach((k, v) -> bc.set(k, v.json()));
        o.set("calls", calls);
        return o;
    }

    private Map<String, JsonNode> priceTables(String projectId, String work) {
        Map<String, JsonNode> out = new HashMap<>();
        String attempt = hosts.host().attemptConfig(projectId, work);
        if (attempt != null) {
            JsonNode profiles = Json.parse(attempt).path("config").path("profiles");
            if (profiles.isObject()) for (var e : profiles.properties()) out.put(e.getKey(), e.getValue().path("priceTable"));
        }
        if (out.isEmpty()) {
            JsonNode profiles = Json.parse(settings.effectiveConfigJson(projectId, null)).path("profiles");
            if (profiles.isObject()) for (var e : profiles.properties()) out.put(e.getKey(), e.getValue().path("priceTable"));
        }
        return out;
    }

    /** One call priced with its profile's frozen table; [row] is a `usage` row whose body is the core's `CallAccount`. */
    static Totals price(JsonNode row, Map<String, JsonNode> prices) {
        Totals t = new Totals();
        t.calls = 1;
        JsonNode normalized = row.path("normalized");
        JsonNode quantities = normalized.path("quantities");
        boolean unknown = normalized.path("unknown").isArray() && !normalized.path("unknown").isEmpty();
        if (!quantities.isObject() || quantities.isEmpty()) {
            t.callsWithoutUsage = 1;
            return t;
        }
        // The core's charge of the call (C16); a row written before it has none and was paid.
        String charge = Json.text(row.path("body"), "charge", "paid");
        if ("unpriced".equals(charge)) {
            for (var e : quantities.properties()) t.tokens.merge(e.getKey(), e.getValue().asLong(), Long::sum);
            t.withoutMoney = 1;
            return t;
        }
        JsonNode table = prices.get(Json.text(row, "profileId", ""));
        String currency = table == null ? null : Json.text(table, "currency");
        BigDecimal money = BigDecimal.ZERO;
        boolean priced = table != null && currency != null && !unknown;
        for (var e : quantities.properties()) {
            long q = e.getValue().asLong();
            t.tokens.merge(e.getKey(), q, Long::sum);
            if (table == null) continue;
            JsonNode rate = table.path("perMillion").path(e.getKey());
            if (rate.isMissingNode() || rate.isNull()) {
                if (q > 0) priced = false;
                continue;
            }
            money = money.add(new BigDecimal(rate.asString()).multiply(BigDecimal.valueOf(q)).divide(BigDecimal.valueOf(1_000_000), 8, RoundingMode.HALF_UP));
        }
        if (currency != null) t.money.merge(currency, money, BigDecimal::add);
        if (currency != null && "nominal".equals(charge)) t.nominal.merge(currency, money, BigDecimal::add);
        if (!priced) t.unpriced = 1;
        return t;
    }

    /** Aggregates for `/stats?scope=campaign:W|project:P|all` (§16 panels backed by data). */
    public ObjectNode stats(String scope) {
        ObjectNode o = Json.obj();
        o.put("scope", scope == null ? "all" : scope);
        List<String[]> works = new java.util.ArrayList<>();
        if (scope != null && scope.startsWith("campaign:")) {
            String w = scope.substring("campaign:".length());
            works.add(new String[]{campaigns.projectOf(w), w});
        } else {
            String project = scope != null && scope.startsWith("project:") ? scope.substring("project:".length()) : null;
            for (JsonNode s : campaigns.list(project, true)) works.add(new String[]{Json.text(s, "projectId"), Json.text(s, "workId")});
        }
        Totals total = new Totals();
        ArrayNode perCampaign = o.putArray("campaigns");
        Map<String, Integer> outcomes = new TreeMap<>();
        Map<String, Totals> byProfile = new TreeMap<>();
        int completed = 0;
        for (String[] pw : works) {
            if (pw[0] == null || !hosts.host().isOpen(pw[0])) continue;
            ObjectNode c = campaign(pw[0], pw[1]);
            ObjectNode summary = campaigns.summary(pw[1]);
            String status = Json.text(summary, "displayStatus");
            outcomes.merge(status, 1, Integer::sum);
            if ("completed".equals(status)) completed++;
            JsonNode totals = c.get("totals");
            ObjectNode row = perCampaign.addObject();
            row.put("workId", pw[1]);
            row.put("projectId", pw[0]);
            row.put("title", Json.text(summary, "title"));
            row.put("status", status);
            row.put("demo", summary.path("demo").asBoolean(false));
            row.set("totals", totals);
            // Re-accumulate from the per-profile split so money stays per currency.
            for (var e : c.get("byProfile").properties()) {
                Totals t = fromJson(e.getValue());
                total.add(t);
                byProfile.computeIfAbsent(e.getKey(), k -> new Totals()).add(t);
            }
        }
        o.set("totals", total.json());
        ObjectNode bp = o.putObject("byProfile");
        byProfile.forEach((k, v) -> bp.set(k, v.json()));
        ObjectNode oc = o.putObject("outcomes");
        outcomes.forEach(oc::put);
        o.put("completedCampaigns", completed);
        ArrayNode cpat = o.putArray("costPerCompletedCampaign");
        final int done = completed;
        if (done > 0) total.money.forEach((cur, amount) -> cpat.addObject().put("currency", cur)
            .put("amount", amount.divide(BigDecimal.valueOf(done), 4, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString())
            .put("complete", total.unpriced == 0 && total.callsWithoutUsage == 0));
        o.set("interventions", interventions(scope));
        o.set("providerCalls", telemetry.recent(null, 100));
        return o;
    }

    private static Totals fromJson(JsonNode n) {
        Totals t = new Totals();
        for (var e : n.path("tokens").properties()) t.tokens.put(e.getKey(), e.getValue().asLong());
        for (JsonNode m : Json.each(n.get("money"))) t.money.merge(Json.text(m, "currency"), new BigDecimal(Json.text(m, "amount")), BigDecimal::add);
        for (JsonNode m : Json.each(n.get("nominalMoney"))) t.nominal.merge(Json.text(m, "currency"), new BigDecimal(Json.text(m, "amount")), BigDecimal::add);
        t.calls = n.path("calls").asInt();
        t.callsWithoutUsage = n.path("callsWithoutUsage").asInt();
        t.unpriced = n.path("unpricedCalls").asInt();
        t.withoutMoney = n.path("callsWithoutMoneyAccounting").asInt();
        return t;
    }

    private ObjectNode interventions(String scope) {
        ObjectNode o = Json.obj();
        Map<String, long[]> byKind = new TreeMap<>();
        String work = scope != null && scope.startsWith("campaign:") ? scope.substring(9) : null;
        String sql = work == null ? "SELECT kind, status, created_at, answered_at FROM decision" : "SELECT kind, status, created_at, answered_at FROM decision WHERE work_id = ?";
        Object[] args = work == null ? new Object[0] : new Object[]{work};
        jdbc.query(sql, rs -> {
            long[] agg = byKind.computeIfAbsent(rs.getString(1), k -> new long[3]);
            agg[0]++;
            String created = rs.getString(3);
            String answered = rs.getString(4);
            if (answered != null && created != null && !"policy".equals(rs.getString(2))) {
                agg[1]++;
                agg[2] += Duration.between(Instant.parse(created), Instant.parse(answered)).toSeconds();
            }
        }, args);
        byKind.forEach((k, v) -> o.putObject(k).put("count", v[0]).put("answered", v[1]).put("meanSecondsToAnswer", v[1] == 0 ? 0 : v[2] / v[1]));
        return o;
    }
}
