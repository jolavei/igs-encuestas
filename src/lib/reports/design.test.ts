import { describe, it, expect } from "vitest";
import { stackPointLabels, timeAxis } from "./design";

describe("stackPointLabels", () => {
  it("con puntos separados, cada etiqueta va sobre su punto", () => {
    expect(stackPointLabels(40, 80, 5, 12)).toEqual([35, 75]);
    expect(stackPointLabels(80, 40, 5, 12)).toEqual([75, 35]);
  });

  it("con puntos cercanos, apila ambas sobre el punto superior", () => {
    expect(stackPointLabels(88, 90, 5, 12)).toEqual([71, 83]); // a está arriba: su etiqueta sube
    expect(stackPointLabels(90, 88, 5, 12)).toEqual([83, 71]);
    expect(stackPointLabels(50, 50, 5, 12)).toEqual([33, 45]);
  });

  it("tolera un mes con una sola serie", () => {
    expect(stackPointLabels(50, null, 5, 12)).toEqual([45, null]);
    expect(stackPointLabels(null, 50, 5, 12)).toEqual([null, 45]);
    expect(stackPointLabels(null, null, 5, 12)).toEqual([null, null]);
  });
});

describe("timeAxis", () => {
  it("con los datos bajo el estándar, el tope es el estándar", () => {
    expect(timeAxis([3.8, 1.9, null], 20)).toEqual({ max: 20, step: 5, ticks: [0, 5, 10, 15, 20] });
    expect(timeAxis([12], 15).max).toBe(15);
    expect(timeAxis([1.3], 10).max).toBe(10);
    expect(timeAxis([0.5], 5).max).toBe(5);
  });

  it("si un dato supera el estándar, sube lo justo para que quepa", () => {
    expect(timeAxis([22], 20).max).toBe(25);
    expect(timeAxis([31], 20).max).toBe(40);
    expect(timeAxis([20], 20).max).toBe(20); // igual al estándar: no hace falta subir
  });

  it("sin estándar se ajusta solo a los datos", () => {
    expect(timeAxis([6.2, 0.9], null).max).toBe(8);
    expect(timeAxis([28, 40], null).max).toBe(50);
    expect(timeAxis([0.6]).max).toBe(1);
  });

  it("sin datos no deja un eje vacío y tolera valores muy altos", () => {
    expect(timeAxis([], null).max).toBe(1);
    expect(timeAxis([null], 15).max).toBe(15);
    const big = timeAxis([500], null);
    expect(big.max).toBeGreaterThanOrEqual(500);
    expect(big.ticks.at(-1)).toBe(big.max);
    expect(big.ticks.length).toBeLessThanOrEqual(7);
  });
});
