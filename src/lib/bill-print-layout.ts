import {
  mergeBillPrintLayout,
  type BillPrintLayout,
  type BillPreviewSettings,
} from "@/lib/bill-preview-settings";
import type { RestaurantSettingsPayload } from "@/types/restaurant-settings";

export function billPrintLayoutFromSettings(
  settings: RestaurantSettingsPayload | null | undefined,
  origin?: string | null,
): BillPrintLayout {
  return mergeBillPrintLayout({
    preview: settings?.billPreview,
    posSettings: settings
      ? {
          displayName: settings.displayName,
          logoUrl: settings.logoUrl,
          whatsappPhoneE164: settings.whatsappPhoneE164,
        }
      : null,
    origin,
  });
}

export function billPrintPosContext(
  settings: RestaurantSettingsPayload | null | undefined,
): {
  displayName?: string;
  logoUrl?: string;
  whatsappPhoneE164?: string;
  billPreview?: BillPreviewSettings;
} | null {
  if (!settings) return null;
  return {
    displayName: settings.displayName,
    logoUrl: settings.logoUrl,
    whatsappPhoneE164: settings.whatsappPhoneE164,
    billPreview: settings.billPreview,
  };
}
