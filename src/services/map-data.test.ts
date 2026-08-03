import { afterEach, describe, expect, it } from "bun:test";
import { MapDataService } from "./map-data";

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor() {
    FakeWorker.instances.push(this);
  }

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const originalWindow = globalThis.window;
const originalWorker = globalThis.Worker;

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: originalWorker,
  });
  FakeWorker.instances.length = 0;
});

describe("MapDataService diagnostics", () => {
  it("forwards data-worker diagnostic lines without consuming request responses", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: FakeWorker,
    });

    const service = new MapDataService();
    const lines: string[] = [];
    service.setDiagnosticLogCallback((line) => lines.push(line));

    FakeWorker.instances[0].emit({
      type: "DIAGNOSTIC_LOG",
      line: "[Timing][sea][overpassClient] accepted=4",
    });

    expect(lines).toEqual(["[Timing][sea][overpassClient] accepted=4"]);
  });
});
