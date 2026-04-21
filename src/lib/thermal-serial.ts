/**
 * Web Serial API (Chrome/Edge, HTTPS or localhost) for raw ESC/POS to USB thermal printers.
 */

export type ThermalSerialPort = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
};

type SerialNavigator = Navigator & {
  serial: {
    requestPort: () => Promise<ThermalSerialPort>;
  };
};

export function isWebSerialSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serial" in navigator &&
    typeof (navigator as SerialNavigator).serial?.requestPort === "function"
  );
}

export async function requestThermalSerialPort(): Promise<ThermalSerialPort> {
  return (navigator as SerialNavigator).serial.requestPort();
}

export async function openThermalPort(
  port: ThermalSerialPort,
  baudRate = 9600,
): Promise<void> {
  await port.open({ baudRate });
}

export async function closeThermalPort(port: ThermalSerialPort): Promise<void> {
  try {
    await port.close();
  } catch {
    /* ignore */
  }
}

export async function writeEscPosToPort(
  port: ThermalSerialPort,
  data: Uint8Array,
): Promise<void> {
  const writable = port.writable;
  if (!writable) throw new Error("Port is not open for writing.");
  const writer = writable.getWriter();
  try {
    await writer.write(data);
  } finally {
    writer.releaseLock();
  }
}
