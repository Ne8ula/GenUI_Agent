import { describe, expect, it } from "vitest";
import {
  DAILY_WEATHER_FIXTURE, E1Controller, forecastForDay, formatForecastAnswer,
  parseDailyForecast, validateDailyForecast,
} from "../../src/core";

describe("authored daily weather", () => {
  it("binds distinct dated sunny/rainy records, text and speech to one fixture", () => {
    const today = forecastForDay("today");
    const tomorrow = forecastForDay("tomorrow");
    expect(validateDailyForecast(today)).toBe(true);
    expect(validateDailyForecast(tomorrow)).toBe(true);
    expect(today).toMatchObject({ fixtureId: "W-NYC-02", date: "2026-10-14", condition: "sunny", temperatureC: 22 });
    expect(tomorrow).toMatchObject({ fixtureId: "W-NYC-02", date: "2026-10-15", condition: "rainy", temperatureC: 16 });
    expect(today.location.timezone).toBe("America/New_York");
    expect(formatForecastAnswer(tomorrow)).toBe("In this synthetic scenario, tomorrow in New York City is rainy, 16 degrees Celsius.");
    expect(Object.isFrozen(DAILY_WEATHER_FIXTURE.forecasts.today)).toBe(true);
  });

  it.each([
    { date: "2026-10-15" }, { condition: "rainy" }, { temperatureC: 16 },
    { precipitationProbabilityPercent: 85 }, { windKmh: 22 }, { day: "tomorrow" },
    { fixtureId: "W-NYC-01" }, { verified: true }, { html: "<script>bad()</script>" },
    { units: { temperature: "°F", precipitationProbability: "%", wind: "km/h" } },
    { location: { id: "nyc", label: "London", timezone: "America/New_York" } },
    { source: { kind: "live", label: "verified" } },
  ])("rejects mixed or authority-bearing daily evidence %j", (patch) => {
    const invalid = { ...forecastForDay("today"), ...patch };
    expect(parseDailyForecast(invalid)).toBeNull();
    expect(() => formatForecastAnswer(invalid as ReturnType<typeof forecastForDay>)).toThrow();
  });

  it("revises today to tomorrow without losing geometry, pins or local preferences", () => {
    const controller = new E1Controller();
    expect(controller.requestForecast("today", "NYC")).toBe(true);
    controller.move("12:00", { x: 0.72, y: 0.24 });
    controller.pin("12:00", true);
    controller.setReducedMotion(true);
    controller.setPlain(true);
    const before = controller.getSnapshot();
    expect(controller.requestForecast("tomorrow")).toBe(true);
    const after = controller.getSnapshot();
    expect(after.forecast?.date).toBe("2026-10-15");
    expect(after.fixture).toBeNull();
    expect(after.anchors).toEqual(before.anchors);
    expect(after.focus).toBe(before.focus);
    expect(after.plain).toBe(true);
    expect(after.reducedMotion).toBe(true);
    expect(after.transition.status).toBe("settled");
    expect(after.generation).toBeGreaterThan(before.generation);
    expect(after.events.at(-1)?.fixtureId).toBe("W-NYC-02");
  });

  it("rejects unknown day and does not relabel NYC after a location correction", () => {
    const controller = new E1Controller();
    controller.requestForecast("today", "NYC");
    expect(controller.requestForecast("tomorrow", "London")).toBe(false);
    expect(controller.getSnapshot().status).toBe("unavailable");
    expect(controller.requestForecast("tomorrow")).toBe(false);
    expect(controller.getSnapshot().forecast?.location.label).toBe("New York City");
    expect(controller.getSnapshot().error?.retainedFixtureId).toBe("W-NYC-02");
    expect(controller.requestForecast("yesterday" as "today", "NYC")).toBe(false);
  });

  it("stops and dismisses daily expression, rejecting old intraday scores", () => {
    const controller = new E1Controller();
    controller.request("NYC");
    const oldProposal = controller.proposeScore();
    const delayed = controller.createDelayedPatch();
    controller.requestForecast("today");
    expect(controller.acceptScore(oldProposal).accepted).toBe(false);
    expect(controller.getSnapshot().forecast?.temperatureC).toBe(22);
    controller.requestForecast("tomorrow");
    expect(controller.stop()).toBe(true);
    expect(controller.getSnapshot().transition.status).toBe("interrupted");
    expect(controller.getSnapshot().forecast?.condition).toBe("rainy");
    controller.dismiss();
    expect(controller.getSnapshot().forecast).toBeNull();
    expect(controller.getSnapshot().fixture).toBeNull();
    expect(controller.deliverDelayedPatch(delayed).accepted).toBe(false);
    expect(controller.getSnapshot().status).toBe("dismissed");
    expect(controller.completeTransition()).toBe(false);
  });

  it("keeps the legacy intraday fixture separate and usable", () => {
    const controller = new E1Controller();
    controller.requestForecast("tomorrow", "NYC");
    controller.request("NYC", "missing-cloud");
    expect(controller.getSnapshot().forecast).toBeNull();
    expect(controller.getSnapshot().fixture?.fixtureId).toBe("W-NYC-01");
    expect(controller.compare()).toBe(true);
  });
});
