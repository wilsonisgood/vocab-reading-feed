import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, RF_SCHEMA } from "../../src/core/types";

describe("types", () => {
  it("has sane defaults", () => {
    expect(RF_SCHEMA).toBe(1);
    expect(DEFAULT_SETTINGS.playMode).toBe("toEnd");
  });
});
