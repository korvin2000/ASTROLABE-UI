package io.astrolabe.studio.stats;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Map;

import io.astrolabe.studio.support.Json;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/**
 * C16 (core D-417): a subscription model's calls at its official price are nominal spend, counted in the money and
 * shown apart from paid spend; its calls without a price have no money accounting and are not an unknown price.
 */
class StatsPriceTest {
    private static JsonNode row(String profile, String charge) {
        return Json.parse("{\"profileId\":\"" + profile + "\",\"normalized\":{\"quantities\":{\"uncached_input\":1000000,\"output\":200000},\"unknown\":[]},"
            + "\"body\":" + (charge == null ? "{}" : "{\"charge\":\"" + charge + "\"}") + "}");
    }

    private static final Map<String, JsonNode> PRICES = Map.of(
        "paid", Json.parse("{\"currency\":\"USD\",\"perMillion\":{\"uncached_input\":\"1\",\"output\":\"5\"}}"),
        "plan", Json.parse("{\"currency\":\"USD\",\"perMillion\":{\"uncached_input\":\"2\",\"output\":\"10\"},\"billing\":\"plan\"}"),
        "plan-unpriced", Json.parse("{\"currency\":\"USD\",\"perMillion\":{},\"billing\":\"plan\"}"));

    @Test
    void nominalSpendIsCountedAndShownApartFromPaid() {
        StatsService.Totals total = new StatsService.Totals();
        total.add(StatsService.price(row("paid", null), PRICES));
        total.add(StatsService.price(row("plan", "nominal"), PRICES));
        JsonNode json = total.json();
        assertEquals("6", Json.text(json.get("money").get(0), "amount"));
        assertEquals("2", Json.text(json.get("paidMoney").get(0), "amount"));
        assertEquals("4", Json.text(json.get("nominalMoney").get(0), "amount"));
        assertEquals(0, json.get("unpricedCalls").asInt());
        assertEquals(true, json.get("moneyComplete").asBoolean());
    }

    @Test
    void aSubscriptionCallWithoutAPriceHasNoMoneyAccountingAndIsNotUnknown() {
        JsonNode json = StatsService.price(row("plan-unpriced", "unpriced"), PRICES).json();
        assertEquals(0, json.get("money").size());
        assertEquals(1, json.get("callsWithoutMoneyAccounting").asInt());
        assertEquals(0, json.get("unpricedCalls").asInt());
        assertEquals(1_200_000, json.get("totalTokens").asLong());
        assertEquals("priced 0 of 1 calls; 1 without money accounting", Json.text(json, "coverage"));
    }
}
