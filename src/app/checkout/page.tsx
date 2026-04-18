import { Header } from "@/components/Header";
import { CheckoutForm } from "@/components/CheckoutForm";

export default function CheckoutPage() {
  return (
    <div className="min-h-[100dvh] pb-12">
      <Header />
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="font-heading text-2xl font-bold">Checkout</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          A few details — your order is sent to the restaurant on WhatsApp when
          that is configured; otherwise WhatsApp opens with your order text.
        </p>
        <div className="mt-8">
          <CheckoutForm />
        </div>
      </main>
    </div>
  );
}
