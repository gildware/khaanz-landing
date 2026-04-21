/** 24h times as "HH:mm" (e.g. 11:00, 23:00) */
export interface TimeRange {
  start: string;
  end: string;
}

export interface PaymentMethodConfig {
  id: string;
  name: string;
}

export interface RestaurantSettingsPayload {
  /** Shown in admin and optional storefront; empty uses bundled default name. */
  displayName: string;
  /** Public path (e.g. /brand/logo.png) or absolute URL; empty uses bundled default logo. */
  logoUrl: string;
  /** WhatsApp Business number: digits only with country code, no + (e.g. 919876543210) */
  whatsappPhoneE164: string;
  pickup: TimeRange;
  delivery: TimeRange;
  /** Printed above line items on POS bill / KOT header context */
  billHeader: string;
  /** Printed below total on POS bill */
  billFooter: string;
  /** Configurable payment options for POS */
  paymentMethods: PaymentMethodConfig[];
}

/** Public GET /api/settings — excludes bill copy and payment config. */
export type PublicRestaurantSettings = Pick<
  RestaurantSettingsPayload,
  | "displayName"
  | "logoUrl"
  | "whatsappPhoneE164"
  | "pickup"
  | "delivery"
> & {
  /** True when WhatsApp Cloud API env is set; wa.me fallback is not required for notify. */
  whatsappCloudConfigured: boolean;
};

export type FulfillmentMode = "pickup" | "delivery" | "dine_in";
