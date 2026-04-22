import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Header } from "@/components/Header";
import { CheckoutForm } from "@/components/CheckoutForm";
import { CUSTOMER_TOKEN_COOKIE, verifyCustomerToken } from "@/lib/customer-auth";

export const runtime = "nodejs";

export default async function CheckoutPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_TOKEN_COOKIE)?.value;
  const session = await verifyCustomerToken(token);
  if (!session) {
    redirect("/auth/phone?next=/checkout");
  }

  return (
    <div className="min-h-[100dvh] pb-12">
      <Header />
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="font-heading text-2xl font-bold">Checkout</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Sign in with your phone (OTP) first. Then we save your order, notify
          the restaurant, and you can track status in My orders and on WhatsApp
          when Cloud API is set up.
        </p>
        <div className="mt-8">
          <CheckoutForm />
        </div>
      </main>
    </div>
  );
}
