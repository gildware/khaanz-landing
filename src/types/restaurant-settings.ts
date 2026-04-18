/** 24h times as "HH:mm" (e.g. 11:00, 23:00) */
export interface TimeRange {
  start: string;
  end: string;
}

export interface RestaurantSettingsPayload {
  /** WhatsApp Business number: digits only with country code, no + (e.g. 919876543210) */
  whatsappPhoneE164: string;
  pickup: TimeRange;
  delivery: TimeRange;
}

export type FulfillmentMode = "pickup" | "delivery";
